import type { Agent, AgentEvent, AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import dedent from "dedent";

/**
 * Extract structured compliance data from the sub-agent's messages.
 */
function extractComplianceResult(messages: AgentMessage[], claimCode: string) {
  let complianceData: {
    claimCode: string;
    benefitType?: string;
    compliant: boolean;
    documentPresence?: { presentDocuments?: string[]; missingRequired?: string[] };
    claimDetails?: Record<string, unknown>;
  } | null = null;

  for (const msg of messages) {
    if (
      "role" in msg && msg.role === "toolResult" &&
      "toolName" in msg && (msg as any).toolName === "runComplianceCheck" &&
      !("isError" in msg && (msg as any).isError)
    ) {
      try {
        const textContent = Array.isArray(msg.content)
          ? msg.content.find((c: any) => c.type === "text")
          : null;
        if (textContent && "text" in textContent) {
          complianceData = JSON.parse((textContent as any).text);
        }
      } catch {
        // Parse error, continue
      }
    }
  }

  let reportText = "";
  const lastAssistant = messages.findLast(
    (m) => "role" in m && m.role === "assistant",
  );
  if (lastAssistant && "content" in lastAssistant && Array.isArray(lastAssistant.content)) {
    reportText = lastAssistant.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("");
  }

  const compliant = complianceData?.compliant ?? false;
  const missingRequired = complianceData?.documentPresence?.missingRequired ?? [];
  const presentDocuments = complianceData?.documentPresence?.presentDocuments ?? [];

  return {
    claimCode,
    compliant,
    report: reportText,
    missingRequired,
    presentDocuments,
    benefitType: complianceData?.benefitType,
    claimDetails: complianceData?.claimDetails,
    canProceedWithAssessment: compliant,
    hasStructuredData: complianceData !== null,
  };
}

export const invokeComplianceAgentTool: AgentTool = {
  name: "invokeComplianceAgent",
  label: "Document Compliance Check",
  description: dedent`
    Invoke the Document Compliance Agent to perform a comprehensive document compliance check.
    Use this tool FIRST before starting any claim assessment.

    The compliance agent does NOT issue pending codes — it only reports compliance status.
    If documents are missing, YOU (the assessor) must issue pending codes.

    Returns structured result with: compliant, missingRequired, presentDocuments, report.
  `,
  parameters: Type.Object({
    claimCode: Type.String({ description: "The claim code to check compliance for (e.g., RE-XX-XXXXXX)" }),
  }),
  execute: async (toolCallId, { claimCode }, _signal, onUpdate) => {
    let agent: Agent | null = null;

    try {
      // Lazy import to avoid circular dependency
      const { createComplianceAgent } = await import("../../compliance/agent.ts");

      const result = await createComplianceAgent(claimCode);
      agent = result.agent;

      if (onUpdate) {
        agent.subscribe((e: AgentEvent) => {
          switch (e.type) {
            case "tool_execution_start":
              onUpdate({
                content: [{ type: "text", text: `[sub-agent] Running ${e.toolName}...` }],
                details: { phase: "tool_start", toolName: e.toolName },
              });
              break;
            case "tool_execution_end":
              onUpdate({
                content: [{ type: "text", text: `[sub-agent] Completed ${e.toolName}` }],
                details: { phase: "tool_end", toolName: e.toolName },
              });
              break;
            case "message_update":
              if (e.assistantMessageEvent.type === "text_delta") {
                onUpdate({
                  content: [{ type: "text", text: e.assistantMessageEvent.delta }],
                  details: { phase: "generating" },
                });
              }
              break;
          }
        });
      }

      // Run agent with 180s timeout
      let complianceTimer: ReturnType<typeof setTimeout> | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        complianceTimer = setTimeout(() => {
          console.warn(`[invokeComplianceAgent] ${claimCode} timeout after 180s, aborting sub-agent`);
          agent!.abort();
          reject(new Error("COMPLIANCE_TIMEOUT"));
        }, 180_000);
      });

      try {
        await Promise.race([
          agent.prompt(
            `Kiểm tra tính đầy đủ hồ sơ cho yêu cầu bồi thường ${claimCode}. Hãy xác minh tất cả tài liệu cần thiết đã được nộp và nội dung hợp lệ.`,
          ),
          timeoutPromise,
        ]);
      } finally {
        if (complianceTimer) clearTimeout(complianceTimer);
      }

      const extracted = extractComplianceResult(agent.state.messages, claimCode);

      return {
        content: [{ type: "text", text: JSON.stringify({
          ...extracted,
          message: extracted.compliant
            ? "Document compliance check passed. You may proceed with assessment."
            : `Document compliance check found issues. Missing ${extracted.missingRequired.length} document(s): ${extracted.missingRequired.join(", ")}. YOU must issue pending codes for missing documents.`,
        }) }],
        details: { compliant: extracted.compliant },
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "COMPLIANCE_TIMEOUT";

      if (isTimeout && agent) {
        const extracted = extractComplianceResult(agent.state.messages, claimCode);
        if (extracted.hasStructuredData) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              ...extracted,
              timedOut: true,
              message: extracted.compliant
                ? "Document compliance check passed (agent timed out but structured check completed)."
                : `Missing ${extracted.missingRequired.length} document(s): ${extracted.missingRequired.join(", ")}. YOU must issue pending codes. (Agent timed out but structured check completed.)`,
            }) }],
            details: { compliant: extracted.compliant, timedOut: true },
          };
        }
      }

      console.error(`[invokeComplianceAgent] ${isTimeout ? "Timeout" : "Error"} for ${claimCode}:`, error);

      return {
        content: [{ type: "text", text: JSON.stringify({
          claimCode,
          compliant: false,
          error: isTimeout ? "Compliance check timed out after 180s" : (error instanceof Error ? error.message : "Unknown error"),
          message: isTimeout
            ? "Compliance check timed out with no data. Proceed with caution or retry."
            : "Failed to run compliance check. Please try again or check manually.",
        }) }],
        details: { error: true },
      };
    }
  },
};
