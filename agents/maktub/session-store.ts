import type { Agent, AgentMessage } from "@mariozechner/pi-agent-core";
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

// ─── SQL Helpers ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sqlUuid(value: string): string {
  if (!UUID_RE.test(value)) throw new Error(`Invalid UUID: ${value}`);
  return `'${value}'`;
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  // Use dollar-quoting to avoid escaping issues with JSON
  const json = JSON.stringify(value);
  return `$json$${json}$json$::jsonb`;
}

async function runSql(sql: string): Promise<string[][]> {
  const endpoint = process.env.APPLE_GRAPHQL_ENDPOINT || process.env.HASURA_GRAPHQL_ENDPOINT || "";
  const secret = process.env.APPLE_ADMIN_SECRET || process.env.HASURA_ADMIN_TOKEN || "";
  const baseUrl = endpoint.replace("/v1/graphql", "");

  const response = await fetch(`${baseUrl}/v2/query`, {
    method: "POST",
    headers: {
      "x-hasura-admin-secret": secret,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "run_sql",
      args: { source: "default", sql, cascade: false },
    }),
  });

  const result = await response.json();
  if (result.error) throw new Error(`run_sql error: ${result.error}`);
  return result.result ?? [];
}

// ─── Session Store ───────────────────────────────────────────────────────────

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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
    await runSql(`
      INSERT INTO agent_sessions (id, agent_type, status, context, metadata, tenant_id, created_by)
      VALUES (
        ${sqlUuid(id)},
        ${sqlText(params.agentType)},
        'active',
        ${sqlJson(params.context)},
        ${sqlJson(params.metadata ?? {})},
        ${sqlUuid(params.tenantId)},
        ${params.userId ? sqlUuid(params.userId) : "NULL"}
      )
    `);
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
    const rows = await runSql(`
      SELECT id, agent_type, status, messages, context, metadata, tenant_id, created_at, updated_at
      FROM agent_sessions
      WHERE id = ${sqlUuid(sessionId)} AND deleted_at IS NULL
      LIMIT 1
    `);
    // rows[0] is header, rows[1] is data
    if (rows.length < 2) return null;
    const [, , , , messages, context, metadata, tenantId, createdAt, updatedAt] = rows[1]!;
    return {
      id: rows[1]![0]!,
      agentType: rows[1]![1]!,
      status: rows[1]![2]!,
      messages: JSON.parse(messages ?? "[]"),
      context: JSON.parse(context ?? "{}"),
      metadata: JSON.parse(metadata ?? "{}"),
      tenantId: tenantId!,
      createdAt: createdAt!,
      updatedAt: updatedAt!,
    };
  }

  async recordEvent(sessionId: string, event: SessionEvent, tenantId: string): Promise<void> {
    const seq = this.nextSequence(sessionId);
    try {
      await runSql(`
        INSERT INTO agent_session_events (session_id, sequence, event_type, content, metadata, tenant_id)
        VALUES (
          ${sqlUuid(sessionId)},
          ${seq},
          ${sqlText(event.eventType)},
          ${event.content != null ? sqlText(event.content) : "NULL"},
          ${sqlJson(event.metadata ?? {})},
          ${sqlUuid(tenantId)}
        )
      `);
    } catch (err) {
      console.error(`[session-store] Failed to record event seq=${seq} for ${sessionId}:`, err instanceof Error ? err.message : err);
    }
  }

  async saveMessages(sessionId: string, messages: AgentMessage[]): Promise<void> {
    try {
      await runSql(`
        UPDATE agent_sessions
        SET messages = ${sqlJson(messages)}, updated_at = now()
        WHERE id = ${sqlUuid(sessionId)}
      `);
    } catch (err) {
      console.error(`[session-store] Failed to save messages for ${sessionId}:`, err instanceof Error ? err.message : err);
    }
  }

  async updateStatus(sessionId: string, status: string): Promise<void> {
    await runSql(`
      UPDATE agent_sessions
      SET status = ${sqlText(status)}, updated_at = now()
      WHERE id = ${sqlUuid(sessionId)}
    `);
  }

  async updateMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    await runSql(`
      UPDATE agent_sessions
      SET metadata = metadata || ${sqlJson(metadata)}, updated_at = now()
      WHERE id = ${sqlUuid(sessionId)}
    `);
  }

  async loadEvents(sessionId: string): Promise<Array<{
    id: string;
    sequence: number;
    eventType: string;
    content: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>> {
    const rows = await runSql(`
      SELECT id, sequence, event_type, content, metadata, created_at
      FROM agent_session_events
      WHERE session_id = ${sqlUuid(sessionId)} AND deleted_at IS NULL
      ORDER BY sequence ASC
    `);
    if (rows.length < 2) return [];
    // Skip header row
    return rows.slice(1).map((row) => ({
      id: row[0]!,
      sequence: parseInt(row[1]!, 10),
      eventType: row[2]!,
      content: row[3] ?? null,
      metadata: JSON.parse(row[4] ?? "{}"),
      createdAt: row[5]!,
    }));
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  private cleanupMemory(): void {
    const now = Date.now();
    for (const [id, entry] of this.agents) {
      // We don't store createdAt in memory, so use a simple age check
      // by seeing if the agent has any messages
      if (this.agents.size > 100) {
        // Only evict if we have too many sessions
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
