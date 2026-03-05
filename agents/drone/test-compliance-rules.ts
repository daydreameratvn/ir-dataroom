/**
 * Test script: Validate document compliance rules across claim types.
 *
 * Phase 1 (deterministic, no LLM): Run runComplianceCheck on claims across
 * all benefit types to verify the document matrix (Part 3) and track coverage.
 *
 * Phase 2 (LLM sub-agent): Run the full compliance sub-agent on 1 claim per
 * case type to verify content validation (Parts 4-7).
 *
 * Usage:
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 \
 *   HASURA_GRAPHQL_ENDPOINT=https://prod.apple.papaya.services/v1/graphql \
 *   HASURA_ADMIN_SECRET=<secret> \
 *   bun run agents/drone/test-compliance-rules.ts
 *
 * Options:
 *   SKIP_LLM=1        — skip Phase 2 (LLM sub-agent runs)
 *   PHASE1_LIMIT=20   — claims per benefit type in Phase 1 (default 20)
 */

import { gql } from "@apollo/client/core";

import { getClient } from "../shared/graphql-client.ts";
import { runComplianceCheckTool } from "../shared/tools/compliance.ts";
import { createDocumentComplianceDefinition } from "../subagents/index.ts";
import { runSubAgent } from "../subagents/runner.ts";

// ─── Config ──────────────────────────────────────────────────────────
const PHASE1_LIMIT = Number(process.env.PHASE1_LIMIT) || 20;
const SKIP_LLM = process.env.SKIP_LLM === "1";
const BENEFIT_TYPES = ["OutPatient", "InPatient", "Dental", "Maternity", "Accident"] as const;

// All document type abbreviations from the rules (Part 2)
const ALL_DOC_CODES = [
  "GYC", "HĐ GTGT", "BKCT", "DTHUOC", "BCYTE", "PCĐ", "KQXN",
  "GTTHAN", "BB TTTN", "HDBL", "BCYTRV", "GRV", "GCNPT",
  "XQRANG", "PĐTNK", "GCSINH", "SKTHAI",
] as const;

// Map system document types to rule abbreviations for coverage tracking
const DOC_TYPE_TO_CODE: Record<string, string> = {
  ClaimForm: "GYC",
  InvoicePaper: "HĐ GTGT",
  RECEIPT: "HDBL",
  PrescriptionPaper: "DTHUOC",
  MedicalRecord: "BCYTE",
  MEDICAL_TEST_RESULT: "KQXN",
  DischargePaper: "GRV",
  POLST: "PCĐ",
  CertificateOfSurgery: "GCNPT",
  OtherPaper: "BKCT",
  AccidentProof: "BB TTTN",
  PoliceRelatedPaper: "GTTHAN",
  DentalTreatmentProof: "PĐTNK",
  BirthCertificate: "GCSINH",
};

// ─── GraphQL ─────────────────────────────────────────────────────────
// Use claim_cases (legacy Hasura v2) with broad fetch, then post-filter by benefit type
const ClaimsBatchDocument = gql`
  query ClaimsBatchForComplianceTest($limit: Int!) {
    claim_cases(
      where: {
        claim_case_status: { value: { _in: [InProgress, Paid, Declined] } }
      }
      order_by: { created_at: desc }
      limit: $limit
    ) {
      id
      code
      insured_benefit_type { value }
    }
  }
`;

// ─── Types ───────────────────────────────────────────────────────────
interface ComplianceResult {
  claimCode: string;
  benefitType: string;
  compliant: boolean;
  presentDocuments: string[];
  missingRequired: string[];
  error?: string;
}

interface CoverageTracker {
  benefitTypesTested: Set<string>;
  docTypesPresent: Set<string>;
  docTypesMissing: Set<string>;
  rulesExercised: Set<string>;
  compliantCount: number;
  nonCompliantCount: number;
  errorCount: number;
}

