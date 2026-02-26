import { createComplianceAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";

/**
 * Handler for the compliance agent.
 */
export async function handleComplianceCheck(request: { claimCode: string }) {
  const { claimCode } = request;

  const { agent } = await createComplianceAgent(claimCode);

  agent.prompt(
    `Kiểm tra tính đầy đủ hồ sơ cho yêu cầu bồi thường ${claimCode}. Hãy xác minh tất cả tài liệu cần thiết đã được nộp và nội dung hợp lệ.`,
  ).catch(console.error);

  return createSSEResponse(agent);
}
