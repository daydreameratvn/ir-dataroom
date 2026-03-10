import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { gqlQuery } from "../../shared/graphql-client.ts";
import { mergeExtractedData, parseExtractedData, getExtractedField } from "../../portal-extraction/tools/claims.ts";
import {
  getChronicConditionsData,
  icdCodeMatchesEntry,
} from "../../shared/csv-data.ts";

// ─── GraphQL Queries ─────────────────────────────────────────────────────────

const FETCH_CLAIM_FOR_PRE_EXISTING_QUERY = `
  query FetchClaimForPreExisting($id: Uuid!) {
    claimsById(id: $id) {
      id
      claimNumber
      status
      claimantName
      amountClaimed
      currency
      dateOfService
      providerName
      aiSummary
    }
  }
`;

const FETCH_CLAIM_HISTORY_QUERY = `
  query FetchClaimHistory($claimantName: String1!, $excludeId: Uuid!) {
    claims(
      where: {
        claimantName: { _eq: $claimantName }
        id: { _neq: $excludeId }
        deletedAt: { _is_null: true }
      }
      order_by: [{ createdAt: Desc }]
      limit: 50
    ) {
      id
      claimNumber
      status
      claimantName
      amountClaimed
      currency
      dateOfService
      providerName
      aiSummary
      createdAt
    }
  }
`;

// ─── Tool Factory ────────────────────────────────────────────────────────────

