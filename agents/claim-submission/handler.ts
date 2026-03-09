import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";

import { createClaimSubmissionAgent, downloadDocumentImages } from "./agent.ts";
import { recordAgentEvents } from "./event-recorder.ts";
import { sessionStore } from "./session-store.ts";
import type { SessionContext } from "./session-store.ts";
import { createSSEResponse } from "../shared/sse-stream.ts";
import type { DocumentInfo } from "./tools/index.ts";

export type { DocumentInfo };
export { sessionStore };

// ─── Session-based handlers ──────────────────────────────────────────────────

/**
 * Create a new claim submission session.
 * Downloads document images (if no pre-analyzed text), creates the agent,
 * persists session to DB, and returns SSE stream for the first turn.
 */
export async function handleCreateSession(params: {
  documents?: DocumentInfo[];
  documentAnalysis?: string;
  allowedCertificateIds?: string[];
  tenantId: string;
  userId?: string;
}): Promise<{ sessionId: string; response: Response }> {
  const documents = params.documents ?? [];
  const pageCount = documents.length;
  const context: SessionContext = {
    documents,
    pageCount,
    allowedCertificateIds: params.allowedCertificateIds,
  };

  // Create session in DB
  const sessionId = await sessionStore.create({
    agentType: "claim-submission",
    context,
    tenantId: params.tenantId,
    userId: params.userId,
  });

  // Pre-download images for vision if no text analysis provided
  let imageBlocks: ImageContent[] | undefined;
  if (!params.documentAnalysis && documents.length > 0) {
    imageBlocks = await downloadDocumentImages(documents);
  }

  // Create agent
  const agent = await createClaimSubmissionAgent({
    documentAnalysis: params.documentAnalysis,
    documents,
    pageCount,
    allowedCertificateIds: params.allowedCertificateIds,
    imageBlocks,
  });

  // Store agent in memory and set up event recording
  sessionStore.setAgent(sessionId, agent, context, params.tenantId);
  recordAgentEvents(agent, sessionId, params.tenantId, sessionStore);

  // Record user message event
  await sessionStore.recordEvent(
    sessionId,
    {
      eventType: "user_message",
      content: params.documentAnalysis
        ? "[Document analysis text provided]"
        : `[${documents.length} document images provided]`,
      metadata: { documentCount: documents.length, hasAnalysis: !!params.documentAnalysis },
    },
    params.tenantId,
  );

  // Start the agent (fire-and-forget)
  agent
    .prompt("Analyze the provided medical documents and submit insurance claims for each identified claim group.")
    .catch(console.error);

  // Update status to waiting_for_user when agent finishes (it will ask for OTP)
  agent.subscribe((event: any) => {
    if (event.type === "agent_end") {
      sessionStore.updateStatus(sessionId, "waiting_for_user").catch(console.error);
    }
  });

  const response = createSSEResponse(agent);

  // Add session ID header
  const headers = new Headers(response.headers);
  headers.set("X-Session-Id", sessionId);

  return {
    sessionId,
    response: new Response(response.body, { headers, status: response.status }),
  };
}

/**
 * Send a message to an existing session.
 * Loads or reconstructs the agent, prompts it, and returns SSE stream.
 */
export async function handleSendMessage(params: {
  sessionId: string;
  text: string;
  documents?: DocumentInfo[];
  tenantId: string;
}): Promise<Response> {
  // Try to get agent from memory
  let entry = sessionStore.getAgent(params.sessionId);

  // If not in memory, reconstruct from DB
  if (!entry) {
    const session = await sessionStore.loadSession(params.sessionId);
    if (!session) throw new Error(`Session ${params.sessionId} not found`);
    if (session.status === "completed" || session.status === "failed") {
      throw new Error(`Session ${params.sessionId} is ${session.status}`);
    }

    // Reconstruct agent with persisted messages
    const agent = await createClaimSubmissionAgent({
      documents: session.context.documents,
      pageCount: session.context.pageCount,
      allowedCertificateIds: session.context.allowedCertificateIds,
      resumeMessages: session.messages,
    });

    sessionStore.setAgent(params.sessionId, agent, session.context, session.tenantId);
    recordAgentEvents(agent, params.sessionId, session.tenantId, sessionStore);
    entry = sessionStore.getAgent(params.sessionId)!;
  }

  // Record user message
  await sessionStore.recordEvent(
    params.sessionId,
    {
      eventType: "user_message",
      content: params.text,
      metadata: { documentCount: params.documents?.length ?? 0 },
    },
    params.tenantId,
  );
  await sessionStore.updateStatus(params.sessionId, "active");

  // Prompt the agent
  entry.agent.prompt(params.text).catch(console.error);

  // Update status when agent finishes
  entry.agent.subscribe((event: any) => {
    if (event.type === "agent_end") {
      sessionStore.updateStatus(params.sessionId, "waiting_for_user").catch(console.error);
    }
  });

  return createSSEResponse(entry.agent);
}

/**
 * Get session info and event history.
 */
export async function handleGetSession(sessionId: string): Promise<{
  session: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
} | null> {
  const session = await sessionStore.loadSession(sessionId);
  if (!session) return null;

  const events = await sessionStore.loadEvents(sessionId);
  return {
    session: {
      id: session.id,
      agentType: session.agentType,
      status: session.status,
      context: session.context,
      metadata: session.metadata,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    },
    events,
  };
}

// ─── Legacy direct handler (for Lambda / non-session use) ────────────────────

/**
 * Direct handler for the claim submission agent (non-session).
 * Kept for backward compatibility with direct invocations.
 */
export async function handleClaimSubmission(request: {
  allowedCertificateIds?: string[];
  documentAnalysis?: string;
  documents?: DocumentInfo[];
  pageCount?: number;
}) {
  const agent = await createClaimSubmissionAgent(request);

  agent.prompt(
    "Analyze the provided medical documents and submit insurance claims for each identified claim group.",
  ).catch(console.error);

  return createSSEResponse(agent);
}
