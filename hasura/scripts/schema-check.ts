/**
 * Schema drift detection — compares DB columns against DDN connector config.
 *
 * Reports columns that exist in the database but are missing from the
 * DDN connector configuration.json (not exposed via GraphQL API).
 *
 * Usage:
 *   AWS_PROFILE=banyan bun run hasura:schema-check --tunnel
 *
 * Requires:
 *   - SSM tunnel running (bun run hasura:tunnel) or --tunnel flag
 *   - psql installed (brew install postgresql@17)
 */

import { getDbUrl, getPgDumpPath } from "../lib/db.ts";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const CONNECTOR_CONFIG = "hasura/ddn/app/connector/banyan_pg/configuration.json";

const args = process.argv.slice(2);
const useTunnel = args.includes("--tunnel");

// Tables we track in DDN (public schema, exclude system tables)
const TRACKED_TABLES = new Set([
  "users", "tenants", "nationalities", "products", "policies",
  "claims", "claim_documents", "claim_notes", "claim_diagnoses", "claim_procedures",
  "providers", "provider_contracts",
  "auth_sessions", "auth_identities", "auth_otp_requests", "auth_login_attempts", "auth_passkeys",
  "fwa_rules", "fwa_alerts", "fwa_cases", "fwa_case_actions", "fwa_case_linked_claims",
  "agent_sessions", "agent_actions",
  "audit_logs", "audit_log_entries",
  "drone_schedules", "drone_runs", "drone_run_results",
  "directory_sync_logs",
  "endorsements",
  "tenant_identity_providers",
  "impersonation_logs",
]);

// ─── 1. Read connector configuration.json ──────────────────────────────────

const config = JSON.parse(readFileSync(CONNECTOR_CONFIG, "utf-8"));

// Build a map: table_name → Set<column_name> from the connector config
const connectorTables = new Map<string, Set<string>>();

// The connector config has tables under metadata.tables (NDC PostgreSQL connector)
// Each table has columns: { name, ... }
for (const [tableName, tableConfig] of Object.entries(config.metadata?.tables ?? {})) {
  const cols = new Set<string>();
  for (const [colName] of Object.entries((tableConfig as any).columns ?? {})) {
    cols.add(colName);
  }
  connectorTables.set(tableName, cols);
}

// ─── 2. Query actual DB schema ─────────────────────────────────────────────

const dbUrl = await getDbUrl({ tunnel: useTunnel });
if (useTunnel) {
  console.log("Using SSM tunnel via localhost:15432\n");
}

const pgDump = getPgDumpPath();
if (!pgDump) {
  console.error("psql not found. Install: brew install postgresql@17");
  process.exit(1);
}
const psql = pgDump.replace("pg_dump", "psql");

// Query information_schema for all columns in tracked tables
const query = `
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (${[...TRACKED_TABLES].map(t => `'${t}'`).join(", ")})
  ORDER BY table_name, ordinal_position;
`;

const result = execFileSync(psql, [dbUrl, "-t", "-A", "-F", "|", "-c", query], {
  encoding: "utf-8",
});

// Parse result into map: table_name → [{ column, type, nullable }]
const dbTables = new Map<string, Array<{ column: string; type: string; nullable: string }>>();
for (const line of result.trim().split("\n").filter(Boolean)) {
  const [table, column, type, nullable] = line.split("|");
  if (!table || !column) continue;
  if (!dbTables.has(table)) dbTables.set(table, []);
  dbTables.get(table)!.push({ column, type: type!, nullable: nullable! });
}

// ─── 3. Compare ────────────────────────────────────────────────────────────

let driftCount = 0;
const missingTables: string[] = [];
const missingColumns: Array<{ table: string; column: string; type: string }> = [];

for (const [tableName, dbCols] of dbTables) {
  const connectorCols = connectorTables.get(tableName);

  if (!connectorCols) {
    missingTables.push(tableName);
    driftCount++;
    continue;
  }

  for (const col of dbCols) {
    if (!connectorCols.has(col.column)) {
      missingColumns.push({ table: tableName, column: col.column, type: col.type });
      driftCount++;
    }
  }
}

// ─── 4. Report ─────────────────────────────────────────────────────────────

if (driftCount === 0) {
  console.log("No schema drift detected. DDN connector is in sync with the database.");
  process.exit(0);
}

console.log(`Schema drift detected: ${driftCount} issue(s)\n`);

if (missingTables.length > 0) {
  console.log("Tables in DB but missing from DDN connector:");
  for (const t of missingTables) {
    console.log(`  - ${t}`);
  }
  console.log();
}

if (missingColumns.length > 0) {
  console.log("Columns in DB but missing from DDN connector:");
  // Group by table
  const grouped = new Map<string, Array<{ column: string; type: string }>>();
  for (const mc of missingColumns) {
    if (!grouped.has(mc.table)) grouped.set(mc.table, []);
    grouped.get(mc.table)!.push({ column: mc.column, type: mc.type });
  }
  for (const [table, cols] of grouped) {
    console.log(`  ${table}:`);
    for (const c of cols) {
      console.log(`    - ${c.column} (${c.type})`);
    }
  }
  console.log();
}

console.log("To fix:");
console.log("  1. Run: bun run hasura:introspect   (requires Docker)");
console.log("  2. Add fields to HML metadata files");
console.log("  3. Run: bun run hasura:deploy");
console.log();

process.exit(1);