// ─── Phase 1: Deterministic compliance checks ────────────────────────
async function phase1(): Promise<{ results: ComplianceResult[]; coverage: CoverageTracker }> {
  console.log("=".repeat(80));
  console.log("PHASE 1: Deterministic Document Compliance Checks (no LLM)");
  console.log("=".repeat(80));
  console.log(`Target: ${PHASE1_LIMIT} claims per benefit type across ${BENEFIT_TYPES.length} types\n`);

  const client = getClient();
  const allResults: ComplianceResult[] = [];
  const coverage: CoverageTracker = {
    benefitTypesTested: new Set(),
    docTypesPresent: new Set(),
    docTypesMissing: new Set(),
    rulesExercised: new Set(),
    compliantCount: 0,
    nonCompliantCount: 0,
    errorCount: 0,
  };

  // Fetch a large batch and bucket by benefit type
  const totalFetch = PHASE1_LIMIT * BENEFIT_TYPES.length * 5; // over-fetch 5x
  console.log(`Fetching up to ${totalFetch} claims from DDN...\n`);

  const { data } = await client.query({
    query: ClaimsBatchDocument,
    variables: { limit: totalFetch },
    fetchPolicy: "no-cache",
  });

  const allClaims = (data as any)?.claim_cases ?? [];
  console.log(`Fetched ${allClaims.length} claims total\n`);

  // Bucket by benefit type
  const buckets = new Map<string, { id: string; code: string }[]>();
  for (const bt of BENEFIT_TYPES) {
    buckets.set(bt, []);
  }
  for (const claim of allClaims) {
    const bt = claim.insured_benefit_type?.value;
    if (bt && buckets.has(bt)) {
      const bucket = buckets.get(bt)!;
      if (bucket.length < PHASE1_LIMIT) {
        bucket.push({ id: claim.id, code: claim.code });
      }
    }
  }

  for (const benefitType of BENEFIT_TYPES) {
    const claims = buckets.get(benefitType) ?? [];
    console.log(`\n-- ${benefitType} (${claims.length} claims) --`);

    if (claims.length === 0) {
      console.log(`  (!) No claims found for ${benefitType}`);
      continue;
    }

    coverage.benefitTypesTested.add(benefitType);

    for (const claim of claims) {
      const toolResult = await runComplianceCheckTool.execute(
        `test-${claim.code}`,
        { claimCode: claim.code },
      );

      const text = toolResult.content?.[0]?.type === "text"
        ? (toolResult.content[0] as { type: "text"; text: string }).text
        : "";

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        coverage.errorCount++;
        allResults.push({
          claimCode: claim.code,
          benefitType,
          compliant: false,
          presentDocuments: [],
          missingRequired: [],
          error: "Failed to parse compliance result",
        });
        continue;
      }

      const result: ComplianceResult = {
        claimCode: claim.code,
        benefitType: parsed.benefitType ?? benefitType,
        compliant: parsed.compliant ?? false,
        presentDocuments: parsed.documentPresence?.presentDocuments ?? [],
        missingRequired: parsed.documentPresence?.missingRequired ?? [],
        error: parsed.error,
      };

      allResults.push(result);

      if (result.error) {
        coverage.errorCount++;
      } else if (result.compliant) {
        coverage.compliantCount++;
      } else {
        coverage.nonCompliantCount++;
      }

      // Track coverage
      for (const docType of result.presentDocuments) {
        const code = DOC_TYPE_TO_CODE[docType] ?? docType;
        coverage.docTypesPresent.add(code);
      }
      for (const docType of result.missingRequired) {
        const code = DOC_TYPE_TO_CODE[docType] ?? docType;
        coverage.docTypesMissing.add(code);
      }

      // Track which rules are exercised
      coverage.rulesExercised.add(`Part3:${benefitType}`); // Document matrix
      if (result.missingRequired.length > 0) {
        coverage.rulesExercised.add(`Part6:supplement_request`); // Supplement template triggered
      }
      if (result.presentDocuments.length > 0) {
        coverage.rulesExercised.add(`Part4:doc_validation`); // Per-doc validation
      }

      const status = result.error ? "ERROR" : result.compliant ? "PASS" : "MISSING";
      const missing = result.missingRequired.length > 0
        ? ` [missing: ${result.missingRequired.map(d => DOC_TYPE_TO_CODE[d] ?? d).join(", ")}]`
        : "";
      console.log(`  ${status.padEnd(8)} ${claim.code} (${result.presentDocuments.length} docs)${missing}`);
    }
  }

  return { results: allResults, coverage };
}

