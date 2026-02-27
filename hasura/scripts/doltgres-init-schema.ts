/**
 * Initialize Doltgres schema from RDS.
 *
 * Logical replication does NOT replicate DDL. This script:
 * 1. pg_dump --schema-only from RDS (via SSM tunnel on localhost:15432)
 * 2. pg_dump --data-only (excluding schema_migrations) for initial data
 * 3. Applies both to Doltgres "postgres" database (via SSM tunnel on localhost:25432)
 *
 * NOTE: Doltgres replicator hardcodes self-connection to the "postgres" database,
 * so all replicated tables must live there — not in a separate "banyan" database.
 *
 * After running this script:
 * 1. Drop any existing replication slot: SELECT pg_drop_replication_slot('doltgres_pub');
 * 2. Create a new slot at current LSN: SELECT * FROM pg_create_logical_replication_slot('doltgres_pub', 'pgoutput');
 * 3. Force restart the Doltgres ECS task to pick up the new slot
 *
 * Prerequisites:
 *   - RDS tunnel running: bun run hasura:tunnel        (localhost:15432)
 *   - Doltgres tunnel running: bun run doltgres:tunnel (localhost:25432)
 *   - pg_dump installed (brew install postgresql@17)
 */

import { getDbUrl, getDoltgresUrl, getPgDumpPath } from "../lib/db.ts";
import { execFileSync } from "child_process";

async function main() {
  const pgDump = getPgDumpPath();
  if (!pgDump) {
    console.error("pg_dump not found. Install with: brew install postgresql@17");
    process.exit(1);
  }

  const psqlPath = pgDump.replace("pg_dump", "psql");
  console.log(`Using pg_dump: ${pgDump}`);
  console.log(`Using psql: ${psqlPath}`);

  // Get connection URLs (rewritten for tunnel)
  const rdsUrl = await getDbUrl({ tunnel: true });
  const doltgresUrl = await getDoltgresUrl({ tunnel: true });

  // Step 1: Dump schema from RDS
  console.log("\n[1/4] Dumping schema from RDS...");
  const schemaDdl = execFileSync(pgDump, [
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--no-comments",
    "--no-publications",
    "--no-subscriptions",
    rdsUrl,
  ], { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
  console.log(`  Schema DDL: ${schemaDdl.length} bytes`);

  // Step 2: Apply schema to Doltgres
  console.log("[2/4] Applying schema to Doltgres...");
  execFileSync(psqlPath, [doltgresUrl], {
    input: schemaDdl,
    stdio: ["pipe", "inherit", "inherit"],
  });
  console.log("  Schema applied.");

  // Step 3: Dump data from RDS (excluding schema_migrations)
  console.log("[3/4] Dumping data from RDS...");
  const dataSql = execFileSync(pgDump, [
    "--data-only",
    "--no-owner",
    "--no-privileges",
    "--exclude-table=schema_migrations",
    rdsUrl,
  ], { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 });
  console.log(`  Data SQL: ${dataSql.length} bytes`);

  // Step 4: Apply data to Doltgres
  if (dataSql.trim().length > 0) {
    console.log("[4/4] Loading initial data into Doltgres...");
    execFileSync(psqlPath, [doltgresUrl], {
      input: dataSql,
      stdio: ["pipe", "inherit", "inherit"],
    });
    console.log("  Data loaded.");
  } else {
    console.log("[4/4] No data to load (empty database).");
  }

  console.log("\nDone. Doltgres schema and data initialized from RDS.");
  console.log("Logical replication will handle ongoing changes.");
}

main().catch((err) => {
  console.error("Failed to initialize Doltgres schema:", err);
  process.exit(1);
});
