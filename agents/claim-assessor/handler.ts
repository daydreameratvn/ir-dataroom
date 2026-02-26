import { createClaimAssessorAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";

/**
 * Handler for the claim assessor agent.
 * Accepts a claim code, creates the agent, and returns an SSE stream.
 */
export async function handleClaimAssessor(request: {
  claimCode: string;
  text?: string;
}) {
  const { claimCode, text } = request;

  const agent = await createClaimAssessorAgent(claimCode);

  const prompt = text ?? `Thẩm định yêu cầu bồi thường ${claimCode}`;
  agent.prompt(prompt).catch(console.error);

  return createSSEResponse(agent);
}
