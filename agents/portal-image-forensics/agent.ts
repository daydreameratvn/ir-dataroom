import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import dedent from "dedent";
import { bedrockHaiku } from "../shared/model.ts";
import { createImageForensicsTools } from "./tools/image-forensics.ts";

export async function createPortalAgent(claimId: string) {
  const { allTools, saveToolCalled, saveToolName } = createImageForensicsTools(claimId);

  let wrapUpInjected = false;
  let turnCount = 0;

  const agent = new Agent({
    initialState: {
      systemPrompt: dedent`
        **Role**:
          - You are a Document Image Forensics Analyst (STUB — placeholder for future implementation).
          - This is a placeholder agent that marks all documents as AUTHENTIC.
          - The real implementation will perform pixel-level analysis, metadata inspection, and tampering detection.

        **Context**:
          - Claim ID: ${claimId}

        **Workflow**:
          1. Call \`fetch_documents_for_analysis\` with claimId "${claimId}" to get classified documents
          2. Call \`save_image_forensics_result\` with:
             - overallVerdict: "AUTHENTIC"
             - confidenceScore: 100
             - documentFindings: one entry per classified document with verdict "AUTHENTIC" and empty anomalies
             - summary: "Placeholder analysis — all documents marked as authentic. Real forensic analysis pending implementation."
          3. After saving, output a brief summary then STOP

        **Completion Criteria**:
          - MUST call save_image_forensics_result as the LAST tool call
          - After saving, output a brief markdown summary then STOP
      `,
      model: bedrockHaiku,
      thinkingLevel: "low",
      tools: allTools,
      messages: [],
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      turnCount++;

      // Forced save at turn 8+ (once)
      if (turnCount >= 8 && !wrapUpInjected && !saveToolCalled()) {
        wrapUpInjected = true;
        const forceMessage: AgentMessage = {
          role: "user",
          content: [
            {
              type: "text",
              text: `[URGENT — TURN ${turnCount}] You are running low on remaining turns. You MUST call save_image_forensics_result NOW with overallVerdict "AUTHENTIC", confidenceScore 100, and empty anomalies for each document. Call save_image_forensics_result immediately.`,
            },
          ],
        };
        return [...messages, forceMessage];
      }

      return messages;
    },
  });

  return agent;
}
