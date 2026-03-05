/**
 * Document Compliance Sub-Agent Definition.
 *
 * Specialized sub-agent for checking healthcare claim document completeness
 * and validity. Uses comprehensive rules from the AI_Agent_Kiem_Tra_Dung_Du_Chung_Tu
 * document (v1.0, 2026-03-05).
 *
 * This agent:
 * 1. Identifies case type (Outpatient/Inpatient/Accident)
 * 2. Checks required documents per case type
 * 3. Validates each document's content
 * 4. Cross-checks consistency across documents
 * 5. Generates supplementary request templates for missing/invalid items
 */

import dedent from "dedent";

import {
  claimTool,
  findSimilarApprovedClaimsTool,
  getComplianceRuleTool,
  insuredTool,
  runComplianceCheckTool,
  saveComplianceRuleTool,
} from "../shared/tools/index.ts";
import { DOCUMENT_COMPLIANCE_RULES } from "../compliance/rules/document-compliance-healthcare.ts";
import type { SubAgentDefinition } from "./types.ts";

/**
 * Create a document compliance sub-agent definition for a specific claim.
 * The claim code is embedded in the system prompt.
 */
export function createDocumentComplianceDefinition(claimCode: string): SubAgentDefinition {
  return {
    name: "document-compliance",
    description: "Kiểm tra tính đầy đủ và hợp lệ hồ sơ bồi thường CSSK theo quy tắc 7 phần",
    thinking: "medium",
    tools: [
      runComplianceCheckTool,
      findSimilarApprovedClaimsTool,
      getComplianceRuleTool,
      saveComplianceRuleTool,
      claimTool,
      insuredTool,
    ],
    systemPrompt: buildSystemPrompt(claimCode),
  };
}

function buildSystemPrompt(claimCode: string): string {
  return dedent`
    **Role**: Bạn là chuyên gia kiểm tra tính đầy đủ hồ sơ bảo hiểm (Document Compliance Specialist).
    Phản hồi và suy nghĩ bằng tiếng Việt.

    **Claim code**: ${claimCode}

    **Mission**: Kiểm tra xem hồ sơ yêu cầu bồi thường có đầy đủ và hợp lệ theo quy định không.
    Bạn KHÔNG phát hành pending codes — chỉ báo cáo tình trạng. Agent cha sẽ xử lý pending codes.

    **QUY TẮC KIỂM TRA HỒ SƠ (7 PHẦN)**:
    ${DOCUMENT_COMPLIANCE_RULES}

    **Quy trình thực hiện**:
    1. Gọi runComplianceCheck với claim code để lấy danh sách chứng từ hiện có
    2. Gọi claim tool để lấy thông tin hồ sơ (tên NĐBH, loại quyền lợi, số tiền)
    3. Phân tích hình ảnh tài liệu đính kèm (nếu có)
    4. Xác định loại hồ sơ theo Phần 1.2 (Ngoại trú / Nội trú / Nha khoa / Thai sản / Tai nạn)
    5. Đối chiếu chứng từ hiện có với ma trận bắt buộc (Phần 3)
    6. Kiểm tra chi tiết từng chứng từ theo Phần 4
    7. Kiểm tra chéo giữa các chứng từ theo Phần 5
    8. Gọi getComplianceRule để kiểm tra quy tắc đã học (nếu có)
    9. Nếu phát hiện pattern nhất quán, gọi saveComplianceRule
    10. Tạo báo cáo theo format dưới đây

    **Output format**:
    ## Kết quả kiểm tra hồ sơ — ${claimCode}

    **Loại hồ sơ**: [Ngoại trú / Nội trú / Nha khoa / Thai sản (khám thai) / Thai sản (sinh đẻ) / Tai nạn ngoại trú / Tai nạn nội trú]

    **Trạng thái**: ĐẠT / CẦN BỔ SUNG

    **Tài liệu có mặt**:
    - [Danh sách với mã viết tắt: GYC, HĐ GTGT, BKCT, DTHUOC, BCYTE, ...]

    **Tài liệu thiếu** (nếu có):
    - [Danh sách với mã viết tắt]

    **Cảnh báo** (nếu có):
    - [Danh sách cảnh báo từ Phần 4 và Phần 5]

    **Yêu cầu bổ sung** (nếu có):
    - [Nội dung soạn sẵn theo mẫu Phần 6]
  `;
}
