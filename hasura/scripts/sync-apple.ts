/**
 * Sync the apple subgraph in DDN.
 *
 * Re-introspects the apple GraphQL connector, regenerates all HML metadata
 * (types + commands), and optionally deploys.
 *
 * Run whenever the apple Hasura v2 schema changes.
 *
 * Usage:
 *   bun run hasura:sync-apple              # introspect + generate
 *   bun run hasura:sync-apple -- --deploy  # introspect + generate + deploy
 *
 * Then deploy (if not using --deploy):
 *   AWS_PROFILE=banyan bun run hasura:deploy
 */

import { $ } from "bun";

const DDN = process.env.DDN_CLI ?? `${process.env.HOME}/.local/bin/ddn`;
const DDN_DIR = new URL("../ddn", import.meta.url).pathname;
const SUBGRAPH = "apple/subgraph.yaml";
const shouldDeploy = process.argv.includes("--deploy");

process.chdir(DDN_DIR);

// Step 1: Introspect connector
console.log("Step 1: Introspecting apple_gql connector...\n");
const introspect = await $`${DDN} connector introspect apple_gql --subgraph ${SUBGRAPH}`.nothrow();
if (introspect.exitCode !== 0) {
  console.error("Introspection failed.");
  process.exit(1);
}

// Step 2: Regenerate HML metadata from the updated connector link schema
console.log("\nStep 2: Generating HML metadata...\n");
const gen = await $`bun run ../scripts/gen-apple-commands.ts`.nothrow();
if (gen.exitCode !== 0) {
  console.error("HML generation failed.");
  process.exit(1);
}

console.log("\nDone. Apple subgraph metadata is up to date.");

if (shouldDeploy) {
  console.log("\nStep 3: Deploying...\n");
  process.chdir(`${DDN_DIR}/..`);
  const deploy = await $`bun run ../hasura:deploy`.nothrow();
  process.exit(deploy.exitCode);
} else {
  console.log("\nNext: AWS_PROFILE=banyan bun run hasura:deploy");
}
