import { Hono } from "hono";
import { requireAuth, requireAdmin } from "../middleware.ts";
import { handleClaimAssessor } from "../../../agents/claim-assessor/handler.ts";
import { handleComplianceCheck } from "../../../agents/compliance/handler.ts";
import { handleScourge } from "../../../agents/scourge/handler.ts";
import { executeApprovedTool } from "../../../agents/shared/approval.ts";
import { createSSEResponse } from "../../../agents/shared/sse-stream.ts";
import type { Agent, AgentTool } from "@mariozechner/pi-agent-core";
import type { ScourgeJobResult, ProcessingStatus } from "../../../agents/scourge/pipeline.ts";

// ---------------------------------------------------------------------------
// In-Memory Stores
// ---------------------------------------------------------------------------

interface AgentSession {
  agent: Agent;
  tools: AgentTool[];
  claimCode: string;
  createdAt: number;
}

interface ScourgeJobEntry {
  id: string;
  claimCode: string;
  status: "processing" | "completed" | "failed";
  createdAt: number;
  result?: ScourgeJobResult;
}

/** Active agent sessions keyed by chatId (for approval workflow resume) */
const agentStore = new Map<string, AgentSession>();

/** Scourge job results keyed by jobId */
const scourgeStore = new Map<string, ScourgeJobEntry>();

// Cleanup stale sessions older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [key, session] of agentStore) {
    if (session.createdAt < cutoff) agentStore.delete(key);
  }
  for (const [key, job] of scourgeStore) {
    if (job.createdAt < cutoff) scourgeStore.delete(key);
  }
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const fwa = new Hono();

// All FWA routes require auth + admin
fwa.use("/fwa/*", requireAuth, requireAdmin);

// ── POST /fwa/assess — Start or continue assessment ──────────────────────

fwa.post("/fwa/assess", async (c) => {
  const body = await c.req.json<{
    claimCode: string;
    text?: string;
    chatId?: string;
  }>();

  if (!body.claimCode) {
    return c.json({ error: "claimCode is required" }, 400);
  }

  try {
    // If chatId exists, resume existing session
    if (body.chatId && body.text) {
      const session = agentStore.get(body.chatId);
      if (session) {
        session.agent.prompt(body.text).catch(console.error);
        return createSSEResponse(session.agent);
      }
    }

    // Start new assessment
    const response = await handleClaimAssessor({
      claimCode: body.claimCode,
      text: body.text,
    });

    // The response is an SSE Response from createSSEResponse
    return response;
  } catch (err) {
    console.error("[FWA API] Error in assess:", err);
    return c.json({ error: "Failed to start assessment" }, 500);
  }
});

// ── POST /fwa/assess/approve — Respond to approval request ───────────────

fwa.post("/fwa/assess/approve", async (c) => {
  const body = await c.req.json<{
    chatId: string;
    toolCallId: string;
    toolName: string;
    approved: boolean;
  }>();

  if (!body.chatId || !body.toolCallId || !body.toolName) {
    return c.json({ error: "chatId, toolCallId, and toolName are required" }, 400);
  }

  const session = agentStore.get(body.chatId);
  if (!session) {
    return c.json({ error: "Session not found or expired" }, 404);
  }

  try {
    if (body.approved) {
      // Find the tool and execute the real implementation
      const tool = session.tools.find((t) => t.name === body.toolName) as
        | (AgentTool & { _realExecute?: AgentTool["execute"] })
        | undefined;
      if (!tool) {
        return c.json({ error: `Tool ${body.toolName} not found` }, 404);
      }

      // Get the original params from the agent's message history
      const messages = session.agent.state.messages;
      let params: unknown = {};
      for (const msg of messages) {
        if ("role" in msg && msg.role === "assistant" && Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (
              (part as any).type === "toolCall" &&
              (part as any).id === body.toolCallId
            ) {
              params = (part as any).args;
            }
          }
        }
      }

      const result = await executeApprovedTool(tool, body.toolCallId, params);

      // Feed the result back to the agent to continue
      session.agent.prompt(
        `Tool ${body.toolName} was approved and executed. Result: ${JSON.stringify(result.content)}`,
      ).catch(console.error);

      return createSSEResponse(session.agent);
    } else {
      // Denied — tell the agent
      session.agent.prompt(
        `Tool ${body.toolName} (${body.toolCallId}) was DENIED by the user. Adjust your approach accordingly.`,
      ).catch(console.error);

      return createSSEResponse(session.agent);
    }
  } catch (err) {
    console.error("[FWA API] Error in approve:", err);
    return c.json({ error: "Failed to process approval" }, 500);
  }
});

