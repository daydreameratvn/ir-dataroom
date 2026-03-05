import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { gqlQuery } from "../../shared/graphql-client.ts";
import { mergeExtractedData, parseExtractedData, getExtractedField } from "../../portal-extraction/tools/claims.ts";

// ─── GraphQL Queries ─────────────────────────────────────────────────────────

const FETCH_CLAIM_WITH_ALL_RESULTS_QUERY = `
  query FetchClaimWithAllResults($id: Uuid!) {
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
  query FetchClaimHistoryForFWA($claimantName: String!, $excludeId: Uuid!) {
    claims(
      where: {
        claimantName: { _eq: $claimantName }
        id: { _neq: $excludeId }
        deletedAt: { _isNull: true }
      }
      orderBy: [{ createdAt: Desc }]
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

export function createFWATools(claimId: string) {

  let saveToolCalled = false;

  // ─── Tool 1: Fetch Claim with All Results ─────────────────────────────────

  const fetchClaimWithAllResultsTool: AgentTool = {
    name: "fetch_claim_with_all_results",
    label: "Fetching Claim Data",
    description:
      "Retrieves the claim including full extractedData containing extraction output, " +
      "assessment result, medical necessity result, pre-existing condition result, " +
      "and image forensics result. This is your primary data source for FWA analysis.",
    parameters: Type.Object({
      claimId: Type.String({ description: "The claim ID to fetch" }),
    }),
    async execute(_toolCallId, params) {
      const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
        FETCH_CLAIM_WITH_ALL_RESULTS_QUERY,
        { id: params.claimId },
      );

      const claim = data.claimsById;
      if (!claim) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Claim not found" }) }],
          details: { claimId: params.claimId },
        };
      }

      // Extract structured results from aiSummary (JSON store) — read from namespaced keys with flat fallback
      const extractedData = parseExtractedData(claim.aiSummary);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            claim: {
              id: claim.id,
              claimNumber: claim.claimNumber,
              status: claim.status,
              claimantName: claim.claimantName,
              amountClaimed: claim.amountClaimed,
              currency: claim.currency,
              dateOfService: claim.dateOfService,
              providerName: claim.providerName,
            },
            extractedTreatmentInfo: getExtractedField(extractedData, "extraction", "extractedTreatmentInfo") ?? null,
            expenses: getExtractedField(extractedData, "assessment", "expenses")
              ?? getExtractedField(extractedData, "extraction", "expenses") ?? null,
            medicalReport: getExtractedField(extractedData, "extraction", "medicalReport") ?? null,
            classifiedDocuments: getExtractedField(extractedData, "extraction", "classifiedDocuments") ?? null,
            coverageAnalysis: getExtractedField(extractedData, "assessment", "coverageAnalysis") ?? null,
            benefitGrouping: getExtractedField(extractedData, "assessment", "benefitGrouping") ?? null,
            automationResult: getExtractedField(extractedData, "assessment", "automationResult") ?? null,
            medicalNecessityResult: (extractedData.medicalNecessity as Record<string, unknown>) ?? extractedData._mnResult ?? null,
            preExistingResult: (extractedData.preExisting as Record<string, unknown>) ?? extractedData._preExResult ?? null,
            imageForensicsResult: (extractedData.imageForensics as Record<string, unknown>) ?? null,
          }, null, 2),
        }],
        details: { claimId: params.claimId },
      };
    },
  };

  // ─── Tool 2: Fetch Claim History ──────────────────────────────────────────

  const fetchClaimHistoryTool: AgentTool = {
    name: "fetch_claim_history",
    label: "Fetching Claim History",
    description:
      "Retrieves historical claims for the same claimant. Use this to detect patterns like " +
      "claim frequency, amount escalation, provider concentration, and repeat diagnoses.",
    parameters: Type.Object({
      claimId: Type.String({ description: "The claim ID (used to find claimant and exclude from history)" }),
    }),
    async execute(_toolCallId, params) {
      // First get the current claim to find claimantName
      const claimData = await gqlQuery<{ claimsById: Record<string, unknown> }>(
        FETCH_CLAIM_WITH_ALL_RESULTS_QUERY,
        { id: params.claimId },
      );

      const claimantName = claimData.claimsById?.claimantName as string | null;
      if (!claimantName) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              claims: [],
              message: "No claimant name found — cannot retrieve history.",
              totalClaims: 0,
            }),
          }],
          details: { claimId: params.claimId },
        };
      }

      const historyData = await gqlQuery<{ claims: Record<string, unknown>[] }>(
        FETCH_CLAIM_HISTORY_QUERY,
        { claimantName, excludeId: params.claimId },
      );

      const claims = historyData.claims ?? [];

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            claimantName,
            claims: claims.map((c) => ({
              claimNumber: c.claimNumber,
              status: c.status,
              amountClaimed: c.amountClaimed,
              currency: c.currency,
              dateOfService: c.dateOfService,
              providerName: c.providerName,
              createdAt: c.createdAt,
              // Include summary of aiSummary (JSON store) if available
              extractedDiagnosis: (getExtractedField(parseExtractedData(c.aiSummary), "extraction", "extractedTreatmentInfo") as Record<string, unknown>)?.diagnosis ?? null,
              extractedIcdCode: (getExtractedField(parseExtractedData(c.aiSummary), "extraction", "extractedTreatmentInfo") as Record<string, unknown>)?.icdCode ?? null,
            })),
            totalClaims: claims.length,
          }, null, 2),
        }],
        details: { claimId: params.claimId, historyCount: claims.length },
      };
    },
  };

  // ─── Tool 3: Fetch Certificate Details ────────────────────────────────────

  const fetchCertificateDetailsTool: AgentTool = {
    name: "fetch_certificate_details",
    label: "Fetching Certificate Details",
    description:
      "Retrieves policy/certificate details from the claim's extractedData. " +
      "Use this to check policy lifecycle, coverage scope, and beneficiary information " +
      "for FWA analysis. Note: Full certificate/policy tables are not yet available in Banyan.",
    parameters: Type.Object({
      claimId: Type.String({ description: "The claim ID to fetch certificate details for" }),
    }),
    async execute(_toolCallId, params) {
      const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
        FETCH_CLAIM_WITH_ALL_RESULTS_QUERY,
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

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            claimId: claim.id,
            claimNumber: claim.claimNumber,
            claimantName: claim.claimantName,
            dateOfService: claim.dateOfService,
            providerName: claim.providerName,
            admissionDate: treatmentInfo?.admissionDate ?? null,
            dischargeDate: treatmentInfo?.dischargeDate ?? null,
            policyNumber: treatmentInfo?.policyNumber ?? null,
            patientName: treatmentInfo?.patientName ?? null,
            dateOfBirth: treatmentInfo?.dateOfBirth ?? null,
            gender: treatmentInfo?.gender ?? null,
            limitation: "Full certificate and policy tables are not yet available in Banyan. " +
              "Policy lifecycle analysis is limited to what is available in claim records.",
          }, null, 2),
        }],
        details: { claimId: params.claimId },
      };
    },
  };

  // ─── Tool 4: Save FWA Result ──────────────────────────────────────────────

  const saveFWAResultTool: AgentTool = {
    name: "save_fwa_result",
    label: "Saving FWA Result",
    description:
      "Saves the FWA investigation result (risk score, flags, recommendation, and report) " +
      "to the claim record. Call this ONCE after completing your analysis. This is MANDATORY.",
    parameters: Type.Object({
      riskScore: Type.Number({ description: "Overall fraud risk score (0 = no risk, 100 = confirmed fraud)" }),
      riskLevel: Type.Union([
        Type.Literal("LOW"),
        Type.Literal("MEDIUM"),
        Type.Literal("HIGH"),
        Type.Literal("CRITICAL"),
      ], { description: "Risk level: LOW (0-30), MEDIUM (31-55), HIGH (56-80), CRITICAL (81-100)" }),
      flags: Type.Array(
        Type.Object({
          category: Type.Union([
            Type.Literal("BILLING_PATTERN"),
            Type.Literal("PROVIDER"),
            Type.Literal("CLINICAL"),
            Type.Literal("DOCUMENT"),
            Type.Literal("TIMING"),
            Type.Literal("POLICY"),
            Type.Literal("IDENTITY"),
            Type.Literal("PRE_EXISTING"),
            Type.Literal("IMAGE_FORENSICS"),
          ], { description: "Category of the detected fraud indicator" }),
          title: Type.String({ description: "Short title (e.g., 'Claim Timing Anomaly')" }),
          description: Type.String({ description: "Human-readable description of the finding" }),
          severity: Type.Union([
            Type.Literal("LOW"),
            Type.Literal("MEDIUM"),
            Type.Literal("HIGH"),
          ], { description: "Severity: LOW, MEDIUM, or HIGH" }),
          evidence: Type.String({ description: "Supporting evidence from claim data" }),
          classification: Type.Union([
            Type.Literal("FRAUD"),
            Type.Literal("WASTE"),
            Type.Literal("ABUSE"),
          ], { description: "F/W/A classification: FRAUD (intentional deception), WASTE (unnecessary costs), ABUSE (improper practices)" }),
        }),
        { description: "List of detected fraud indicators (max 8, quality over quantity)" },
      ),
      recommendation: Type.Union([
        Type.Literal("CLEAR"),
        Type.Literal("REVIEW"),
        Type.Literal("INVESTIGATE"),
      ], { description: "CLEAR = no action, REVIEW = standard review, INVESTIGATE = detailed investigation" }),
      summary: Type.String({ description: "Brief 2-3 sentence narrative explaining the FWA assessment" }),
      reportMarkdown: Type.String({ description: "Full investigation report in markdown format" }),
      claimHistoryAnalyzed: Type.Number({ description: "Number of historical claims examined" }),
    }),
    async execute(_toolCallId, params) {
      // Cast params — TypeBox validates at runtime, but AgentTool types params as unknown
      const p = params as {
        riskScore: number;
        riskLevel: string;
        flags: Array<{
          category: string;
          title: string;
          description: string;
          severity: string;
          evidence: string;
          classification: string;
        }>;
        recommendation: string;
        summary: string;
        reportMarkdown: string;
        claimHistoryAnalyzed: number;
      };

      // ── Evidence quality gate — reject flags with thin/vague evidence ──
      const VAGUE_PATTERNS = [
        /could indicate/i, /may suggest/i, /potentially/i,
        /worth noting/i, /cannot be determined/i, /no data available/i,
        /might be/i, /possibly/i, /appears to be somewhat/i,
      ];

      const qualityFlags = p.flags.filter(flag => {
        if (!flag.evidence || flag.evidence.trim().length < 20) return false;
        const combined = `${flag.description} ${flag.evidence}`;
        if (VAGUE_PATTERNS.some(pat => pat.test(combined))) return false;
        return true;
      });

      // ── Flag cap — max 8, keep highest severity first ──
      const SEV_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const cappedFlags = qualityFlags
        .sort((a, b) => (SEV_ORDER[b.severity] ?? 0) - (SEV_ORDER[a.severity] ?? 0))
        .slice(0, 8);

      // ── Mechanical scoring — diminishing returns per severity ──
      const SEVERITY_WEIGHTS: Record<string, number> = { HIGH: 20, MEDIUM: 10, LOW: 3 };
      let rawScore = 0;
      const sevCount: Record<string, number> = {};
      for (const flag of cappedFlags) {
        const sev = flag.severity;
        sevCount[sev] = (sevCount[sev] ?? 0) + 1;
        const weight = SEVERITY_WEIGHTS[sev] ?? 3;
        rawScore += sevCount[sev] === 1 ? weight : weight * 0.5;
      }
      const computedScore = Math.min(100, Math.round(rawScore));

      // ── Risk level from computed score ──
      const hasHighFlag = cappedFlags.some(f => f.severity === "HIGH");
      let riskLevel: string;
      if (computedScore >= 70 && hasHighFlag) {
        riskLevel = "CRITICAL";
      } else if (computedScore >= 45) {
        riskLevel = "HIGH";
      } else if (computedScore >= 20) {
        riskLevel = "MEDIUM";
      } else {
        riskLevel = "LOW";
      }

      // ── Recommendation from risk level ──
      let recommendation: string;
      if (riskLevel === "CRITICAL") {
        recommendation = "INVESTIGATE";
      } else if (riskLevel === "HIGH") {
        recommendation = "REVIEW";
      } else {
        recommendation = "CLEAR";
      }

      // ── Log scoring delta for monitoring ──
      const agentScore = p.riskScore;
      const agentLevel = p.riskLevel;
      const agentFlagCount = p.flags.length;
      const filteredOutCount = agentFlagCount - cappedFlags.length;
      if (computedScore !== agentScore || riskLevel !== agentLevel || filteredOutCount > 0) {
        console.log(
          `[FWA scoring] claimId=${claimId} agent_score=${agentScore} computed_score=${computedScore} ` +
          `agent_level=${agentLevel} computed_level=${riskLevel} ` +
          `agent_flags=${agentFlagCount} quality_flags=${cappedFlags.length} filtered_out=${filteredOutCount}`,
        );
      }

      const fwaResult = {
        riskScore: computedScore,
        riskLevel,
        flags: cappedFlags,
        recommendation,
        summary: p.summary,
        reportMarkdown: p.reportMarkdown,
        claimHistoryAnalyzed: p.claimHistoryAnalyzed,
        completedAt: new Date().toISOString(),
      };

      await mergeExtractedData(claimId, fwaResult, "fwa");

      saveToolCalled = true;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            riskScore: fwaResult.riskScore,
            riskLevel: fwaResult.riskLevel,
            flagCount: fwaResult.flags.length,
            recommendation: fwaResult.recommendation,
            scoring: {
              agentScore,
              computedScore,
              agentFlagCount,
              qualityFlagCount: cappedFlags.length,
              filteredOut: filteredOutCount,
            },
          }, null, 2),
        }],
        details: {
          claimId,
          riskScore: fwaResult.riskScore,
          riskLevel: fwaResult.riskLevel,
          recommendation: fwaResult.recommendation,
        },
      };
    },
  };

  const allTools = [
    fetchClaimWithAllResultsTool,
    fetchClaimHistoryTool,
    fetchCertificateDetailsTool,
    saveFWAResultTool,
  ];

  return {
    allTools,
    saveToolCalled: () => saveToolCalled,
    saveToolName: "save_fwa_result",
  };
}
