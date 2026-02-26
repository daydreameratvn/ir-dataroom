import { createDocumentComplianceAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";

/**
 * Handler for the document compliance agent.
 */
export async function handleDocumentCompliance(request: { claimCode: string }) {
  const { claimCode } = request;

  const agent = await createDocumentComplianceAgent(claimCode);

  agent.prompt(
    `Kiểm tra tính đầy đủ hồ sơ cho yêu cầu bồi thường ${claimCode}. Phát hành pending codes nếu hồ sơ thiếu.`,
  ).catch(console.error);

  return createSSEResponse(agent);
}
