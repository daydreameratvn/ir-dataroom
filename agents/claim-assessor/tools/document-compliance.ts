import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";
import BPromise from "bluebird";
import dedent from "dedent";
import { fileTypeFromStream } from "file-type";
import got from "got";

import { getClient } from "../../shared/graphql-client.ts";
import { createDocumentComplianceDefinition, runSubAgent } from "../../subagents/index.ts";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

/**
 * Pre-fetch claim document images for the compliance sub-agent.
 */
async function fetchClaimDocumentImages(claimCode: string): Promise<{ data: string; mimeType: string }[]> {
  const client = getClient();
  const { data } = await client.query({
    query: graphql(`
      query ClaimCaseDocumentsForComplianceV2Pi($where: claim_documents_bool_exp!) {
        claim_documents(where: $where) {
          id
          file { id bucket_name_v2 bucket_object_key url }
        }
      }
    `),
    variables: {
      where: {
        claim_case: { code_v2: { _eq: claimCode } },
        file: { original_file_id: { _is_null: true } },
        type: { _nin: ["SignOffForm"] },
      },
    },
  });

  const files = await BPromise.map(
    data?.claim_documents ?? [],
    async (document) => {
      try {
        if (document.file?.url == null) return null;
        const fileType = await fileTypeFromStream(got.stream(document.file.url));
        if (fileType == null || !SUPPORTED_IMAGE_TYPES.has(fileType.mime)) return null;
        const buffer = await got(document.file.url).buffer();
        return { data: buffer.toString("base64"), mimeType: fileType.mime };
      } catch {
        return null;
      }
    },
    { concurrency: 5 },
  );

  return files.filter(Boolean) as { data: string; mimeType: string }[];
}

/**
 * Extract structured compliance data from the sub-agent's raw messages.
 */
function extractComplianceResult(messages: AgentMessage[], claimCode: string) {
  let complianceData: {
    claimCode: string;
    benefitType?: string;
    compliant: boolean;
    documentPresence?: { presentDocuments?: string[]; missingRequired?: string[] };
    claimDetails?: Record<string, unknown>;
  } | null = null;

  for (const msg of messages) {
    if (
      "role" in msg && msg.role === "toolResult" &&
      "toolName" in msg && (msg as any).toolName === "runComplianceCheck" &&
      !("isError" in msg && (msg as any).isError)
    ) {
      try {
        const textContent = Array.isArray(msg.content)
          ? msg.content.find((c: any) => c.type === "text")
          : null;
        if (textContent && "text" in textContent) {
          complianceData = JSON.parse((textContent as any).text);
        }
      } catch {
        // Parse error, continue
      }
    }
  }

  const compliant = complianceData?.compliant ?? false;
  const missingRequired = complianceData?.documentPresence?.missingRequired ?? [];
  const presentDocuments = complianceData?.documentPresence?.presentDocuments ?? [];

  return {
    claimCode,
    compliant,
    missingRequired,
    presentDocuments,
    benefitType: complianceData?.benefitType,
    claimDetails: complianceData?.claimDetails,
    canProceedWithAssessment: compliant,
    hasStructuredData: complianceData !== null,
  };
}

export const invokeComplianceAgentTool: AgentTool = {
  name: "invokeComplianceAgent",
  label: "Document Compliance Check",
  description: dedent`
    Invoke the Document Compliance Sub-Agent to check healthcare claim document completeness
    following the 7-part validation rules (case type ID, required document matrix, per-document
    validation, cross-document consistency, supplementary request templates).

    The compliance agent does NOT issue pending codes — it only reports compliance status.
    If documents are missing, YOU (the assessor) must issue pending codes.

    Returns structured result with: compliant, missingRequired, presentDocuments, report.
  `,
  parameters: Type.Object({
    claimCode: Type.String({ description: "The claim code to check compliance for (e.g., RE-XX-XXXXXX)" }),
  }),
  execute: async (toolCallId, { claimCode }, _signal, onUpdate) => {
    try {
      // 1. Pre-fetch document images
      console.log(`[invokeComplianceAgent] ${claimCode} fetching document images...`);
      const images = await fetchClaimDocumentImages(claimCode);
      console.log(`[invokeComplianceAgent] ${claimCode} found ${images.length} document images`);

      // 2. Create sub-agent definition with the 7-part healthcare compliance rules
      const definition = createDocumentComplianceDefinition(claimCode);

      // 3. Run the sub-agent via the generic runner
      const result = await runSubAgent(
        definition,
        `Kiểm tra tính đầy đủ hồ sơ cho yêu cầu bồi thường ${claimCode}. Hãy xác minh tất cả tài liệu cần thiết đã được nộp và nội dung hợp lệ.`,
        {
          images,
          timeoutMs: 180_000,
          onUpdate: onUpdate ? (update) => {
            switch (update.phase) {
              case "tool_start":
                onUpdate({
                  content: [{ type: "text", text: `[sub-agent] Running ${update.toolName}...` }],
                  details: { phase: "tool_start", toolName: update.toolName },
                });
                break;
              case "tool_end":
                onUpdate({
                  content: [{ type: "text", text: `[sub-agent] Completed ${update.toolName}` }],
                  details: { phase: "tool_end", toolName: update.toolName },
                });
                break;
              case "generating":
                if (update.text) {
                  onUpdate({
                    content: [{ type: "text", text: update.text }],
                    details: { phase: "generating" },
                  });
                }
                break;
            }
          } : undefined,
        },
      );

      // 4. Extract structured compliance data from raw messages
      const extracted = extractComplianceResult(result.messages, claimCode);
      const report = result.text || "(no report generated)";

      return {
        content: [{ type: "text", text: JSON.stringify({
          ...extracted,
          report,
          message: extracted.compliant
            ? "Document compliance check passed. You may proceed with assessment."
            : `Document compliance check found issues. Missing ${extracted.missingRequired.length} document(s): ${extracted.missingRequired.join(", ")}. YOU must issue pending codes for missing documents.`,
          ...(result.error ? { timedOut: true, timeoutMessage: result.error } : {}),
        }) }],
        details: { compliant: extracted.compliant },
      };
    } catch (error) {
      console.error(`[invokeComplianceAgent] Error for ${claimCode}:`, error);

      return {
        content: [{ type: "text", text: JSON.stringify({
          claimCode,
          compliant: false,
          error: error instanceof Error ? error.message : "Unknown error",
          message: "Failed to run compliance check. Please try again or check manually.",
        }) }],
        details: { error: true },
      };
    }
  },
};
