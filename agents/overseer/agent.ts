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
import { googleSearchTool } from "../shared/tools/google-search.ts";
import { medicalProviderTool, medicalProvidersTool } from "../shared/tools/medical-provider.ts";
import {
  claimForFraudAnalysisTool,
  findSimilarClaimsTool,
  insuredClaimHistoryTool,
  insuredPersonDetailsTool,
  recordFraudFindingTool,
  scanClaimsForFraudTool,
} from "./tools/index.ts";

/**
 * Creates an Overseer Agent - Fraud Detection Specialist.
 *
 * Named after the Starcraft II unit, Overseer detects invisible threats
 * and has the widest field of view.
 */
export async function createOverseerAgent(claimCode: string) {
  const client = getClient();

  // Fetch claim documents
  const { data } = await client.query({
    query: graphql(`
      query ClaimCaseDocumentsForOverseer($where: claim_documents_bool_exp!) {
        claim_documents(where: $where) {
          id
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

  const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

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
      - You are Overseer, an expert fraud detection specialist for insurance claims.
      - Named after the Starcraft II unit, you detect invisible threats and see patterns others miss.
      - 10+ years of experience in insurance fraud investigation.
      - Responses must be in Vietnamese unless requested otherwise.

    **Primary Mission**:
      Detect fraudulent use of insurance certificates, specifically:
      - One certificate being used by multiple different real-life persons
      - Identity fraud where non-insured persons claim using insured's policy
      - Pattern anomalies indicating potential fraud

    **Detection Methods**:
      1. **Age Consistency**: Compare patient age across claims
      2. **Weight Patterns**: Check weight consistency
      3. **Time-of-Day Patterns**: Unusual timing patterns
      4. **Diagnosis Patterns**: Inconsistent or contradictory diagnoses
      5. **Vital Signs**: Inconsistent readings across claims
      6. **Medical Test Results**: Including imaging if available
      7. **Claim History**: Frequency, amounts, and patterns
      8. **Medical Provider Patterns**: Unusual concentration at specific providers

    **Strike System**:
      - GREEN: First warning, soft alert
      - YELLOW: Second occurrence, elevated concern
      - RED: Multiple occurrences, high risk

    **Output Format**:
      ## Báo cáo Phân tích Gian lận

      **Mã yêu cầu**: [claim code]
      **Người được bảo hiểm**: [name]
      **Điểm rủi ro**: [0-100]

      ### Phát hiện bất thường
      [List of anomalies with evidence]

      ### Đề xuất hành động
      [Recommended actions]

      ## Kết luận
      [Final summary and recommendation]
  `;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockSonnet,
      tools: [
        claimTool,
        insuredTool,
        claimForFraudAnalysisTool,
        findSimilarClaimsTool,
        insuredClaimHistoryTool,
        insuredPersonDetailsTool,
        recordFraudFindingTool,
        scanClaimsForFraudTool,
        googleSearchTool,
        medicalProviderTool,
        medicalProvidersTool,
      ],
      thinkingLevel: "high",
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
