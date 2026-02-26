import type { AgentEvent, AgentMessage, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";

// Custom agent messages for approval workflow
declare module "@mariozechner/pi-agent-core" {
  interface CustomAgentMessages {
    approvalRequest: {
      role: "approvalRequest";
      toolCallId: string;
      toolName: string;
      params: unknown;
      timestamp: number;
    };
    approvalResponse: {
      role: "approvalResponse";
      toolCallId: string;
      approved: boolean;
      timestamp: number;
    };
  }
}

// SSE event types sent to the frontend
export type SSEEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "approval_request"; toolCallId: string; toolName: string; params: unknown }
  | { type: "message_end"; text: string }
  | { type: "error"; message: string };

// Tools that require approval before execution
export const APPROVAL_TOOLS = new Set([
  "saveDetailForm",
  "assessBenefit",
  "createSignOff",
  "approve",
  "issuePendingCodes",
  "createSupplementRequest",
]);

// Approval sentinel returned by tools that need approval
export const APPROVAL_SENTINEL = "__APPROVAL_REQUIRED__";

export function isApprovalResult(result: AgentToolResult<unknown>): boolean {
  return result.content.some(
    (c) => c.type === "text" && (c as TextContent).text === APPROVAL_SENTINEL,
  );
}

export type { AgentEvent, AgentMessage };
