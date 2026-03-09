import { createClaimSubmissionAgent } from "./agent.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";
import type { DocumentInfo } from "./tools/index.ts";

/**
 * Handler for the claim submission agent.
 */
export async function handleClaimSubmission(request: {
  allowedCertificateIds?: string[];
  documentAnalysis: string;
  documents?: DocumentInfo[];
  pageCount: number;
}) {
  const agent = await createClaimSubmissionAgent(request);

  agent.prompt(
    "Analyze the provided medical documents and submit insurance claims for each identified claim group.",
  ).catch(console.error);

  return createSSEResponse(agent);
}
