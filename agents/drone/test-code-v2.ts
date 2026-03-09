/**
 * Test script: Validate the bpchar→code_v2 migration.
 *
 * Verifies that all 7 refactored GraphQL queries work against the live
 * Apple Hasura v2 endpoint using `code_v2: String!` instead of `code: bpchar!`.
 *
 * Agents connect to Apple Hasura v2 directly (not DDN), so these tests
 * target that endpoint. A bonus test verifies DDN compatibility too.
 *
 * Usage:
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 \
 *   bun run agents/drone/test-code-v2.ts
 *
 * Optional:
 *   CLAIM_CODE=RE-26-XXXXXX  — test with a specific claim code
 */

import { fetchSSMParams, requireParam } from "../../hasura/lib/ssm.ts";

const CLAIM_CODE = process.env.CLAIM_CODE ?? "RE-26-295041";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}`);
    console.error(`    ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ─── Setup: fetch secrets from SSM ──────────────────────────────────────────

console.log("Fetching secrets from SSM...");
const params = await fetchSSMParams();
const appleAdminSecret = requireParam(params, "apple-admin-secret");
const ddnAdminToken = requireParam(params, "admin-token");

const APPLE_ENDPOINT = "https://prod.apple.papaya.services/v1/graphql";
const DDN_ENDPOINT = "https://banyan.services.papaya.asia/graphql";

