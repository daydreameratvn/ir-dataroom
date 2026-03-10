import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

const mockGqlQuery = vi.fn();

vi.mock("../shared/graphql-client.ts", () => ({
  gqlQuery: (...args: unknown[]) => mockGqlQuery(...args),
}));

import { SessionStore } from "./session-store.ts";
import type { SessionContext } from "./session-store.ts";

describe("SessionStore", () => {
  let store: SessionStore;
  const testContext: SessionContext = {
    documents: [{ fileName: "test.pdf", fileType: "application/pdf", fileUrl: "https://example.com/test.pdf" }],
    pageCount: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store = new SessionStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe("create", () => {
    it("should call insertAgentSessions with correct fields", async () => {
      mockGqlQuery.mockResolvedValue({
        insertAgentSessions: { returning: [{ id: "test-id" }] },
      });

      const id = await store.create({
        agentType: "maktub",
        context: testContext,
        tenantId: "428d0815-d95b-4cfc-89af-9fca38585dcc",
        userId: "user-123",
        metadata: { source: "mobile" },
      });

      expect(id).toBeDefined();
      expect(mockGqlQuery).toHaveBeenCalledOnce();

      const [query, vars] = mockGqlQuery.mock.calls[0]!;
      expect(query).toContain("insertAgentSessions");
      const obj = vars.objects[0];
      expect(obj.agentType).toBe("maktub");
      expect(obj.status).toBe("active");
      expect(obj.triggerType).toBe("user");
      expect(obj.tenantId).toBe("428d0815-d95b-4cfc-89af-9fca38585dcc");
      expect(obj.createdBy).toBe("user-123");
      expect(JSON.parse(obj.inputSummary)).toEqual(testContext);
      expect(JSON.parse(obj.outputSummary)).toEqual({ source: "mobile" });
      expect(obj.result).toBe("[]");
    });

    it("should default metadata to empty object and userId to null", async () => {
      mockGqlQuery.mockResolvedValue({
        insertAgentSessions: { returning: [{ id: "test-id" }] },
      });

      await store.create({
        agentType: "maktub",
        context: testContext,
        tenantId: "tenant-1",
      });

      const obj = mockGqlQuery.mock.calls[0]![1].objects[0];
      expect(JSON.parse(obj.outputSummary)).toEqual({});
      expect(obj.createdBy).toBeNull();
    });
  });

  describe("saveMessages", () => {
    it("should use DDN v3 set syntax (not _set) for result field", async () => {
      mockGqlQuery.mockResolvedValue({ updateAgentSessionsById: { affectedRows: 1 } });
      const messages = [{ role: "user", content: [{ type: "text", text: "hello" }] }];

      await store.saveMessages("session-1", messages as any);

      expect(mockGqlQuery).toHaveBeenCalledOnce();
      const [query, vars] = mockGqlQuery.mock.calls[0]!;
      expect(query).toContain("updateAgentSessionsById");
      expect(vars.update.result).toEqual({ set: JSON.stringify(messages) });
      // Must NOT use _set
      expect(vars.update.result).not.toHaveProperty("_set");
    });
  });

  describe("updateStatus", () => {
    it("should use DDN v3 set syntax for status field", async () => {
      mockGqlQuery.mockResolvedValue({ updateAgentSessionsById: { affectedRows: 1 } });

      await store.updateStatus("session-1", "completed");

      const [query, vars] = mockGqlQuery.mock.calls[0]!;
      expect(query).toContain("updateAgentSessionsById");
      expect(vars.update.status).toEqual({ set: "completed" });
      expect(vars.update.status).not.toHaveProperty("_set");
    });
  });

  describe("updateMetadata", () => {
    it("should merge with existing metadata and use set syntax", async () => {
      // First call: load current metadata
      mockGqlQuery.mockResolvedValueOnce({
        agentSessionsById: { outputSummary: JSON.stringify({ existing: "value" }) },
      });
      // Second call: update
      mockGqlQuery.mockResolvedValueOnce({ updateAgentSessionsById: { affectedRows: 1 } });

      await store.updateMetadata("session-1", { newKey: "newValue" });

      expect(mockGqlQuery).toHaveBeenCalledTimes(2);

      // Verify the update call (second call)
      const [, vars] = mockGqlQuery.mock.calls[1]!;
      const saved = JSON.parse(vars.update.outputSummary.set);
      expect(saved).toEqual({ existing: "value", newKey: "newValue" });
      expect(vars.update.outputSummary).not.toHaveProperty("_set");
    });

    it("should handle null existing metadata", async () => {
      mockGqlQuery.mockResolvedValueOnce({
        agentSessionsById: { outputSummary: null },
      });
      mockGqlQuery.mockResolvedValueOnce({ updateAgentSessionsById: { affectedRows: 1 } });

      await store.updateMetadata("session-1", { key: "value" });

      const [, vars] = mockGqlQuery.mock.calls[1]!;
      const saved = JSON.parse(vars.update.outputSummary.set);
      expect(saved).toEqual({ key: "value" });
    });
  });

  describe("loadSession", () => {
    it("should parse JSON fields from DDN response", async () => {
      const context = { documents: [], pageCount: 0 };
      const messages = [{ role: "assistant", content: [{ type: "text", text: "hi" }] }];
      mockGqlQuery.mockResolvedValue({
        agentSessionsById: {
          id: "s-1",
          agentType: "maktub",
          status: "active",
          inputSummary: JSON.stringify(context),
          result: JSON.stringify(messages),
          outputSummary: JSON.stringify({ key: "val" }),
          tenantId: "t-1",
          createdAt: "2026-03-10T00:00:00Z",
          updatedAt: "2026-03-10T00:00:00Z",
        },
      });

      const session = await store.loadSession("s-1");

      expect(session).not.toBeNull();
      expect(session!.context).toEqual(context);
      expect(session!.messages).toEqual(messages);
      expect(session!.metadata).toEqual({ key: "val" });
    });

    it("should return null for deleted sessions", async () => {
      mockGqlQuery.mockResolvedValue({
        agentSessionsById: {
          id: "s-1",
          agentType: "maktub",
          status: "deleted",
          inputSummary: null,
          result: null,
          outputSummary: null,
          tenantId: "t-1",
          createdAt: "2026-03-10T00:00:00Z",
          updatedAt: "2026-03-10T00:00:00Z",
        },
      });

      const session = await store.loadSession("s-1");
      expect(session).toBeNull();
    });

    it("should return null when session not found", async () => {
      mockGqlQuery.mockResolvedValue({ agentSessionsById: null });

      const session = await store.loadSession("nonexistent");
      expect(session).toBeNull();
    });
  });

  describe("recordEvent", () => {
    it("should call insertAgentActions with correct fields", async () => {
      mockGqlQuery.mockResolvedValue({ insertAgentActions: { returning: [{ id: "a-1" }] } });

      // Set up agent entry so sequence works
      store.setAgent("session-1", {} as any, testContext, "tenant-1");

      await store.recordEvent(
        "session-1",
        { eventType: "tool_call", content: "hello", metadata: { tool: "search" } },
        "tenant-1",
      );

      const [query, vars] = mockGqlQuery.mock.calls[0]!;
      expect(query).toContain("insertAgentActions");
      const obj = vars.objects[0];
      expect(obj.sessionId).toBe("session-1");
      expect(obj.sequenceNumber).toBe(1);
      expect(obj.actionType).toBe("tool_call");
      expect(obj.inputText).toBe("hello");
      expect(JSON.parse(obj.resultText)).toEqual({ tool: "search" });
      expect(obj.tenantId).toBe("tenant-1");
    });

    it("should not throw on GraphQL error", async () => {
      mockGqlQuery.mockRejectedValue(new Error("network error"));

      await expect(
        store.recordEvent("session-1", { eventType: "test" }, "tenant-1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("in-memory agent map", () => {
    it("should store and retrieve agents", () => {
      const agent = { prompt: vi.fn() } as any;
      store.setAgent("s-1", agent, testContext, "tenant-1");

      const entry = store.getAgent("s-1");
      expect(entry).toBeDefined();
      expect(entry!.agent).toBe(agent);
      expect(entry!.context).toBe(testContext);
      expect(entry!.tenantId).toBe("tenant-1");
    });

    it("should increment sequence numbers", () => {
      store.setAgent("s-1", {} as any, testContext, "tenant-1");

      expect(store.nextSequence("s-1")).toBe(1);
      expect(store.nextSequence("s-1")).toBe(2);
      expect(store.nextSequence("s-1")).toBe(3);
    });

    it("should return 1 for unknown session", () => {
      expect(store.nextSequence("unknown")).toBe(1);
    });
  });
});
