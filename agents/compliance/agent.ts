import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import { graphql } from "@papaya/graphql/sdk";
import BPromise from "bluebird";
import dedent from "dedent";
import { fileTypeFromStream } from "file-type";
import got from "got";

import { getClient } from "../shared/graphql-client.ts";
import { bedrockOpus } from "../shared/model.ts";
import {
  findSimilarApprovedClaimsTool,
  getComplianceRuleTool,
  runComplianceCheckTool,
  saveComplianceRuleTool,
} from "../shared/tools/compliance.ts";
import { claimTool, insuredTool } from "../shared/tools/index.ts";

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

/**
 * Creates a compliance sub-agent for document compliance validation.
 *
 * This agent does NOT issue pending codes — it only reports compliance status.
 * The parent assessor agent is responsible for issuing pending codes based on the report.
 */
export async function createComplianceAgent(claimCode: string) {
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
        claim_case: { code: { _eq: claimCode } },
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
        if (fileType == null) return null;
        if (!SUPPORTED_IMAGE_TYPES.has(fileType.mime)) return null;
        const buffer = await got(document.file.url).buffer();
        const base64 = buffer.toString("base64");
        return { data: base64, mimeType: fileType.mime };
      } catch (error) {
        console.error("[compliance-agent] Error downloading document:", error);
        return null;
      }
    },
    { concurrency: 5 },
  );
  const validFiles = files.filter(Boolean) as { data: string; mimeType: string }[];

  let documentsInjected = false;

  const systemPrompt = dedent`
    **Role**: Bạn là chuyên gia kiểm tra tính đầy đủ hồ sơ bảo hiểm (Document Compliance Specialist).
    Phản hồi và suy nghĩ bằng tiếng Việt.

    **Claim code**: ${claimCode}

    **Mission**: Kiểm tra xem hồ sơ yêu cầu bồi thường có đầy đủ theo quy định không.
    Báo cáo tình trạng thiếu/đủ tài liệu. Bạn KHÔNG phát hành pending codes — chỉ báo cáo tình trạng.

    **Quy trình**:
    1. Gọi runComplianceCheck để kiểm tra tình trạng tài liệu theo quy định
    2. Gọi getComplianceRule để kiểm tra quy tắc đã học
    3. Nếu chưa có quy tắc, gọi findSimilarApprovedClaims để tham khảo
    4. Phân tích hình ảnh tài liệu (tên, ngày, số tiền, tính nhất quán)
    5. Lưu quy tắc mới qua saveComplianceRule nếu phát hiện pattern nhất quán
    6. Tạo báo cáo compliance bằng tiếng Việt

    **Output format**:
    ## Kết quả kiểm tra hồ sơ — ${claimCode}

    **Trạng thái**: ĐẠT / CẦN BỔ SUNG

    **Tài liệu có mặt**:
    - [Danh sách]

    **Tài liệu thiếu** (nếu có):
    - [Danh sách]

    **Nhận xét**:
    - [Chi tiết từ phân tích hình ảnh]
  `;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockOpus,
      tools: [
        runComplianceCheckTool,
        findSimilarApprovedClaimsTool,
        getComplianceRuleTool,
        saveComplianceRuleTool,
        claimTool,
        insuredTool,
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

  return { agent, validFiles };
}