// ─── Phase 2: LLM sub-agent runs ────────────────────────────────────
async function phase2(claimCodes: Map<string, string>): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: Full LLM Sub-Agent Compliance Checks");
  console.log("=".repeat(80));
  console.log(`Running compliance sub-agent on ${claimCodes.size} claims (1 per case type)\n`);

  for (const [benefitType, claimCode] of claimCodes) {
    console.log(`\n-- ${benefitType}: ${claimCode} --`);
    const start = Date.now();

    const definition = createDocumentComplianceDefinition(claimCode);

    const result = await runSubAgent(
      definition,
      `Kiểm tra tính đầy đủ hồ sơ cho yêu cầu bồi thường ${claimCode}. Hãy xác minh tất cả tài liệu cần thiết đã được nộp và nội dung hợp lệ.`,
      {
        timeoutMs: 300_000, // 5 min per claim
        onUpdate: (update) => {
          if (update.phase === "tool_start") {
            console.log(`  -> ${update.toolName}`);
          }
        },
      },
    );

    const elapsed = Math.round((Date.now() - start) / 1000);
    const status = result.success ? "SUCCESS" : "FAILED";
    console.log(`\n  ${status} in ${elapsed}s | Tools: ${result.toolsCalled.join(", ") || "none"}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    // Print the compliance report (truncated)
    if (result.text) {
      const lines = result.text.split("\n").slice(0, 30);
      console.log(`\n  -- Report (first 30 lines) --`);
      for (const line of lines) {
        console.log(`  ${line}`);
      }
      if (result.text.split("\n").length > 30) {
        console.log(`  ... (${result.text.split("\n").length - 30} more lines)`);
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("Document Compliance Rules Test");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Phase 1 limit: ${PHASE1_LIMIT} claims/type | LLM: ${SKIP_LLM ? "SKIP" : "ON"}\n`);

  // Phase 1
  const { results, coverage } = await phase1();

  // Phase 1 Summary
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 1 SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total claims tested: ${results.length}`);
  console.log(`  Compliant (PASS):  ${coverage.compliantCount}`);
  console.log(`  Non-compliant:     ${coverage.nonCompliantCount}`);
  console.log(`  Errors:            ${coverage.errorCount}`);
  console.log(`\nBenefit types tested: ${[...coverage.benefitTypesTested].join(", ")}`);

  // Document type coverage
  console.log(`\nDocument types observed as PRESENT:`);
  for (const code of ALL_DOC_CODES) {
    const present = coverage.docTypesPresent.has(code);
    console.log(`  ${present ? "[x]" : "[ ]"} ${code}`);
  }

  console.log(`\nDocument types observed as MISSING (required but absent):`);
  for (const code of ALL_DOC_CODES) {
    const missing = coverage.docTypesMissing.has(code);
    console.log(`  ${missing ? "[x]" : "[ ]"} ${code}`);
  }

  // Rule coverage
  console.log(`\nRules exercised: ${coverage.rulesExercised.size}`);
  for (const rule of [...coverage.rulesExercised].sort()) {
    console.log(`  [x] ${rule}`);
  }

  // Check if we need more claims
  const untestedBenefitTypes = BENEFIT_TYPES.filter(bt => !coverage.benefitTypesTested.has(bt));
  if (untestedBenefitTypes.length > 0) {
    console.log(`\n(!) Untested benefit types: ${untestedBenefitTypes.join(", ")}`);
    console.log("  These types had no claims in the database.");
  }

  // Coverage score
  const totalRules = BENEFIT_TYPES.length + ALL_DOC_CODES.length * 2; // matrix + present + missing
  const coveredRules = coverage.benefitTypesTested.size + coverage.docTypesPresent.size + coverage.docTypesMissing.size;
  const coveragePct = Math.round((coveredRules / totalRules) * 100);
  console.log(`\nCoverage score: ${coveredRules}/${totalRules} (${coveragePct}%)`);

  if (results.length < 100) {
    console.log(`\n(!) Only ${results.length} claims tested (target: 100). Increase PHASE1_LIMIT or check benefit type distribution.`);
  }

  // Phase 2
  if (!SKIP_LLM) {
    // Pick one claim per benefit type for LLM testing — prefer non-compliant to test more rules
    const claimCodes = new Map<string, string>();
    for (const bt of BENEFIT_TYPES) {
      const btResults = results.filter(r => r.benefitType === bt && !r.error);
      // Prefer non-compliant claims (they exercise more rules)
      const pick = btResults.find(r => !r.compliant) ?? btResults[0];
      if (pick) {
        claimCodes.set(bt, pick.claimCode);
      }
    }

    if (claimCodes.size > 0) {
      await phase2(claimCodes);
    } else {
      console.log("\n(!) No claims available for Phase 2 LLM testing.");
    }
  } else {
    console.log("\n[SKIP_LLM=1] Skipping Phase 2 (LLM sub-agent runs).");
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE");
  console.log("=".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
