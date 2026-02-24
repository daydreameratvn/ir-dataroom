import { fetchSSMParams, requireParam } from "../lib/ssm.ts";

const MIGRATIONS_DIR = "hasura/db/migrations";
const SCHEMA_FILE = "hasura/db/schema.sql";

const params = await fetchSSMParams();
const dbUrl = requireParam(params, "db-connection-uri");

const args = process.argv.slice(2);
const command = args[0] ?? "up";

const dbmateArgs = [
  "--url", dbUrl,
  "--migrations-dir", MIGRATIONS_DIR,
  "--schema-file", SCHEMA_FILE,
  "--no-dump-schema",
  command,
  ...args.slice(1),
];

// For "up" and "rollback", dump schema after running
const shouldDumpSchema = command === "up" || command === "rollback";

const proc = Bun.spawn(["dbmate", ...dbmateArgs], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, DATABASE_URL: dbUrl },
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  process.exit(exitCode);
}

if (shouldDumpSchema) {
  const dumpProc = Bun.spawn(
    ["dbmate", "--url", dbUrl, "--schema-file", SCHEMA_FILE, "dump"],
    {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, DATABASE_URL: dbUrl },
    },
  );
  await dumpProc.exited;
}
