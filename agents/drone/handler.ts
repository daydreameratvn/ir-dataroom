import { createDroneAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";

/**
 * Handler for the drone agent.
 * Accepts a claim code, creates the agent, and returns an SSE stream.
 */
export async function handleDrone(request: { claimCode: string }) {
  const { claimCode } = request;

  const agent = await createDroneAgent(claimCode);

  agent.prompt(
    `Thẩm định yêu cầu bồi thường ${claimCode}. Đây là hồ sơ thuốc mạn tính Tier 1.`,
  ).catch(console.error);

  return createSSEResponse(agent);
}
