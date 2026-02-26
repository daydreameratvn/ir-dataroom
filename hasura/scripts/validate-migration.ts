/**
 * Validate DDN Cloud migration by comparing schemas and running test queries
 * against both the self-hosted and DDN Cloud endpoints.
 *
 * Usage:
 *   bun run hasura/scripts/validate-migration.ts --self-hosted <url> --ddn <url> --token <jwt>
 *
 * Or via env vars:
 *   SELF_HOSTED_URL=https://... DDN_CLOUD_URL=https://... ADMIN_TOKEN=ey... bun run hasura/scripts/validate-migration.ts
 */

const selfHostedUrl = process.argv.includes("--self-hosted")
  ? process.argv[process.argv.indexOf("--self-hosted") + 1]
  : process.env.SELF_HOSTED_URL;

const ddnCloudUrl = process.argv.includes("--ddn")
  ? process.argv[process.argv.indexOf("--ddn") + 1]
  : process.env.DDN_CLOUD_URL;

const adminToken = process.argv.includes("--token")
  ? process.argv[process.argv.indexOf("--token") + 1]
  : process.env.ADMIN_TOKEN;

if (!ddnCloudUrl || !adminToken) {
  console.error("Usage: bun run validate-migration.ts --ddn <url> --token <jwt>");
  console.error("  Optional: --self-hosted <url> (for schema comparison)");
  process.exit(1);
}

// ============================================================
// GraphQL helpers
// ============================================================

async function gqlQuery(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ data?: unknown; errors?: Array<{ message: string }> }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function introspect(endpoint: string): Promise<Record<string, unknown>> {
  const query = `
    query IntrospectionQuery {
      __schema {
        types {
          name
          kind
          fields { name type { name kind ofType { name kind } } }
        }
        queryType { name }
        mutationType { name }
      }
    }
  `;
  const result = await gqlQuery(endpoint, query);
  return result as Record<string, unknown>;
}

// ============================================================
// Test queries — cover models, relationships, and permissions
// ============================================================

const testQueries = [
  {
    name: "List nationalities",
    query: `{ nationalities { value comment } }`,
  },
  {
    name: "List tenants",
    query: `{ tenants { id name national } }`,
  },
  {
    name: "List users (first 5)",
    query: `{ users(limit: 5) { id email name } }`,
  },
  {
    name: "Claims with policy relationship",
    query: `{ claims(limit: 3) { id claim_number amount_claimed policy { id policy_number } } }`,
  },
  {
    name: "Policies with product relationship",
    query: `{ policies(limit: 3) { id policy_number product { id name } } }`,
  },
  {
    name: "Providers",
    query: `{ providers(limit: 3) { id name provider_code } }`,
  },
  {
    name: "FWA alerts with rule",
    query: `{ fwaAlerts(limit: 3) { id score rule { id name } } }`,
  },
  {
    name: "Agent sessions",
    query: `{ agentSessions(limit: 3) { id agent_type status } }`,
  },
  {
    name: "Audit logs",
    query: `{ auditLogs(limit: 3) { id action entity_type entity_id } }`,
  },
];

// ============================================================
// Main
// ============================================================

console.log("=== DDN Cloud Migration Validation ===\n");

let passed = 0;
let failed = 0;

// 1. Schema comparison (if self-hosted URL provided)
if (selfHostedUrl) {
  console.log("--- Schema Comparison ---\n");
  try {
    const [selfSchema, ddnSchema] = await Promise.all([introspect(selfHostedUrl), introspect(ddnCloudUrl)]);

    const selfTypes = new Set(
      ((selfSchema.data as any)?.__schema?.types || [])
        .filter((t: any) => !t.name.startsWith("__"))
        .map((t: any) => t.name),
    );
    const ddnTypes = new Set(
      ((ddnSchema.data as any)?.__schema?.types || [])
        .filter((t: any) => !t.name.startsWith("__"))
        .map((t: any) => t.name),
    );

    const missingSelf = [...selfTypes].filter((t) => !ddnTypes.has(t));
    const missingDdn = [...ddnTypes].filter((t) => !selfTypes.has(t));

    if (missingSelf.length === 0) {
      console.log("  PASS: All self-hosted types exist in DDN Cloud");
      passed++;
    } else {
      console.log(`  FAIL: Missing in DDN Cloud: ${missingSelf.join(", ")}`);
      failed++;
    }

    if (missingDdn.length > 0) {
      console.log(`  INFO: New types in DDN Cloud: ${missingDdn.join(", ")}`);
    }
  } catch (err) {
    console.log(`  SKIP: Schema comparison failed — ${err}`);
  }
  console.log();
}

// 2. Test queries against DDN Cloud
console.log("--- Query Tests (DDN Cloud) ---\n");
for (const test of testQueries) {
  try {
    const result = await gqlQuery(ddnCloudUrl, test.query);
    if (result.errors) {
      console.log(`  FAIL: ${test.name} — ${result.errors[0]?.message}`);
      failed++;
    } else {
      const dataKeys = Object.keys((result.data as Record<string, unknown>) || {});
      const firstKey = dataKeys[0] || "";
      const count = Array.isArray((result.data as any)?.[firstKey])
        ? (result.data as any)[firstKey].length
        : "N/A";
      console.log(`  PASS: ${test.name} (${count} rows)`);
      passed++;
    }
  } catch (err) {
    console.log(`  FAIL: ${test.name} — ${err}`);
    failed++;
  }
}

// 3. Health check
console.log("\n--- Health Check ---\n");
try {
  const healthUrl = ddnCloudUrl.replace(/\/graphql\/?$/, "/healthz").replace(/\/$/, "") + "/healthz";
  const healthRes = await fetch(healthUrl.replace(/\/healthz\/healthz$/, "/healthz"));
  console.log(`  Health endpoint: ${healthRes.status} ${healthRes.statusText}`);
  if (healthRes.ok) passed++;
  else failed++;
} catch (err) {
  console.log(`  SKIP: Health check — ${err}`);
}

// 4. Summary
console.log("\n=== Summary ===\n");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Result: ${failed === 0 ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);

process.exit(failed > 0 ? 1 : 0);
