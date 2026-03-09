import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { gqlQuery } from "../../shared/graphql-client.ts";
import { mergeExtractedData, parseExtractedData, getExtractedField } from "../../portal-extraction/tools/claims.ts";
import type { DocumentForensicsResult } from "../../document-forensics/types.ts";

// ─── Forensics API Client ───────────────────────────────────────────────────

const FORENSICS_API_URL = process.env.FORENSICS_API_URL ?? "https://prod.banyan.services.papaya.asia";

export type ForensicsApiResponse = DocumentForensicsResult;

/**
 * Calls the document forensics API with a base64-encoded image.
 * Returns the forensics analysis result.
 */
export async function callForensicsApi(
  imageBase64: string,
  market: string,
): Promise<DocumentForensicsResult> {
  const response = await fetch(`${FORENSICS_API_URL}/forensics/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_base64: imageBase64,
      market,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Forensics API returned ${response.status}: ${body}`);
  }

  return response.json() as Promise<DocumentForensicsResult>;
}

// ─── GraphQL Queries ─────────────────────────────────────────────────────────

const FETCH_CLAIM_QUERY = `
  query FetchClaimForImageForensics($id: Uuid!) {
    claimsById(id: $id) {
      id
      claimNumber
      aiSummary
    }
  }
`;

// ─── Tool Factory ────────────────────────────────────────────────────────────

export function createImageForensicsTools(claimId: string) {

  let saveToolCalled = false;

  // ─── Tool 1: Fetch Documents for Analysis ─────────────────────────────────

  const fetchDocumentsTool: AgentTool = {
    name: "fetch_documents_for_analysis",
    label: "Fetching Documents",
    description:
      "Retrieves the classified documents from the extraction phase. " +
      "Returns document types, page numbers, and summaries for forensic analysis.",
    parameters: Type.Object({
      claimId: Type.String({ description: "The claim ID to fetch documents for" }),
    }),
    async execute(_toolCallId, params) {
      const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
        FETCH_CLAIM_QUERY,
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
      const classifiedDocuments = getExtractedField(extractedData, "extraction", "classifiedDocuments") ?? null;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            claimId: claim.id,
            claimNumber: claim.claimNumber,
            classifiedDocuments,
          }, null, 2),
        }],
        details: { claimId: params.claimId },
      };
    },
  };

  // ─── Tool 2: Save Image Forensics Result ──────────────────────────────────

  const saveResultTool: AgentTool = {
    name: "save_image_forensics_result",
    label: "Saving Forensics Result",
    description:
      "Saves the image forensics analysis result to the claim record. " +
      "Call this ONCE after completing your analysis. This is MANDATORY.",
    parameters: Type.Object({
      overallVerdict: Type.Union([
        Type.Literal("AUTHENTIC"),
        Type.Literal("SUSPICIOUS"),
        Type.Literal("TAMPERED"),
      ], { description: "Overall document authenticity verdict" }),
      confidenceScore: Type.Number({ description: "Confidence score (0-100)" }),
      documentFindings: Type.Array(
        Type.Object({
          documentType: Type.String({ description: "Type of document analyzed (e.g. Bill, MedicalCertificate)" }),
          pageNumbers: Type.Array(Type.Number(), { description: "1-indexed page numbers analyzed" }),
          verdict: Type.Union([
            Type.Literal("AUTHENTIC"),
            Type.Literal("SUSPICIOUS"),
            Type.Literal("TAMPERED"),
          ], { description: "Verdict for this document" }),
          anomalies: Type.Array(
            Type.Object({
              type: Type.String({ description: "Anomaly type (e.g. metadata_inconsistency, copy_move, splicing, font_mismatch)" }),
              severity: Type.Union([
                Type.Literal("LOW"),
                Type.Literal("MEDIUM"),
                Type.Literal("HIGH"),
              ], { description: "Anomaly severity" }),
              description: Type.String({ description: "Human-readable description of the anomaly" }),
              location: Type.Optional(Type.String({ description: "Location in the document where anomaly was detected" })),
            }),
            { description: "List of anomalies detected in this document" },
          ),
        }),
        { description: "Per-document analysis findings" },
      ),
      summary: Type.String({ description: "Brief 2-3 sentence summary of the forensics analysis" }),
      reportMarkdown: Type.Optional(Type.String({ description: "Full forensics report in markdown format" })),
    }),
    async execute(_toolCallId, params) {
      // Clamp confidence score
      let confidenceScore = params.confidenceScore;
      if (confidenceScore > 100) confidenceScore = 100;
      if (confidenceScore < 0) confidenceScore = 0;

      const totalDocumentsAnalyzed = params.documentFindings.length;
      const totalAnomaliesFound = params.documentFindings.reduce(
        (sum, doc) => sum + doc.anomalies.length, 0,
      );

      const result = {
        overallVerdict: params.overallVerdict,
        confidenceScore,
        documentFindings: params.documentFindings,
        summary: params.summary,
        reportMarkdown: params.reportMarkdown ?? null,
        totalDocumentsAnalyzed,
        totalAnomaliesFound,
        completedAt: new Date().toISOString(),
      };

      await mergeExtractedData(claimId, result, "imageForensics");

      saveToolCalled = true;

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            overallVerdict: result.overallVerdict,
            confidenceScore: result.confidenceScore,
            totalDocumentsAnalyzed,
            totalAnomaliesFound,
          }, null, 2),
        }],
        details: {
          claimId,
          overallVerdict: result.overallVerdict,
          confidenceScore: result.confidenceScore,
        },
      };
    },
  };

  const allTools = [fetchDocumentsTool, saveResultTool];

  return {
    allTools,
    saveToolCalled: () => saveToolCalled,
    saveToolName: "save_image_forensics_result",
  };
}
