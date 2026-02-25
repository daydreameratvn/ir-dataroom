import { getDbUrl, getPgDumpPath } from "../lib/db.ts";

const MIGRATIONS_DIR = "hasura/db/migrations";
const SCHEMA_FILE = "hasura/db/schema.sql";

const args = process.argv.slice(2);
const useTunnel = args.includes("--tunnel");
const filteredArgs = args.filter((a) => a !== "--tunnel");
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
    console.warn("Schema dump skipped (pg_dump not found). Install: brew install postgresql@16");
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
