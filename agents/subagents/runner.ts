/**
 * Generic sub-agent runner.
 *
 * Creates a pi-agent-core Agent from a SubAgentDefinition and runs it
 * with a task string. Handles image injection, timeout, event streaming,
 * and final text extraction — following the pi-subagent communication model
 * (task in → text out).
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";

import { bedrockOpus } from "../shared/model.ts";
import type { SubAgentDefinition, SubAgentRunOptions, SubAgentResult } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 180_000; // 3 minutes

/**
 * Run a sub-agent with a task string and return its result.
 *
 * The sub-agent runs in isolation: it receives the task as its user prompt,
 * optionally with injected images, and returns the final assistant text.
 * The caller can also access raw messages for structured data extraction.
 */
export async function runSubAgent(
  definition: SubAgentDefinition,
  task: string,
  options?: SubAgentRunOptions,
): Promise<SubAgentResult> {
  const toolsCalled: string[] = [];
  let documentsInjected = false;

  const agent = new Agent({
    initialState: {
      systemPrompt: definition.systemPrompt,
      model: definition.model ?? bedrockOpus,
      tools: definition.tools,
      thinkingLevel: definition.thinking ?? "medium",
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const result = [...messages];

      // Inject images on first turn (same pattern as existing compliance/drone agents)
      if (!documentsInjected && options?.images?.length) {
        const userMsgCount = messages.filter(m => "role" in m && m.role === "user").length;
        if (userMsgCount <= 1) {
          documentsInjected = true;
          result.push({
            role: "user",
            content: options.images.map(f => ({
              type: "image" as const,
              data: f.data,
              mimeType: f.mimeType,
            })),
            timestamp: Date.now(),
          });
        }
      }

      return result;
    },
  });

  // Subscribe to events for tracking and streaming
  agent.subscribe((e) => {
    switch (e.type) {
      case "tool_execution_start":
        toolsCalled.push(e.toolName);
        options?.onUpdate?.({ phase: "tool_start", toolName: e.toolName });
        break;
      case "tool_execution_end":
        options?.onUpdate?.({ phase: "tool_end", toolName: e.toolName });
        break;
      case "message_update":
        if (e.assistantMessageEvent?.type === "text_delta") {
          options?.onUpdate?.({ phase: "generating", text: e.assistantMessageEvent.delta });
        }
        break;
    }
  });

  // Run with timeout
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.warn(`[SubAgent:${definition.name}] timeout after ${timeoutMs}ms, aborting`);
      agent.abort();
      reject(new Error(`SUBAGENT_TIMEOUT`));
    }, timeoutMs);
  });

  // Also handle external abort signal
  if (options?.signal) {
    options.signal.addEventListener("abort", () => {
      agent.abort();
    }, { once: true });
  }

  try {
    await Promise.race([agent.prompt(task), timeoutPromise]);
  } catch (error) {
    const isTimeout = error instanceof Error && error.message === "SUBAGENT_TIMEOUT";
    const messages = agent.state.messages;
    const text = extractFinalText(messages);

    // On timeout, return partial results if available
    if (isTimeout && text) {
      return {
        text,
        toolsCalled,
        messages,
        success: false,
        error: `Sub-agent ${definition.name} timed out after ${timeoutMs / 1000}s (partial result returned)`,
      };
    }

    return {
      text: "",
      toolsCalled,
      messages,
      success: false,
      error: isTimeout
        ? `Sub-agent ${definition.name} timed out after ${timeoutMs / 1000}s`
        : (error instanceof Error ? error.message : String(error)),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }

  const messages = agent.state.messages;
  const text = extractFinalText(messages);

  return { text, toolsCalled, messages, success: true };
}

/** Extract the last assistant text from agent messages (same as pi-subagent's getFinalOutput). */
function extractFinalText(messages: AgentMessage[]): string {
  const lastAssistant = messages.findLast(m => "role" in m && m.role === "assistant");
  if (!lastAssistant || !("content" in lastAssistant) || !Array.isArray(lastAssistant.content)) {
    return "";
  }
  return lastAssistant.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}
