import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../shared/graphql-client.ts";

/**
 * Tier 1 Chronic ICD Prefixes — high-volume, predictable drug-only outpatient claims.
 * Based on ICD Claim Analysis (30,809 cases, Dec 2025 - Jan 2026):
 * 8,670 eligible cases with 90% expected automation rate (~7,803 auto-processable).
 */
export const TIER1_ICD_PREFIXES = [
  "I10", // Essential (primary) hypertension
  "E11", // Type 2 diabetes mellitus
  "E78", // Disorders of lipoprotein metabolism (Dyslipidemia)
  "K21", // Gastro-oesophageal reflux disease (GERD)
  "J45", // Asthma
  "B18", // Chronic viral hepatitis (Hep B)
  "J30", // Vasomotor and allergic rhinitis
  "K29", // Gastritis and duodenitis
  "E03", // Other hypothyroidism
  "E05", // Thyrotoxicosis (Hyperthyroidism)
  "J35", // Chronic diseases of tonsils and adenoids
  "K58", // Irritable bowel syndrome (IBS)
  "J32", // Chronic sinusitis
  "J31", // Chronic rhinitis, nasopharyngitis and pharyngitis
  "E10", // Type 1 diabetes mellitus
  "E04", // Other nontoxic goitre
  "E07", // Other disorders of thyroid
  "K59", // Other functional intestinal disorders
] as const;

/**
 * Vietnamese keywords indicating surgical/procedural treatments — NOT drug-only.
 */
const EXCLUSION_KEYWORDS = [
  "phẫu thuật",
  "thủ thuật",
  "tiểu phẫu",
  "đại phẫu",
  "lọc máu",
  "chạy thận",
  "sinh thiết",
  "nội soi",
];

export interface DroneEligibilityResult {
  eligible: boolean;
  reason: string;
}

/**
 * Checks whether a claim's ICD codes match Tier 1 chronic prefixes
 * and treatment has no excluded keywords.
 */
export function isClaimDroneEligible(claim: {
  icdCodes: string[];
  treatmentMethod?: string | null;
  insuredBenefitType?: string | null;
}): DroneEligibilityResult {
  // Must be OutPatient
  if (claim.insuredBenefitType && claim.insuredBenefitType !== "OutPatient") {
    return { eligible: false, reason: `Not OutPatient: ${claim.insuredBenefitType}` };
  }

  // Must have at least one ICD code
  if (claim.icdCodes.length === 0) {
    return { eligible: false, reason: "No ICD codes" };
  }

  // All ICD codes must match Tier 1 prefixes
  const allMatch = claim.icdCodes.every((code) =>
    TIER1_ICD_PREFIXES.some((prefix) => code.toUpperCase().startsWith(prefix)),
  );
  if (!allMatch) {
    const nonMatching = claim.icdCodes.filter(
      (code) => !TIER1_ICD_PREFIXES.some((prefix) => code.toUpperCase().startsWith(prefix)),
    );
    return { eligible: false, reason: `Non-Tier1 ICD codes: ${nonMatching.join(", ")}` };
  }

  // Treatment must not contain exclusion keywords
  if (claim.treatmentMethod) {
    const lower = claim.treatmentMethod.toLowerCase();
    const excluded = EXCLUSION_KEYWORDS.find((kw) => lower.includes(kw));
    if (excluded) {
      return { eligible: false, reason: `Excluded treatment keyword: "${excluded}"` };
    }
  }

  return { eligible: true, reason: "Tier 1 chronic drug-only claim" };
}

// GraphQL query: InProgress + OutPatient + NON_LIFE claims, newest first, over-fetch for post-filtering
const GetDroneEligibleClaims = graphql(`
  query GetDroneEligibleClaims($limit: Int!) {
    claim_cases(
      where: {
        claim_case_status: { value: { _eq: InProgress } }
        insured_benefit_type: { value: { _eq: OutPatient } }
        type: { _eq: "NON_LIFE" }
        genesis_claim_id: { _is_null: true }
        is_direct_billing: { _eq: false }
      }
      limit: $limit
      order_by: { created_at: desc }
    ) {
      id
      code
      treatment_method
      insured_benefit_type {
        value
      }
      claim_case_input_diagnoses {
        icd {
          value
        }
      }
      claim_case_assessed_diagnoses {
        icd {
          value
        }
      }
    }
  }
`);

export interface EligibleClaim {
  id: string;
  code: string;
}

/**
 * Fetches InProgress OutPatient claims and post-filters for Tier 1 eligibility.
 * Over-fetches 10x batchSize (min 50) to account for claims without ICD codes.
 */
export async function fetchDroneEligibleClaims(batchSize: number): Promise<EligibleClaim[]> {
  const client = getClient();
  const { data } = await client.query({
    query: GetDroneEligibleClaims,
    variables: { limit: Math.max(batchSize * 10, 50) },
    fetchPolicy: "no-cache",
  });

  const claims = data?.claim_cases ?? [];
  const eligible: EligibleClaim[] = [];

  for (const claim of claims) {
    if (eligible.length >= batchSize) break;

    // Use input diagnoses (primary), fall back to assessed diagnoses
    const inputIcds = (claim.claim_case_input_diagnoses ?? [])
      .map((d) => d.icd?.value)
      .filter((v): v is string => v != null);
    const assessedIcds = (claim.claim_case_assessed_diagnoses ?? [])
      .map((d) => d.icd?.value)
      .filter((v): v is string => v != null);
    const icdCodes = inputIcds.length > 0 ? inputIcds : assessedIcds;

    const result = isClaimDroneEligible({
      icdCodes,
      treatmentMethod: claim.treatment_method,
      insuredBenefitType: claim.insured_benefit_type?.value,
    });

    if (result.eligible) {
      eligible.push({ id: claim.id, code: claim.code });
    }
  }

  return eligible;
}