// ── GET /fwa/pending — List pending approval assessments ─────────────────

fwa.get("/fwa/pending", async (c) => {
  const pending: Array<{
    chatId: string;
    claimCode: string;
    createdAt: number;
  }> = [];

  for (const [chatId, session] of agentStore) {
    pending.push({
      chatId,
      claimCode: session.claimCode,
      createdAt: session.createdAt,
    });
  }

  // Sort newest first
  pending.sort((a, b) => b.createdAt - a.createdAt);

  return c.json({ data: pending });
});

// ── POST /fwa/compliance — Start compliance check (SSE stream) ───────────

fwa.post("/fwa/compliance", async (c) => {
  const body = await c.req.json<{ claimCode: string }>();

  if (!body.claimCode) {
    return c.json({ error: "claimCode is required" }, 400);
  }

  try {
    const response = await handleComplianceCheck({ claimCode: body.claimCode });
    return response;
  } catch (err) {
    console.error("[FWA API] Error in compliance check:", err);
    return c.json({ error: "Failed to start compliance check" }, 500);
  }
});

// ── GET /fwa/compliance — Quick non-streaming compliance check ───────────

fwa.get("/fwa/compliance", async (c) => {
  const claimCode = c.req.query("claimCode");

  if (!claimCode) {
    return c.json({ error: "claimCode query parameter is required" }, 400);
  }

  try {
    // Start compliance check and collect the full result
    const response = await handleComplianceCheck({ claimCode });

    // Read the SSE stream and extract the final text
    const reader = response.body?.getReader();
    if (!reader) {
      return c.json({ error: "No response body" }, 500);
    }

    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text_delta") {
              fullText += event.delta;
            } else if (event.type === "message_end") {
              fullText = event.text;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    }

    return c.json({ claimCode, result: fullText });
  } catch (err) {
    console.error("[FWA API] Error in quick compliance check:", err);
    return c.json({ error: "Failed to run compliance check" }, 500);
  }
});

// ── POST /fwa/scourge — Start scourge job (SSE stream of progress) ───────

fwa.post("/fwa/scourge", async (c) => {
  const body = await c.req.json<{ claimCode: string }>();

  if (!body.claimCode) {
    return c.json({ error: "claimCode is required" }, 400);
  }

  const jobId = crypto.randomUUID();
  const encoder = new TextEncoder();

  scourgeStore.set(jobId, {
    id: jobId,
    claimCode: body.claimCode,
    status: "processing",
    createdAt: Date.now(),
  });

  const stream = new ReadableStream({
    start(controller) {
      function send(event: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream may be closed
        }
      }

      // Send the job ID immediately
      send({ type: "job_started", jobId });

      const onProgress = (status: ProcessingStatus) => {
        send({ type: "progress", ...status });
      };

      // Placeholder extractPII and editDocumentImage — these need real LLM implementations
      // For now, they return empty results so the pipeline completes without crashing
      const extractPII = async (_imageUrl: string) => ({});
      const editDocumentImage = async (
        _imageSource: string,
        _originalValue: string,
        _newValue: string,
        _fieldName: string,
      ) => null;

      handleScourge({
        claimCode: body.claimCode,
        extractPII,
        editDocumentImage,
        onProgress,
      })
        .then((result) => {
          const entry = scourgeStore.get(jobId);
          if (entry) {
            entry.status = result.status === "completed" ? "completed" : "failed";
            entry.result = result;
          }
          send({ type: "job_completed", jobId, status: result.status });
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // Already closed
          }
        })
        .catch((err) => {
          const entry = scourgeStore.get(jobId);
          if (entry) {
            entry.status = "failed";
          }
          send({
            type: "job_failed",
            jobId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // Already closed
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
});

// ── GET /fwa/scourge — List scourge jobs ─────────────────────────────────

fwa.get("/fwa/scourge", async (c) => {
  const jobs = Array.from(scourgeStore.values()).map((job) => ({
    id: job.id,
    claimCode: job.claimCode,
    status: job.status,
    createdAt: job.createdAt,
    documentCount: job.result?.documents.length ?? 0,
  }));

  // Sort newest first
  jobs.sort((a, b) => b.createdAt - a.createdAt);

  return c.json({ data: jobs });
});

// ── GET /fwa/scourge/:id — Get scourge job detail ────────────────────────

fwa.get("/fwa/scourge/:id", async (c) => {
  const id = c.req.param("id");
  const job = scourgeStore.get(id);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    id: job.id,
    claimCode: job.claimCode,
    status: job.status,
    createdAt: job.createdAt,
    documentCount: job.result?.documents.length ?? 0,
    result: job.result ?? null,
  });
});

export default fwa;
