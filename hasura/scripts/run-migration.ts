import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const useTunnel = process.argv.includes("--tunnel");

const ssm = new SSMClient({ region: "ap-southeast-1" });
const resp = await ssm.send(new GetParameterCommand({ Name: "/banyan/hasura/db-connection-uri", WithDecryption: true }));
let dbUrl = resp.Parameter!.Value!;

// Fix escaped characters from SSM storage (e.g. \! → !)
dbUrl = dbUrl.replace(/\\!/g, "!");

// Parse and re-encode password properly for dbmate/Go URL parser
const urlObj = new URL(dbUrl);
// URL class auto-decodes percent-encoded chars, re-encode the password
const rawPassword = urlObj.password;
urlObj.password = rawPassword; // URL class handles encoding
dbUrl = urlObj.toString();

// Rewrite host for SSM tunnel
if (useTunnel) {
  const u = new URL(dbUrl);
  u.hostname = "localhost";
  u.port = "15432";
  dbUrl = u.toString();
  console.log("Using SSM tunnel via localhost:15432");
}

// RDS requires SSL
if (!dbUrl.includes("sslmode=")) {
  dbUrl += dbUrl.includes("?") ? "&sslmode=require" : "?sslmode=require";
}

console.log("Running migration...");
const proc = Bun.spawn(["dbmate", "--url", dbUrl, "--migrations-dir", "hasura/db/migrations", "--schema-file", "hasura/db/schema.sql", "--no-dump-schema", "up"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, DATABASE_URL: dbUrl },
});
const exitCode = await proc.exited;
if (exitCode !== 0) process.exit(exitCode);
console.log("Migration complete!");
