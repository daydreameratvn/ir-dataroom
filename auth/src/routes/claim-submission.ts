import { Hono } from "hono";
import { requireAuth, getTenantId } from "../middleware.ts";
import {
  handleCreateSession,
  handleSendMessage,
  handleGetSession,
} from "../../../agents/claim-submission/handler.ts";
import { generateUploadUrls } from "../services/claim-upload-s3.ts";

const claimSubmission = new Hono();

claimSubmission.use("/claim-submission/*", requireAuth);

// ─── Create Session ──────────────────────────────────────────────────────────

claimSubmission.post("/claim-submission/sessions", async (c) => {
  try {
    const body = await c.req.json();
    const tenantId = getTenantId(c);
    const user = c.get("user");

    const { sessionId, response } = await handleCreateSession({
      documents: body.documents,
      documentAnalysis: body.documentAnalysis,
      allowedCertificateIds: body.allowedCertificateIds,
      tenantId,
      userId: user?.sub,
    });

    return response;
  } catch (err) {
    console.error("[claim-submission] Create session error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to create session" },
      500,
    );
  }
});

// ─── Send Message ────────────────────────────────────────────────────────────

claimSubmission.post("/claim-submission/sessions/:id/messages", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const body = await c.req.json();
    const tenantId = getTenantId(c);

    if (!body.text) {
      return c.json({ error: "text is required" }, 400);
    }

    const response = await handleSendMessage({
      sessionId,
      text: body.text,
      documents: body.documents,
      tenantId,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send message";
    if (message.includes("not found")) {
      return c.json({ error: message }, 404);
    }
    if (message.includes("is completed") || message.includes("is failed")) {
      return c.json({ error: message }, 409);
    }
    console.error("[claim-submission] Send message error:", err);
    return c.json({ error: message }, 500);
  }
});

// ─── Get Session ─────────────────────────────────────────────────────────────

claimSubmission.get("/claim-submission/sessions/:id", async (c) => {
  try {
    const sessionId = c.req.param("id");
    const result = await handleGetSession(sessionId);
    if (!result) {
      return c.json({ error: "Session not found" }, 404);
    }
    return c.json(result);
  } catch (err) {
    console.error("[claim-submission] Get session error:", err);
    return c.json(
      { error: err instanceof Error ? err.message : "Failed to get session" },
      500,
    );
  }
});

// ─── Upload Documents ────────────────────────────────────────────────────────

claimSubmission.post("/claim-submission/uploads", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return c.json({ error: "files array is required" }, 400);
    }

    const result = await generateUploadUrls(body.files);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate upload URLs";
    const status = message.includes("Unsupported") || message.includes("Maximum") ? 400 : 500;
    if (status === 500) console.error("[claim-submission] Upload error:", err);
    return c.json({ error: message }, status);
  }
});

export { claimSubmission };
