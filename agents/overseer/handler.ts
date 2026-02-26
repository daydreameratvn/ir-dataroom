import { createOverseerAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";

/**
 * Handler for the Overseer fraud detection agent.
 */
export async function handleOverseer(request: { claimCode: string }) {
  const { claimCode } = request;

  const agent = await createOverseerAgent(claimCode);

  agent.prompt(
    `Phân tích gian lận cho yêu cầu bồi thường ${claimCode}. Kiểm tra tất cả các mẫu bất thường.`,
  ).catch(console.error);

  return createSSEResponse(agent);
}
