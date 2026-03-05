import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrompt = vi.fn();
const mockSubscribe = vi.fn();
const mockAbort = vi.fn();
const mockState = { messages: [] as any[] };

vi.mock("@mariozechner/pi-agent-core", () => ({
  Agent: class MockAgent {
    prompt = mockPrompt;
    subscribe = mockSubscribe;
    abort = mockAbort;
    state = mockState;
    constructor(_config: any) {}
  },
}));

vi.mock("../shared/model.ts", () => ({
  bedrockOpus: { id: "mock-model" },
}));

import { runSubAgent } from "./runner.ts";
import type { SubAgentDefinition } from "./types.ts";

const testDefinition: SubAgentDefinition = {
  name: "test-agent",
  description: "Test agent",
  tools: [],
  systemPrompt: "You are a test agent.",
};

describe("runSubAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.messages = [];
  });

  describe("successful execution", () => {
    it("should return success=true with extracted assistant text", async () => {
      mockState.messages = [
        { role: "assistant", content: [{ type: "text", text: "Agent response text" }], timestamp: Date.now() },
      ];
      mockPrompt.mockResolvedValue(undefined);

      const result = await runSubAgent(testDefinition, "Do something");

      expect(result.success).toBe(true);
      expect(result.text).toBe("Agent response text");
      expect(result.error).toBeUndefined();
    });

    it("should return empty text when agent produces no assistant messages", async () => {
      mockState.messages = [];
      mockPrompt.mockResolvedValue(undefined);

      const result = await runSubAgent(testDefinition, "Do something");

      expect(result.success).toBe(true);
      expect(result.text).toBe("");
    });

    it("should concatenate multiple text blocks from last assistant message", async () => {
      mockState.messages = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
          timestamp: Date.now(),
        },
      ];
      mockPrompt.mockResolvedValue(undefined);

      const result = await runSubAgent(testDefinition, "task");

      expect(result.text).toBe("Hello world");
    });
  });

  describe("error handling", () => {
    it("should return success=false with error message on agent failure", async () => {
      mockState.messages = [];
      mockPrompt.mockRejectedValue(new Error("Model error"));

      const result = await runSubAgent(testDefinition, "Do something");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Model error");
    });

    it("should stringify non-Error throws", async () => {
      mockState.messages = [];
      mockPrompt.mockRejectedValue("string error");

      const result = await runSubAgent(testDefinition, "task");

      expect(result.success).toBe(false);
      expect(result.error).toBe("string error");
    });
  });

  describe("timeout behavior", () => {
    it("should return partial result with error when sub-agent times out but has text", async () => {
      mockState.messages = [
        { role: "assistant", content: [{ type: "text", text: "partial" }], timestamp: Date.now() },
      ];
      mockPrompt.mockImplementation(() => new Promise(() => {}));

      const result = await runSubAgent(testDefinition, "task", { timeoutMs: 50 });

      expect(result.success).toBe(false);
      expect(result.text).toBe("partial");
      expect(result.error).toContain("timed out");
    });

    it("should return empty result with error when sub-agent times out with no messages", async () => {
      mockState.messages = [];
      mockPrompt.mockImplementation(() => new Promise(() => {}));

      const result = await runSubAgent(testDefinition, "task", { timeoutMs: 50 });

      expect(result.success).toBe(false);
      expect(result.text).toBe("");
      expect(result.error).toContain("timed out");
    });

    it("should abort the agent on timeout", async () => {
      mockState.messages = [];
      mockPrompt.mockImplementation(() => new Promise(() => {}));

      await runSubAgent(testDefinition, "task", { timeoutMs: 50 });

      expect(mockAbort).toHaveBeenCalled();
    });
  });

  describe("event streaming", () => {
    it("should track tool call names via subscribe events", async () => {
      let subscribeCallback: (e: any) => void = () => {};
      mockSubscribe.mockImplementation((cb: any) => { subscribeCallback = cb; });
      mockPrompt.mockImplementation(async () => {
        subscribeCallback({ type: "tool_execution_start", toolName: "myTool" });
        subscribeCallback({ type: "tool_execution_end", toolName: "myTool" });
      });
      mockState.messages = [
        { role: "assistant", content: [{ type: "text", text: "done" }], timestamp: Date.now() },
      ];

      const result = await runSubAgent(testDefinition, "task");

      expect(result.toolsCalled).toContain("myTool");
    });

    it("should forward tool_start events to onUpdate callback", async () => {
      const onUpdate = vi.fn();
      let subscribeCallback: (e: any) => void = () => {};
      mockSubscribe.mockImplementation((cb: any) => { subscribeCallback = cb; });
      mockPrompt.mockImplementation(async () => {
        subscribeCallback({ type: "tool_execution_start", toolName: "testTool" });
      });
      mockState.messages = [];

      await runSubAgent(testDefinition, "task", { onUpdate });

      expect(onUpdate).toHaveBeenCalledWith({ phase: "tool_start", toolName: "testTool" });
    });

    it("should forward tool_end events to onUpdate callback", async () => {
      const onUpdate = vi.fn();
      let subscribeCallback: (e: any) => void = () => {};
      mockSubscribe.mockImplementation((cb: any) => { subscribeCallback = cb; });
      mockPrompt.mockImplementation(async () => {
        subscribeCallback({ type: "tool_execution_end", toolName: "testTool" });
      });
      mockState.messages = [];

      await runSubAgent(testDefinition, "task", { onUpdate });

      expect(onUpdate).toHaveBeenCalledWith({ phase: "tool_end", toolName: "testTool" });
    });

    it("should forward text_delta events to onUpdate callback", async () => {
      const onUpdate = vi.fn();
      let subscribeCallback: (e: any) => void = () => {};
      mockSubscribe.mockImplementation((cb: any) => { subscribeCallback = cb; });
      mockPrompt.mockImplementation(async () => {
        subscribeCallback({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "streaming text" },
        });
      });
      mockState.messages = [];

      await runSubAgent(testDefinition, "task", { onUpdate });

      expect(onUpdate).toHaveBeenCalledWith({ phase: "generating", text: "streaming text" });
    });

    it("should not crash when onUpdate is not provided", async () => {
      let subscribeCallback: (e: any) => void = () => {};
      mockSubscribe.mockImplementation((cb: any) => { subscribeCallback = cb; });
      mockPrompt.mockImplementation(async () => {
        subscribeCallback({ type: "tool_execution_start", toolName: "tool" });
      });
      mockState.messages = [];

      await expect(runSubAgent(testDefinition, "task")).resolves.toBeDefined();
    });
  });
});