/** Query Apple Hasura v2 directly (where agents connect) */
async function queryApple(query: string, variables: Record<string, unknown>) {
  const response = await fetch(APPLE_ENDPOINT, {
    method: "POST",
    headers: {
      "x-hasura-admin-secret": appleAdminSecret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

/** Query DDN Cloud */
async function queryDDN(query: string, variables: Record<string, unknown>) {
  const response = await fetch(DDN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ddnAdminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  return await response.json();
}

console.log("═".repeat(72));
console.log("TEST: bpchar → code_v2 Migration");
console.log(`Apple endpoint: ${APPLE_ENDPOINT}`);
console.log(`DDN endpoint:   ${DDN_ENDPOINT}`);
console.log(`Claim code:     ${CLAIM_CODE}`);
console.log("═".repeat(72));

// ─── 1. claim.ts — ClaimCaseV2 ──────────────────────────────────────────────

console.log("\n[1/7] agents/shared/tools/claim.ts — ClaimCaseV2");

await test("query with code_v2 returns claim", async () => {
  const data = await queryApple(
    `query ClaimCaseV2($code: String!) {
      claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
        id
        code
        insured_certificate {
          id
          insured_person { id name }
        }
      }
    }`,
    { code: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
  assert(claim.code === CLAIM_CODE, `Expected code=${CLAIM_CODE}, got ${claim.code}`);
  assert(claim.insured_certificate != null, "Missing insured_certificate");
});

// ─── 2. insured.ts — ClaimForBenefitsV2 ─────────────────────────────────────

console.log("\n[2/7] agents/shared/tools/insured.ts — ClaimForBenefitsV2");

await test("query with code_v2 returns claim with plan", async () => {
  const data = await queryApple(
    `query ClaimForBenefitsV2($code: String!) {
      claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
        id
        insured_certificate {
          id
          policy_plan { id plan_code plan_id plan_name }
        }
      }
    }`,
    { code: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
  assert(claim.insured_certificate != null, "Missing insured_certificate");
});

// ─── 3. compliance.ts — ClaimDocumentsForComplianceV2Pi ─────────────────────

console.log("\n[3/7] agents/shared/tools/compliance.ts — ClaimDocumentsForComplianceV2Pi");

await test("query with code_v2 returns claim with documents", async () => {
  const data = await queryApple(
    `query ClaimDocumentsForComplianceV2Pi($claimCode: String!) {
      claim_cases(where: { code_v2: { _eq: $claimCode } }, limit: 1) {
        id
        code
        diagnosis
        claim_documents(where: { deleted_at: { _is_null: true } }) {
          id
          type
        }
        insured_certificate {
          id
          insured_person { id name }
        }
      }
    }`,
    { claimCode: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
  assert(claim.code === CLAIM_CODE, `Expected code=${CLAIM_CODE}, got ${claim.code}`);
});

// ─── 4. pending-codes.ts — GetClaimContextForPendingV2 ──────────────────────

console.log("\n[4/7] agents/shared/tools/pending-codes.ts — GetClaimContextForPendingV2");

await test("query with code_v2 returns claim context", async () => {
  const data = await queryApple(
    `query GetClaimContextForPendingV2($claimCode: String!) {
      claim_cases(where: { code_v2: { _eq: $claimCode } }, limit: 1) {
        id
        claim_case_id
        code
        diagnosis
        request_amount
        physical_examination_date
        medical_provider { id name }
        insured_certificate {
          id
          insured_person { id name }
        }
      }
    }`,
    { claimCode: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
  assert(claim.code === CLAIM_CODE, `Expected code=${CLAIM_CODE}, got ${claim.code}`);
});

// ─── 5. policy-doc.ts — ClaimPolicyContextV2 ────────────────────────────────

console.log("\n[5/7] agents/shared/tools/policy-doc.ts — ClaimPolicyContextV2");

await test("query with code_v2 returns policy context", async () => {
  const data = await queryApple(
    `query ClaimPolicyContextV2($code: String!) {
      claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
        id
        insured_certificate {
          id
          policy {
            id
            policy_number
            insurer_company { company_id name }
          }
        }
      }
    }`,
    { code: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
});

// ─── 6. claim-assessor/agent.ts — ClaimCaseDetailCheckV2 ────────────────────

console.log("\n[6/7] agents/claim-assessor/agent.ts — ClaimCaseDetailCheckV2");

await test("query with code_v2 returns claim detail fields", async () => {
  const data = await queryApple(
    `query ClaimCaseDetailCheckV2($code: String!) {
      claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
        physical_examination_date
        treatment_method
      }
    }`,
    { code: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
});

// ─── 7. overseer/tools/fraud.ts — ClaimForAnalysis ──────────────────────────

console.log("\n[7/7] agents/overseer/tools/fraud.ts — ClaimForAnalysis");

await test("query with code_v2 returns fraud analysis data", async () => {
  const data = await queryApple(
    `query ClaimForAnalysis($code: String!) {
      claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
        id
        code
        diagnosis
        request_amount
        treatment_method
        insured_certificate {
          id
          claim_cases_aggregate { aggregate { count sum { request_amount } } }
          insured_person { id name }
          policy { id policy_number }
        }
      }
    }`,
    { code: CLAIM_CODE },
  );
  const claim = data?.claim_cases?.[0];
  assert(claim != null, "No claim returned");
  assert(claim.code === CLAIM_CODE, `Expected code=${CLAIM_CODE}, got ${claim.code}`);
});

// ─── Bonus 1: DDN compatibility — code_v2 works via DDN ─────────────────────

console.log("\n[bonus-1] Verify code_v2 works on DDN (apple_claim_cases)");

await test("DDN: code_v2 query returns claim via apple_claim_cases", async () => {
  const result = await queryDDN(
    `query DDNCodeV2Test($code: String!) {
      apple_claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
        id
        code
        code_v2
      }
    }`,
    { code: CLAIM_CODE },
  );
  assert(result.errors == null, `DDN errors: ${JSON.stringify(result.errors)}`);
  const claim = result.data?.apple_claim_cases?.[0];
  assert(claim != null, "No claim returned from DDN");
  assert(claim.code_v2 === CLAIM_CODE, `Expected code_v2=${CLAIM_CODE}, got ${claim.code_v2}`);
});

// ─── Bonus 2: Negative test — old bpchar type should fail on DDN ────────────

console.log("\n[bonus-2] Verify old bpchar type is rejected by DDN");

await test("bpchar type is not defined in DDN schema", async () => {
  const result = await queryDDN(
    `query Test($code: bpchar!) { apple_claim_cases(where: { code: { _eq: $code } }, limit: 1) { id } }`,
    { code: CLAIM_CODE },
  );
  assert(result.errors != null, "Expected errors for bpchar type");
  const errorMsg = JSON.stringify(result.errors);
  assert(
    errorMsg.includes("bpchar") || errorMsg.includes("Unknown type"),
    `Expected bpchar error, got: ${errorMsg}`,
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(72));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log("═".repeat(72));

if (failed > 0) {
  process.exit(1);
}
