import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pi-agent-core Agent
const mockPrompt = vi.fn();
const mockSubscribe = vi.fn();
const mockAbort = vi.fn();
const mockState = { messages: [] as any[] };

vi.mock("@mariozechner/pi-agent-core", () => {
  return {
    Agent: class MockAgent {
      prompt = mockPrompt;
      subscribe = mockSubscribe;
      abort = mockAbort;
      state = mockState;
      constructor(_config: any) {}
    },
  };
});

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

  it("should return success with extracted text on successful run", async () => {
    mockState.messages = [
      {
        role: "assistant",
        content: [{ type: "text", text: "Agent response text" }],
        timestamp: Date.now(),
      },
    ];
    mockPrompt.mockResolvedValue(undefined);

    const result = await runSubAgent(testDefinition, "Do something");

    expect(result.success).toBe(true);
    expect(result.text).toBe("Agent response text");
    expect(result.error).toBeUndefined();
  });

  it("should return empty text when no assistant messages", async () => {
    mockState.messages = [];
    mockPrompt.mockResolvedValue(undefined);

    const result = await runSubAgent(testDefinition, "Do something");

    expect(result.success).toBe(true);
    expect(result.text).toBe("");
  });

  it("should return error result on non-timeout failure", async () => {
    mockState.messages = [];
    mockPrompt.mockRejectedValue(new Error("Model error"));

    const result = await runSubAgent(testDefinition, "Do something");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Model error");
  });

  it("should track tool calls via subscribe", async () => {
    let subscribeCallback: (e: any) => void = () => {};
    mockSubscribe.mockImplementation((cb: any) => {
      subscribeCallback = cb;
    });
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

  it("should call onUpdate callback for events", async () => {
    const onUpdate = vi.fn();
    let subscribeCallback: (e: any) => void = () => {};
    mockSubscribe.mockImplementation((cb: any) => {
      subscribeCallback = cb;
    });
    mockPrompt.mockImplementation(async () => {
      subscribeCallback({ type: "tool_execution_start", toolName: "testTool" });
    });
    mockState.messages = [];

    await runSubAgent(testDefinition, "task", { onUpdate });

    expect(onUpdate).toHaveBeenCalledWith({ phase: "tool_start", toolName: "testTool" });
  });

  it("should return partial result on timeout if text available", async () => {
    mockState.messages = [
      { role: "assistant", content: [{ type: "text", text: "partial" }], timestamp: Date.now() },
    ];
    // Simulate timeout by making prompt hang
    mockPrompt.mockImplementation(() => new Promise(() => {}));

    const result = await runSubAgent(testDefinition, "task", { timeoutMs: 50 });

    expect(result.success).toBe(false);
    expect(result.text).toBe("partial");
    expect(result.error).toContain("timed out");
  });

  it("should return empty result on timeout with no messages", async () => {
    mockState.messages = [];
    mockPrompt.mockImplementation(() => new Promise(() => {}));

    const result = await runSubAgent(testDefinition, "task", { timeoutMs: 50 });

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(result.error).toContain("timed out");
  });
});
