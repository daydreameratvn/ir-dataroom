import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import { graphql } from "@papaya/graphql/sdk";
import BPromise from "bluebird";
import dedent from "dedent";
import { fileTypeFromStream } from "file-type";
import got from "got";

import { getClient } from "../shared/graphql-client.ts";
import { bedrockSonnet } from "../shared/model.ts";
import { claimTool, insuredTool } from "../shared/tools/index.ts";
import {
  runComplianceCheckTool,
  findSimilarApprovedClaimsTool,
  getComplianceRuleTool,
  saveComplianceRuleTool,
} from "../shared/tools/compliance.ts";
import {
  getClaimContextForTemplatesTool,
  getInsurerPendingCodeMappingTool,
  getPendingCodeMappingTool,
  getPendingCodeTemplatesTool,
  issuePendingCodesTool,
} from "../shared/tools/pending-codes.ts";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

/**
 * Creates a Document Compliance Agent - Document Validation Specialist.
 * Validates insurance claim documents against regulatory requirements
 * and issues pending codes when documents are missing.
 */
export async function createDocumentComplianceAgent(claimCode: string) {
  const client = getClient();

  const { data } = await client.query({
    query: graphql(`
      query ClaimCaseDocumentsForCompliance($where: claim_documents_bool_exp!) {
        claim_documents(where: $where) {
          id type
          file { id bucket_name_v2 bucket_object_key url }
        }
      }
    `),
    variables: {
      where: {
        deleted_at: { _is_null: true },
        claim_case: { code: { _eq: claimCode } },
        file: { original_file_id: { _is_null: true } },
        type: { _nin: ["SignOffForm"] },
      },
    },
  });

  const validFiles = (await BPromise.map(
    data?.claim_documents ?? [],
    async (document) => {
      try {
        if (document.file?.url == null) return null;
        const fileType = await fileTypeFromStream(got.stream(document.file.url));
        if (fileType == null) return null;
        if (!SUPPORTED_IMAGE_TYPES.has(fileType.mime)) return null;
        const buffer = await got(document.file.url).buffer();
        return { data: buffer.toString("base64"), mimeType: fileType.mime };
      } catch {
        return null;
      }
    },
    { concurrency: 5 },
  )).filter(Boolean) as { data: string; mimeType: string }[];

  let documentsInjected = false;

  const systemPrompt = dedent`
    **Role**:
      - You are a Document Compliance Specialist for insurance claims.
      - You ensure claim documents meet regulatory requirements before assessment.
      - Responses must be in Vietnamese unless requested otherwise.

    **Primary Mission**:
      Validate that insurance claim documents are complete and accurate.
      You are the gatekeeper ensuring document quality.

    **Validation Process**:
      1. Identify Benefit Type
      2. Check Document Presence
      3. Validate Document Content
      4. Learn from Past Claims
      5. Issue Pending Codes if documents are missing
      6. Generate Report

    **Knowledge Building**:
      - Use getComplianceRule to check learned patterns
      - Use findSimilarApprovedClaims if no rules exist
      - Use saveComplianceRule to store consistent patterns

    **Pending Code Issuance Workflow** (when documents are missing):
      1. getPendingCodeMapping to map missing document types to pending codes
      2. getClaimContextForTemplates to get placeholder values
      3. getPendingCodeTemplates to get base template text
      4. issuePendingCodes to create records

    **Output Format**:
      ## Báo cáo Kiểm tra Hồ sơ
      **Mã yêu cầu**: [claim code]
      **Loại quyền lợi**: [benefit type]
      **Trạng thái**: ĐẠT / CẦN BỔ SUNG

      ### Hồ sơ đã nhận
      ### Hồ sơ còn thiếu (nếu có)
      ### Pending Codes đã phát hành (nếu có)
      ### Đề xuất
      ## Kết luận

    **Rules**:
      - Never approve a claim with missing required documents
      - ALWAYS issue pending codes when documents are missing
  `;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockSonnet,
      tools: [
        runComplianceCheckTool,
        findSimilarApprovedClaimsTool,
        getComplianceRuleTool,
        saveComplianceRuleTool,
        claimTool,
        insuredTool,
        getClaimContextForTemplatesTool,
        getInsurerPendingCodeMappingTool,
        getPendingCodeMappingTool,
        getPendingCodeTemplatesTool,
        issuePendingCodesTool,
      ],
      thinkingLevel: "medium",
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const result = [...messages];

      if (!documentsInjected && validFiles.length > 0) {
        const userMessageCount = messages.filter((m) => "role" in m && m.role === "user").length;
        if (userMessageCount <= 1) {
          documentsInjected = true;
          const imageContent = validFiles.map((f) => ({
            type: "image" as const,
            data: f.data,
            mimeType: f.mimeType,
          }));
          result.push({
            role: "user",
            content: imageContent,
            timestamp: Date.now(),
          });
        }
      }

      return result;
    },
  });

  return agent;
}
