import { execFileSync } from "child_process";
import { readdirSync, readFileSync } from "fs";
import { getDbUrl, getDoltgresUrl, getPgDumpPath } from "../lib/db.ts";

const MIGRATIONS_DIR = "hasura/db/migrations";
const SCHEMA_FILE = "hasura/db/schema.sql";

const args = process.argv.slice(2);
const useTunnel = args.includes("--tunnel");
const skipDoltgres = args.includes("--skip-doltgres");
const filteredArgs = args.filter((a) => a !== "--tunnel" && a !== "--skip-doltgres");
const command = filteredArgs[0] ?? "up";

const dbUrl = await getDbUrl({ tunnel: useTunnel });
if (useTunnel) {
  console.log("Using SSM tunnel via localhost:15432");
}

const dbmateArgs = [
  "--url", dbUrl,
  "--migrations-dir", MIGRATIONS_DIR,
  "--schema-file", SCHEMA_FILE,
  "--no-dump-schema",
  command,
  ...filteredArgs.slice(1),
];

const proc = Bun.spawn(["dbmate", ...dbmateArgs], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, DATABASE_URL: dbUrl },
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  process.exit(exitCode);
}

// Dump schema after "up" using pg_dump (skip if not available)
if (command === "up") {
  const pgDump = getPgDumpPath();
  if (!pgDump) {
    console.warn("Schema dump skipped (pg_dump not found). Install: brew install postgresql@17");
  } else {
    const dumpProc = Bun.spawn(
      ["dbmate", "--url", dbUrl, "--schema-file", SCHEMA_FILE, "dump"],
      {
        stdio: ["inherit", "inherit", "inherit"],
        env: { ...process.env, DATABASE_URL: dbUrl, PATH: `${pgDump.replace(/\/pg_dump$/, "")}:${process.env.PATH}` },
      },
    );
    const dumpExit = await dumpProc.exited;
    if (dumpExit !== 0) {
      console.warn("Schema dump failed. You can run it manually later.");
    }
  }
}

// ============================================================
// Doltgres DDL Sync (always runs on "up" unless --skip-doltgres)
// ============================================================
// Logical replication only handles DML. Every "up" migration also
// applies DDL to Doltgres so its schema stays in sync with RDS.
// DML is stripped because replication delivers it — applying it
// twice would cause PK conflicts.
// Use --skip-doltgres to skip (e.g. Doltgres not yet deployed).

if (!skipDoltgres && command === "up") {
  const pgDump = getPgDumpPath();
  if (!pgDump) {
    console.warn("Doltgres DDL sync skipped (psql not found). Install: brew install postgresql@17");
  } else {
    try {
      const psql = pgDump.replace("pg_dump", "psql");
      const doltgresUrl = await getDoltgresUrl({ tunnel: useTunnel });
      console.log("\n--- Doltgres DDL Sync ---");

      // Ensure tracking table exists
      execFileSync(psql, [doltgresUrl, "-c", `
        CREATE TABLE IF NOT EXISTS doltgres_applied_ddl (
          version VARCHAR(255) PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `], { stdio: ["pipe", "inherit", "inherit"] });

      // Get already-applied versions
      const appliedRaw = execFileSync(psql, [
        doltgresUrl, "-t", "-A", "-c",
        "SELECT version FROM doltgres_applied_ddl ORDER BY version;",
      ], { encoding: "utf-8" });
      const appliedVersions = new Set(appliedRaw.trim().split("\n").filter(Boolean));

      // Read migration files sorted by name (timestamp order)
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      let applied = 0;
      for (const file of files) {
        const version = file.replace(/\.sql$/, "");
        if (appliedVersions.has(version)) continue;

        const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf-8");
        const ddl = extractDdl(sql);
        if (!ddl.trim()) {
          // No DDL in this migration (DML-only), just record it
          execFileSync(psql, [
            doltgresUrl, "-c",
            `INSERT INTO doltgres_applied_ddl (version) VALUES ('${version}');`,
          ], { stdio: ["pipe", "inherit", "inherit"] });
          console.log(`  ${file} (DML-only, skipped)`);
          continue;
        }

        // Apply DDL then record version, wrapped in a transaction
        const txnSql = `BEGIN;\n${ddl}\nINSERT INTO doltgres_applied_ddl (version) VALUES ('${version}');\nCOMMIT;\n`;
        execFileSync(psql, [doltgresUrl], {
          input: txnSql,
          stdio: ["pipe", "inherit", "inherit"],
        });
        applied++;
        console.log(`  ${file} (DDL applied)`);
      }

      if (applied === 0) {
        console.log("  All migrations already synced.");
      }
      console.log("--- Doltgres DDL Sync Complete ---\n");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Doltgres DDL sync failed: ${msg}`);
      console.warn("RDS migration succeeded. Use --skip-doltgres to suppress, or fix Doltgres connectivity.");
      process.exit(1);
    }
  }
}

/**
 * Extract DDL statements from a dbmate migration file.
 *
 * Parses the `-- migrate:up` section, splits into statements by
 * semicolons, and filters out DML (INSERT, UPDATE, DELETE, COPY).
 * Returns only DDL statements joined with semicolons.
 */
function extractDdl(sql: string): string {
  // Extract -- migrate:up section
  const upMatch = sql.match(/-- migrate:up\n([\s\S]*?)(?=-- migrate:down|$)/);
  if (!upMatch) return "";

  const upSection = upMatch[1]!;

  // Split into statements by semicolon followed by newline or EOF.
  // We rejoin first to normalize, then split on semicolons.
  const statements = upSection
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const dmlKeywords = new Set(["INSERT", "UPDATE", "DELETE", "COPY"]);

  const ddlStatements = statements.filter((stmt) => {
    // Strip leading comments and whitespace to find the first keyword
    const stripped = stmt.replace(/^(\s*--[^\n]*\n)*/g, "").trim();
    const firstWord = stripped.split(/\s/)[0]?.toUpperCase() ?? "";
    return !dmlKeywords.has(firstWord);
  });

  if (ddlStatements.length === 0) return "";
  return ddlStatements.map((s) => s + ";").join("\n\n");
}