export function createPreExistingTools(claimId: string) {

  let saveToolCalled = false;

  // ─── Tool 1: Fetch Claim History ────────────────────────────────────────────

  const fetchClaimHistoryTool: AgentTool = {
    name: "fetch_claim_history",
    label: "Fetching Claim History",
    description:
      "Retrieves the current claim's details AND historical claims for the same claimant. " +
      "Use this to detect patterns of chronic conditions, recurring diagnoses, and establish " +
      "a timeline of when conditions first appeared.",
    parameters: Type.Object({
      claimId: Type.String({ description: "The claim ID to fetch" }),
    }),
    async execute(_toolCallId, params) {
      // Fetch current claim
      const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
        FETCH_CLAIM_FOR_PRE_EXISTING_QUERY,
        { id: params.claimId },
      );

      const claim = data.claimsById;
      if (!claim) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Claim not found" }) }],
          details: { claimId: params.claimId },
        };
      }

      const claimantName = claim.claimantName as string | null;

      // Fetch historical claims for same claimant
      let historicalClaims: Record<string, unknown>[] = [];
      if (claimantName) {
        try {
          const historyData = await gqlQuery<{ claims: Record<string, unknown>[] }>(
            FETCH_CLAIM_HISTORY_QUERY,
            { claimantName, excludeId: params.claimId },
          );
          historicalClaims = historyData.claims ?? [];
        } catch (err) {
          console.warn("[pre-existing] Failed to fetch claim history:", err);
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            currentClaim: claim,
            historicalClaims,
            totalHistoricalClaims: historicalClaims.length,
          }, null, 2),
        }],
        details: { claimId: params.claimId, historyCount: historicalClaims.length },
      };
    },
  };

  // ─── Tool 2: Fetch Certificate and Policy Details ───────────────────────────

  const fetchCertificateAndPolicyDetailsTool: AgentTool = {
    name: "fetch_certificate_and_policy_details",
    label: "Fetching Policy Details",
    description:
      "Retrieves policy/certificate details from the claim's extractedData including policy dates, " +
      "treatment info, and admission/discharge dates. Use this to determine policy effective date " +
      "for waiting period calculations. Note: Banyan does not yet have full certificate/policy " +
      "tables — this tool returns what is available from the claim record.",
    parameters: Type.Object({
      claimId: Type.String({ description: "The claim ID to fetch policy details for" }),
    }),
    async execute(_toolCallId, params) {
      const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
        FETCH_CLAIM_FOR_PRE_EXISTING_QUERY,
        { id: params.claimId },
      );

      const claim = data.claimsById;
      if (!claim) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Claim not found" }) }],
          details: { claimId: params.claimId },
        };
      }

      const extractedData = parseExtractedData(claim.aiSummary);
      const treatmentInfo = getExtractedField(extractedData, "extraction", "extractedTreatmentInfo") as Record<string, unknown> | undefined;

      // Extract available policy/certificate info from aiSummary
      const policyDetails = {
        claimId: claim.id,
        claimNumber: claim.claimNumber,
        claimantName: claim.claimantName,
        dateOfService: claim.dateOfService,
        providerName: claim.providerName,
        // From extracted treatment info
        admissionDate: treatmentInfo?.admissionDate ?? null,
        dischargeDate: treatmentInfo?.dischargeDate ?? null,
        policyNumber: treatmentInfo?.policyNumber ?? null,
        // Note: full certificate/policy tables not yet available in Banyan
        policyEffectiveDate: null as string | null,
        policyExpiryDate: null as string | null,
        certificateCode: null as string | null,
        insuredPerson: treatmentInfo?.patientName
          ? {
              name: treatmentInfo.patientName,
              dob: treatmentInfo.dateOfBirth ?? null,
              gender: treatmentInfo.gender ?? null,
            }
          : null,
        limitation: "Full certificate and policy tables are not yet available in Banyan. " +
          "Policy effective date must be inferred from claim history or documents.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(policyDetails, null, 2) }],
        details: { claimId: params.claimId },
      };
    },
  };

  // ─── Tool 3: Lookup Chronic Condition Reference ─────────────────────────────

  const lookupChronicConditionReferenceTool: AgentTool = {
    name: "lookup_chronic_condition_reference",
    label: "Looking Up Chronic Conditions",
    description:
      "Looks up ICD codes, medication names, or clinical phrases against the chronic conditions " +
      "reference database. Returns matching chronic conditions with their waiting periods and " +
      "indicator evidence. Use this to check if detected conditions, medications, or clinical " +
      "phrases map to known chronic conditions.",
    parameters: Type.Object({
      icdCodes: Type.Optional(
        Type.Array(Type.String(), { description: "ICD codes to look up (e.g., ['E11', 'I10', 'C34'])" }),
      ),
      medicationNames: Type.Optional(
        Type.Array(Type.String(), { description: "Medication names found in documents (e.g., ['metformin', 'amlodipine'])" }),
      ),
      clinicalPhrases: Type.Optional(
        Type.Array(Type.String(), { description: "Clinical phrases found in documents (e.g., ['history of diabetes', 'known hypertensive'])" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const conditions = getChronicConditionsData();

      const matchedConditions: Array<{
        conditionName: string;
        conditionCategory: string;
        waitingPeriodDays: number;
        waitingPeriodType: string;
        matchedBy: string;
        matchedValue: string;
        icdCodeStart: string;
        icdCodeEnd: string;
        indicatorMedications: string[];
        indicatorPhrases: string[];
      }> = [];

      const unmatchedIcdCodes: string[] = [];
      const unmatchedMedications: string[] = [];
      const unmatchedPhrases: string[] = [];

      // Match by ICD codes
      if (params.icdCodes?.length) {
        for (const code of params.icdCodes) {
          let found = false;
          for (const entry of conditions) {
            if (icdCodeMatchesEntry(code, entry)) {
              matchedConditions.push({
                conditionName: entry.condition_name,
                conditionCategory: entry.condition_category,
                waitingPeriodDays: entry.waiting_period_days,
                waitingPeriodType: entry.waiting_period_type,
                matchedBy: "icd_code",
                matchedValue: code,
                icdCodeStart: entry.icd_code_start,
                icdCodeEnd: entry.icd_code_end,
                indicatorMedications: entry.indicator_medications,
                indicatorPhrases: entry.indicator_phrases,
              });
              found = true;
              break;
            }
          }
          if (!found) unmatchedIcdCodes.push(code);
        }
      }

      // Match by medication names
      if (params.medicationNames?.length) {
        for (const med of params.medicationNames) {
          let found = false;
          const medLower = med.toLowerCase().trim();
          for (const entry of conditions) {
            if (entry.indicator_medications.some((m) =>
              medLower.includes(m.toLowerCase()) || m.toLowerCase().includes(medLower),
            )) {
              if (!matchedConditions.some((mc) =>
                mc.conditionName === entry.condition_name && mc.matchedBy === "medication",
              )) {
                matchedConditions.push({
                  conditionName: entry.condition_name,
                  conditionCategory: entry.condition_category,
                  waitingPeriodDays: entry.waiting_period_days,
                  waitingPeriodType: entry.waiting_period_type,
                  matchedBy: "medication",
                  matchedValue: med,
                  icdCodeStart: entry.icd_code_start,
                  icdCodeEnd: entry.icd_code_end,
                  indicatorMedications: entry.indicator_medications,
                  indicatorPhrases: entry.indicator_phrases,
                });
              }
              found = true;
              break;
            }
          }
          if (!found) unmatchedMedications.push(med);
        }
      }

      // Match by clinical phrases
      if (params.clinicalPhrases?.length) {
        for (const phrase of params.clinicalPhrases) {
          let found = false;
          const phraseLower = phrase.toLowerCase().trim();
          for (const entry of conditions) {
            if (entry.indicator_phrases.some((p) =>
              phraseLower.includes(p.toLowerCase()) || p.toLowerCase().includes(phraseLower),
            )) {
              if (!matchedConditions.some((mc) =>
                mc.conditionName === entry.condition_name && mc.matchedBy === "clinical_phrase",
              )) {
                matchedConditions.push({
                  conditionName: entry.condition_name,
                  conditionCategory: entry.condition_category,
                  waitingPeriodDays: entry.waiting_period_days,
                  waitingPeriodType: entry.waiting_period_type,
                  matchedBy: "clinical_phrase",
                  matchedValue: phrase,
                  icdCodeStart: entry.icd_code_start,
                  icdCodeEnd: entry.icd_code_end,
                  indicatorMedications: entry.indicator_medications,
                  indicatorPhrases: entry.indicator_phrases,
                });
              }
              found = true;
              break;
            }
          }
          if (!found) unmatchedPhrases.push(phrase);
        }
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            matchedConditions,
            unmatchedIcdCodes,
            unmatchedMedications,
            unmatchedPhrases,
            totalReferenceConditions: conditions.length,
          }, null, 2),
        }],
        details: {
          matchedCount: matchedConditions.length,
          unmatchedIcdCount: unmatchedIcdCodes.length,
          unmatchedMedCount: unmatchedMedications.length,
        },
      };
    },
  };

  // ─── Tool 4: Save Pre-Existing Result ───────────────────────────────────────

  const savePreExistingResultTool: AgentTool = {
    name: "save_pre_existing_result",
    label: "Saving Pre-Existing Result",
    description:
      "Saves the pre-existing condition assessment result to the claim record. " +
      "Call this ONCE after completing your full analysis. This is MANDATORY — " +
      "you must call this before stopping.",
    parameters: Type.Object({
      findings: Type.Array(
        Type.Object({
          conditionName: Type.String({ description: "Name of the detected condition (e.g., 'Type 2 Diabetes Mellitus')" }),
          icdCodes: Type.Array(Type.String(), { description: "ICD codes associated with this condition" }),
          category: Type.String({ description: "Condition category (e.g., 'Endocrine', 'Cardiovascular')" }),
          assessmentTier: Type.Union([
            Type.Literal("CONFIRMED"),
            Type.Literal("SUSPECTED"),
            Type.Literal("UNLIKELY"),
          ], { description: "CONFIRMED = strong evidence pre-existing, SUSPECTED = moderate evidence, UNLIKELY = no evidence" }),
          reasoning: Type.String({ description: "Detailed reasoning for the assessment tier" }),
          evidence: Type.Array(
            Type.Object({
              source: Type.Union([
                Type.Literal("claim_history"),
                Type.Literal("current_document"),
                Type.Literal("medication"),
                Type.Literal("clinical_phrase"),
              ], { description: "Source of this evidence" }),
              description: Type.String({ description: "Human-readable description of the evidence" }),
              date: Type.Union([Type.String(), Type.Null()], { description: "Date of the evidence (ISO format or null)" }),
              claimCode: Type.Union([Type.String(), Type.Null()], { description: "Claim code if evidence comes from claim history" }),
            }),
            { description: "Supporting evidence from all sources" },
          ),
          firstAppearanceDate: Type.Union([Type.String(), Type.Null()], { description: "Earliest date this condition appeared" }),
          policyEffectiveDate: Type.Union([Type.String(), Type.Null()], { description: "Policy effective date for comparison" }),
          daysSincePolicyStart: Type.Union([Type.Number(), Type.Null()], { description: "Days between policy start and first appearance" }),
          waitingPeriodDays: Type.Number({ description: "Applicable waiting period in days (30 general, 120 specific)" }),
          waitingPeriodType: Type.Union([
            Type.Literal("general"),
            Type.Literal("specific"),
          ], { description: "Type of waiting period" }),
          isWithinWaitingPeriod: Type.Boolean({ description: "Whether the condition appeared within the waiting period" }),
          medicationEvidence: Type.Array(Type.String(), { description: "Medication names indicating this condition" }),
          documentPhraseEvidence: Type.Array(Type.String(), { description: "Clinical phrases indicating this condition" }),
        }),
        { description: "List of all detected conditions with assessment tiers" },
      ),
      overallNonDisclosureRisk: Type.Union([
        Type.Literal("HIGH"),
        Type.Literal("MEDIUM"),
        Type.Literal("LOW"),
        Type.Literal("NONE"),
      ], { description: "Overall non-disclosure risk assessment" }),
      nonDisclosureRiskScore: Type.Number({ description: "Overall non-disclosure risk score (0-100)" }),
      nonDisclosureReasoning: Type.String({ description: "Reasoning for the overall non-disclosure risk" }),
      reportMarkdown: Type.String({ description: "Full pre-existing condition assessment report in markdown" }),
      timelineData: Type.Object({
        policyEffectiveDate: Type.Union([Type.String(), Type.Null()], { description: "Policy effective date" }),
        generalWaitingPeriodEnd: Type.Union([Type.String(), Type.Null()], { description: "End of 30-day general waiting period" }),
        specificWaitingPeriodEnd: Type.Union([Type.String(), Type.Null()], { description: "End of 120-day specific waiting period" }),
        historicalClaims: Type.Array(
          Type.Object({
            claimCode: Type.String({ description: "Claim code" }),
            date: Type.String({ description: "Claim date" }),
            diagnoses: Type.Array(Type.String(), { description: "Diagnoses on this claim" }),
            icdCodes: Type.Array(Type.String(), { description: "ICD codes on this claim" }),
          }),
          { description: "Historical claims for timeline display" },
        ),
        currentClaimDate: Type.Union([Type.String(), Type.Null()], { description: "Current claim date" }),
      }, { description: "Timeline data for UI visualization" }),
    }),
    async execute(_toolCallId, params) {
      // Validate non-disclosure risk consistency (guardrails)
      let overallRisk = params.overallNonDisclosureRisk;
      let riskScore = params.nonDisclosureRiskScore;

      const confirmedCount = params.findings.filter((f) => f.assessmentTier === "CONFIRMED").length;
      const suspectedCount = params.findings.filter((f) => f.assessmentTier === "SUSPECTED").length;
      const unlikelyCount = params.findings.filter((f) => f.assessmentTier === "UNLIKELY").length;

      // Guardrails: bump risk level if findings are inconsistent
      if (confirmedCount > 0 && overallRisk === "NONE") {
        overallRisk = "MEDIUM";
      }
      if (confirmedCount >= 2 && overallRisk === "LOW") {
        overallRisk = "MEDIUM";
      }
      if (riskScore >= 76 && overallRisk !== "HIGH") {
        overallRisk = "HIGH";
      }

      // Ensure score aligns with level
      if (riskScore > 100) riskScore = 100;
      if (riskScore < 0) riskScore = 0;

      const preExistingResult = {
        findings: params.findings,
        overallNonDisclosureRisk: overallRisk,
        nonDisclosureRiskScore: riskScore,
        nonDisclosureReasoning: params.nonDisclosureReasoning,
        policyEffectiveDate: params.timelineData.policyEffectiveDate,
        claimHistoryAnalyzed: params.findings.reduce(
          (acc, f) => acc + f.evidence.filter((e) => e.source === "claim_history").length,
          0,
        ),
        documentsScanned: true,
        reportMarkdown: params.reportMarkdown,
        completedAt: new Date().toISOString(),
        timelineData: params.timelineData,
      };

      await mergeExtractedData(claimId, preExistingResult, "preExisting");

      saveToolCalled = true;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            confirmedCount,
            suspectedCount,
            unlikelyCount,
            overallNonDisclosureRisk: overallRisk,
            nonDisclosureRiskScore: riskScore,
          }, null, 2),
        }],
        details: {
          claimId,
          confirmedCount,
          suspectedCount,
          overallRisk,
          riskScore,
        },
      };
    },
  };

  const allTools = [
    fetchClaimHistoryTool,
    fetchCertificateAndPolicyDetailsTool,
    lookupChronicConditionReferenceTool,
    savePreExistingResultTool,
  ];

  return {
    allTools,
    saveToolCalled: () => saveToolCalled,
    saveToolName: "save_pre_existing_result",
  };
}
