/**
 * Sub-agent type definitions, following the pi-subagent structural pattern.
 *
 * Sub-agents are specialized agents defined as structured configs
 * (name, description, model, thinking, tools, systemPrompt) that run
 * in isolation and return final text output to the parent agent.
 */

import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { Model } from "@mariozechner/pi-ai";

/** Structured definition of a sub-agent. */
export interface SubAgentDefinition {
  /** Unique identifier for the sub-agent. */
  name: string;
  /** Human-readable description (shown to parent agent for selection). */
  description: string;
  /** LLM model override. Defaults to bedrockOpus if not specified. */
  model?: Model;
  /** Thinking/reasoning level. */
  thinking?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Tools available to this sub-agent. */
  tools: AgentTool[];
  /** System prompt — the sub-agent's complete instructions. */
  systemPrompt: string;
}

/** Options for running a sub-agent. */
export interface SubAgentRunOptions {
  /** Images to inject into the agent's first turn (for document analysis). */
  images?: { data: string; mimeType: string }[];
  /** Timeout in ms. Default: 180_000 (3 minutes). */
  timeoutMs?: number;
  /** Streaming progress callback. */
  onUpdate?: (update: { phase: string; toolName?: string; text?: string }) => void;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

/** Result of a sub-agent run. */
export interface SubAgentResult {
  /** Final assistant text output. */
  text: string;
  /** Names of tools that were called during the run. */
  toolsCalled: string[];
  /** Raw messages for structured data extraction by the caller. */
  messages: AgentMessage[];
  /** Whether the run completed without error. */
  success: boolean;
  /** Error message if success is false. */
  error?: string;
}
