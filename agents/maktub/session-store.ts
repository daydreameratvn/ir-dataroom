import type { Agent, AgentMessage } from "@mariozechner/pi-agent-core";
import { gqlQuery } from "../shared/graphql-client.ts";
import type { DocumentInfo } from "./tools/index.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionContext {
  documents: DocumentInfo[];
  pageCount: number;
  allowedCertificateIds?: string[];
}

export interface SessionRecord {
  id: string;
  agentType: string;
  status: string;
  messages: AgentMessage[];
  context: SessionContext;
  metadata: Record<string, unknown>;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionEvent {
  eventType: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

interface InMemoryEntry {
  agent: Agent;
  context: SessionContext;
  tenantId: string;
  sequence: number;
}

// ─── DDN Field Mapping ──────────────────────────────────────────────────────
//
// The DDN agent_sessions table uses these fields for maktub session data:
//   inputSummary  → JSON-encoded SessionContext (documents, pageCount, etc.)
//   result        → JSON-encoded AgentMessage[] (conversation history)
//   outputSummary → JSON-encoded metadata (arbitrary key-value)
//   triggerType   → always "user" for maktub sessions
//   startedAt     → session creation timestamp
// ─────────────────────────────────────────────────────────────────────────────

// ─── Session Store ───────────────────────────────────────────────────────────

export class SessionStore {
  private agents = new Map<string, InMemoryEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupMemory(), 30 * 60 * 1000);
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async create(params: {
    agentType: string;
    context: SessionContext;
    tenantId: string;
    userId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await gqlQuery<{ insertAgentSessions: { returning: { id: string }[] } }>(
      `mutation CreateSession($objects: [InsertAgentSessionsObjectInput!]!) {
        insertAgentSessions(objects: $objects) { returning { id } }
      }`,
      {
        objects: [
          {
            id,
            agentType: params.agentType,
            status: "active",
            triggerType: "user",
            startedAt: new Date().toISOString(),
            inputSummary: JSON.stringify(params.context),
            outputSummary: JSON.stringify(params.metadata ?? {}),
            result: "[]",
            tenantId: params.tenantId,
            createdBy: params.userId ?? null,
          },
        ],
      },
    );
    return id;
  }

  // ── In-Memory Agent Map ─────────────────────────────────────────────────

  setAgent(sessionId: string, agent: Agent, context: SessionContext, tenantId: string): void {
    this.agents.set(sessionId, { agent, context, tenantId, sequence: 0 });
  }

  getAgent(sessionId: string): InMemoryEntry | undefined {
    return this.agents.get(sessionId);
  }

  nextSequence(sessionId: string): number {
    const entry = this.agents.get(sessionId);
    if (!entry) return 1;
    entry.sequence += 1;
    return entry.sequence;
  }

  // ── DB Operations ───────────────────────────────────────────────────────

  async loadSession(sessionId: string): Promise<SessionRecord | null> {
    const data = await gqlQuery<{
      agentSessionsById: {
        id: string;
        agentType: string;
        status: string;
        inputSummary: string | null;
        result: string | null;
        outputSummary: string | null;
        tenantId: string;
        createdAt: string;
        updatedAt: string;
      } | null;
    }>(
      `query GetSession($id: Uuid!) {
        agentSessionsById(id: $id) {
          id agentType status inputSummary result outputSummary
          tenantId createdAt updatedAt
        }
      }`,
      { id: sessionId },
    );
    const s = data?.agentSessionsById;
    if (!s || s.status === "deleted") return null;
    return {
      id: s.id,
      agentType: s.agentType,
      status: s.status,
      messages: JSON.parse(s.result ?? "[]"),
      context: JSON.parse(s.inputSummary ?? "{}"),
      metadata: JSON.parse(s.outputSummary ?? "{}"),
      tenantId: s.tenantId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async recordEvent(sessionId: string, event: SessionEvent, tenantId: string): Promise<void> {
    const seq = this.nextSequence(sessionId);
    try {
      await gqlQuery(
        `mutation RecordEvent($objects: [InsertAgentActionsObjectInput!]!) {
          insertAgentActions(objects: $objects) { returning { id } }
        }`,
        {
          objects: [
            {
              sessionId,
              sequenceNumber: seq,
              actionType: event.eventType,
              actionName: event.eventType,
              inputText: event.content ?? null,
              resultText: event.metadata ? JSON.stringify(event.metadata) : null,
              tenantId,
            },
          ],
        },
      );
    } catch (err) {
      console.error(`[session-store] Failed to record event seq=${seq} for ${sessionId}:`, err instanceof Error ? err.message : err);
    }
  }

  async saveMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
    try {
      await gqlQuery(
        `mutation SaveMessages($id: Uuid!, $update: UpdateAgentSessionsByIdUpdateColumnsInput!) {
          updateAgentSessionsById(keyId: $id, updateColumns: $update) { affectedRows }
        }`,
        {
          id: sessionId,
          update: { result: { set: JSON.stringify(messages) } },
        },
      );
    } catch (err) {
      console.error(`[session-store] Failed to save messages for ${sessionId}:`, err instanceof Error ? err.message : err);
    }
  }

  async updateStatus(sessionId: string, status: string): Promise<void> {
    await gqlQuery(
      `mutation UpdateStatus($id: Uuid!, $update: UpdateAgentSessionsByIdUpdateColumnsInput!) {
        updateAgentSessionsById(keyId: $id, updateColumns: $update) { affectedRows }
      }`,
      {
        id: sessionId,
        update: { status: { set: status } },
      },
    );
  }

  async updateMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    // Load current metadata, merge, and save
    const data = await gqlQuery<{
      agentSessionsById: { outputSummary: string | null } | null;
    }>(
      `query GetMeta($id: Uuid!) { agentSessionsById(id: $id) { outputSummary } }`,
      { id: sessionId },
    );
    const current = JSON.parse(data?.agentSessionsById?.outputSummary ?? "{}");
    const merged = { ...current, ...metadata };
    await gqlQuery(
      `mutation UpdateMeta($id: Uuid!, $update: UpdateAgentSessionsByIdUpdateColumnsInput!) {
        updateAgentSessionsById(keyId: $id, updateColumns: $update) { affectedRows }
      }`,
      {
        id: sessionId,
        update: { outputSummary: { set: JSON.stringify(merged) } },
      },
    );
  }

  async loadEvents(sessionId: string): Promise<Array<{
    id: string;
    sequence: number;
    eventType: string;
    content: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>> {
    const data = await gqlQuery<{
      agentActions: Array<{
        id: string;
        sequenceNumber: number | null;
        actionType: string;
        inputText: string | null;
        resultText: string | null;
        createdAt: string;
      }>;
    }>(
      `query GetEvents($sessionId: Uuid!) {
        agentActions(
          where: { sessionId: { _eq: $sessionId }, deletedAt: { _isNull: true } }
          orderBy: [{ sequenceNumber: Asc }]
        ) {
          id sequenceNumber actionType inputText resultText createdAt
        }
      }`,
      { sessionId },
    );
    return (data?.agentActions ?? []).map((a) => ({
      id: a.id,
      sequence: a.sequenceNumber ?? 0,
      eventType: a.actionType,
      content: a.inputText ?? null,
      metadata: JSON.parse(a.resultText ?? "{}"),
      createdAt: a.createdAt,
    }));
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  private cleanupMemory(): void {
    for (const [id] of this.agents) {
      if (this.agents.size > 100) {
        this.agents.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.agents.clear();
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
