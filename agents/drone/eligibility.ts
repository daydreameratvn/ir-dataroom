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
 * Tier 2 ICD Prefixes — common acute/general outpatient claims.
 * Broader than Tier 1: includes acute respiratory, musculoskeletal, dermatology, GI, ENT.
 * Based on ICD frequency analysis of 1,693 unassessed InProgress OutPatient claims (Feb 2026).
 */
export const TIER2_ICD_PREFIXES = [
  // Acute respiratory
  "J00", // Acute nasopharyngitis (common cold)
  "J01", // Acute sinusitis
  "J02", // Acute pharyngitis
  "J03", // Acute tonsillitis
  "J06", // Acute upper respiratory infection
  "J20", // Acute bronchitis
  "J21", // Acute bronchiolitis
  "J34", // Nasal turbinate hypertrophy
  // Musculoskeletal
  "M54", // Back pain
  "M25", // Joint effusion / joint disorders
  "M17", // Knee osteoarthritis
  "M47", // Spondylosis (spinal degeneration)
  "M51", // Intervertebral disc disorders
  "M65", // Synovitis and tenosynovitis
  // Digestive / GI
  "K30", // Functional dyspepsia
  "K76", // Other liver diseases
  "K64", // Hemorrhoids
  "A04", // Bacterial intestinal infections
  "A09", // Gastroenteritis
  // Dermatology
  "L20", // Atopic dermatitis
  "L23", // Allergic contact dermatitis
  "L30", // Other dermatitis
  "L50", // Urticaria (hives)
  // ENT / Eye / Ear
  "H81", // Vestibular disorders
  "H04", // Dry eye syndrome / lacrimal disorders
  "H60", // Otitis externa
  "H66", // Otitis media
  // Other common outpatient
  "E79", // Hyperuricemia (gout-related)
  "D50", // Iron deficiency anaemia
  "R10", // Abdominal pain
  "R73", // Hyperglycaemia NOS
] as const;

export type DroneTier = 1 | 2;

/** Returns the ICD prefix list for a given tier. Tier 2 includes Tier 1. */
export function getIcdPrefixesForTier(tier: DroneTier): readonly string[] {
  if (tier === 1) return TIER1_ICD_PREFIXES;
  return [...TIER1_ICD_PREFIXES, ...TIER2_ICD_PREFIXES];
}

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
 * Checks whether a claim's ICD codes match the given tier's prefixes
 * and treatment has no excluded keywords.
 */
export function isClaimDroneEligible(claim: {
  icdCodes: string[];
  treatmentMethod?: string | null;
  insuredBenefitType?: string | null;
}, tier: DroneTier = 1): DroneEligibilityResult {
  const prefixes = getIcdPrefixesForTier(tier);

  // Must be OutPatient
  if (claim.insuredBenefitType && claim.insuredBenefitType !== "OutPatient") {
    return { eligible: false, reason: `Not OutPatient: ${claim.insuredBenefitType}` };
  }

  // Must have at least one ICD code
  if (claim.icdCodes.length === 0) {
    return { eligible: false, reason: "No ICD codes" };
  }

  // All ICD codes must match the tier's prefixes
  const allMatch = claim.icdCodes.every((code) =>
    prefixes.some((prefix) => code.toUpperCase().startsWith(prefix)),
  );
  if (!allMatch) {
    const nonMatching = claim.icdCodes.filter(
      (code) => !prefixes.some((prefix) => code.toUpperCase().startsWith(prefix)),
    );
    return { eligible: false, reason: `Non-Tier${tier} ICD codes: ${nonMatching.join(", ")}` };
  }

  // Treatment must not contain exclusion keywords
  if (claim.treatmentMethod) {
    const lower = claim.treatmentMethod.toLowerCase();
    const excluded = EXCLUSION_KEYWORDS.find((kw) => lower.includes(kw));
    if (excluded) {
      return { eligible: false, reason: `Excluded treatment keyword: "${excluded}"` };
    }
  }

  const tierLabel = tier === 1 ? "Tier 1 chronic drug-only claim" : "Tier 2 general outpatient claim";
  return { eligible: true, reason: tierLabel };
}

// GraphQL query via DDN supergraph — banyan_pg connector, Claims model.
// Submitted/under_review/ai_processing claims, newest first, over-fetch for post-filtering.
const GetDroneEligibleClaims = graphql(`
  query GetDroneEligibleClaims($limit: Int!) {
    claims(
      where: {
        status: { _in: ["submitted", "under_review", "ai_processing"] }
        deletedAt: { _is_null: true }
      }
      limit: $limit
      order_by: { createdAt: Desc }
    ) {
      id
      claimNumber
      claimDiagnoses(where: { deletedAt: { _is_null: true } }) {
        code
      }
    }
  }
`);

export interface EligibleClaim {
  id: string;
  code: string;
  benefitType?: string;
  icdCodes?: string[];
}

/**
 * Fetches eligible claims and post-filters by ICD codes.
 * Over-fetches 20x batchSize (min 200) to account for claims without ICD codes.
 */
export async function fetchDroneEligibleClaims(batchSize: number, tier: DroneTier = 1): Promise<EligibleClaim[]> {
  const client = getClient();
  const { data } = await client.query({
    query: GetDroneEligibleClaims,
    variables: { limit: Math.max(batchSize * 20, 200) },
    fetchPolicy: "no-cache",
  });

  const claims = data?.claims ?? [];
  const eligible: EligibleClaim[] = [];

  for (const claim of claims) {
    if (eligible.length >= batchSize) break;

    const icdCodes = (claim.claimDiagnoses ?? [])
      .map((d) => d.code)
      .filter((v): v is string => v != null);

    const result = isClaimDroneEligible({ icdCodes }, tier);

    if (result.eligible) {
      eligible.push({
        id: claim.id,
        code: claim.claimNumber,
        icdCodes,
      });
    }
  }

  return eligible;
}
