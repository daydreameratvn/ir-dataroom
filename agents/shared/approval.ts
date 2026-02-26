import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { TSchema } from "@sinclair/typebox";

import { APPROVAL_SENTINEL, APPROVAL_TOOLS } from "./types.ts";

/**
 * Wraps a tool's execute function so that approval-required tools return a sentinel
 * instead of actually executing. The real execution happens after user approval.
 *
 * The original execute function is stored on the tool as `_realExecute`.
 */
export function wrapToolForApproval<T extends TSchema>(
  tool: AgentTool<T> & { _realExecute?: AgentTool<T>["execute"] },
): AgentTool<T> {
  if (!APPROVAL_TOOLS.has(tool.name)) return tool;

  // Store the real execute function
  const realExecute = tool.execute;
  tool._realExecute = realExecute;

  return {
    ...tool,
    _realExecute: realExecute,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Return sentinel so the agent knows this needs approval
      return {
        content: [{ type: "text", text: APPROVAL_SENTINEL }],
        details: {
          needsApproval: true,
          toolCallId,
          toolName: tool.name,
          params,
        },
      } as AgentToolResult<unknown>;
    },
  };
}

/**
 * Execute the real (unwrapped) tool after user approval
 */
export async function executeApprovedTool<T extends TSchema>(
  tool: AgentTool<T> & { _realExecute?: AgentTool<T>["execute"] },
  toolCallId: string,
  params: unknown,
  signal?: AbortSignal,
): Promise<AgentToolResult<unknown>> {
  const executeFn = tool._realExecute ?? tool.execute;
  return executeFn(toolCallId, params as any, signal);
}
