import type { Agent } from "@mariozechner/pi-agent-core";
import type { SessionStore } from "./session-store.ts";

/**
 * Subscribe to all agent events and record them to the session store.
 * Also persists the full message history after each agent turn.
 */
export function recordAgentEvents(
  agent: Agent,
  sessionId: string,
  tenantId: string,
  store: SessionStore,
): void {
  let fullAssistantText = "";

  agent.subscribe(async (event: any) => {
    switch (event.type) {
      case "agent_start":
        await store.recordEvent(sessionId, { eventType: "agent_start" }, tenantId);
        break;

      case "message_end": {
        // Capture the full assistant text from the message
        if (event.message?.role === "assistant") {
          const textParts = (event.message.content ?? [])
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text);
          fullAssistantText = textParts.join("");
          await store.recordEvent(
            sessionId,
            {
              eventType: "assistant_message",
              content: fullAssistantText,
            },
            tenantId,
          );
          fullAssistantText = "";
        }
        break;
      }

      case "tool_execution_start":
        await store.recordEvent(
          sessionId,
          {
            eventType: "tool_call",
            content: event.toolName,
            metadata: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
            },
          },
          tenantId,
        );
        break;

      case "tool_execution_end": {
        const resultText = event.result?.content?.[0]?.text;
        await store.recordEvent(
          sessionId,
          {
            eventType: "tool_result",
            content: resultText ? (resultText.length > 10_000 ? resultText.slice(0, 10_000) + "..." : resultText) : null,
            metadata: {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              isError: event.result?.isError ?? false,
            },
          },
          tenantId,
        );
        break;
      }

      case "agent_end":
        // Persist full message history for resumption
        await store.saveMessages(sessionId, agent.state.messages);
        await store.recordEvent(sessionId, { eventType: "agent_end" }, tenantId);
        break;
    }
  });
}
