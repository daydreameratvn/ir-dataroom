import type { Agent, AgentEvent } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";

import { APPROVAL_TOOLS, isApprovalResult } from "./types.ts";
import type { SSEEvent } from "./types.ts";

/**
 * Creates an SSE Response that streams agent events to the frontend.
 *
 * Subscribes to the agent's event system and maps pi-mono events
 * to our SSE protocol. Handles approval interception.
 */
export function createSSEResponse(
  agent: Agent,
  options?: { headers?: Record<string, string>; onApprovalRequest?: (toolCallId: string, toolName: string, params: unknown) => void },
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(event: SSEEvent) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream may be closed
        }
      }

      const unsubscribe = agent.subscribe((e: AgentEvent) => {
        switch (e.type) {
          case "agent_start":
            send({ type: "agent_start" });
            break;

          case "agent_end": {
            // Check for agent error and send it before closing
            if (agent.state.error) {
              send({ type: "error", message: agent.state.error });
            }
            send({ type: "agent_end" });
            try {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch {
              // Already closed
            }
            break;
          }

          case "message_update": {
            const evt = e.assistantMessageEvent;
            if (evt.type === "text_delta") {
              send({ type: "text_delta", delta: evt.delta });
            } else if (evt.type === "thinking_delta") {
              send({ type: "thinking_delta", delta: evt.delta });
            }
            break;
          }

          case "message_end": {
            // Extract full text from the assistant message
            const msg = e.message;
            if (msg.role === "assistant") {
              const textParts = msg.content
                .filter((c): c is TextContent => c.type === "text")
                .map((c) => c.text)
                .join("");
              send({ type: "message_end", text: textParts });
            }
            break;
          }

          case "tool_execution_start":
            send({
              type: "tool_start",
              toolCallId: e.toolCallId,
              toolName: e.toolName,
              args: e.args,
            });
            break;

          case "tool_execution_update":
            send({
              type: "tool_update",
              toolCallId: e.toolCallId,
              toolName: e.toolName,
              partialResult: e.partialResult,
            });
            break;

          case "tool_execution_end": {
            // Check if this is an approval sentinel
            if (APPROVAL_TOOLS.has(e.toolName) && isApprovalResult(e.result)) {
              const params = e.result?.details?.params;
              send({
                type: "approval_request",
                toolCallId: e.toolCallId,
                toolName: e.toolName,
                params,
              });
              options?.onApprovalRequest?.(e.toolCallId, e.toolName, params);
            } else {
              send({
                type: "tool_end",
                toolCallId: e.toolCallId,
                toolName: e.toolName,
                result: e.result,
                isError: e.isError,
              });
            }
            break;
          }
        }
      });

      // Clean up on stream cancel
      const checkClosed = setInterval(() => {
        if (controller.desiredSize === null || controller.desiredSize < 0) {
          unsubscribe();
          clearInterval(checkClosed);
        }
      }, 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      ...options?.headers,
    },
  });
}
