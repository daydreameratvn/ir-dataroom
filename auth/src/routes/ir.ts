import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { requireAuth, requireAdmin, getEffectiveTenantId, getClientInfo, getTenantId } from "../middleware.ts";
import { getJwtKey } from "../config.ts";
import { createOtpRequest, verifyOtp, sendEmailOtp } from "../services/otp.ts";
import {
  listRounds,
  getRoundById,
  getRoundBySlug,
  createRound,
  updateRound,
  softDeleteRound,
} from "../services/ir-round.ts";
import {
  listInvestors,
  getInvestorById,
  getInvestorByEmail,
  createInvestor,
  updateInvestor,
  addInvestorToRound,
  updateInvestorRoundStatus,
  removeInvestorFromRound,
  listInvestorRounds,
  listRoundsForInvestor,
  getInvestorRound,
  recordInvestorAccess,
  promoteToViewingIfNeeded,
} from "../services/ir-investor.ts";
import { query } from "../db/pool.ts";
import {
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  softDeleteDocument,
} from "../services/ir-document.ts";
import {
  getActiveNda,
  createNdaTemplate,
  acceptNda,
  getSignedNdaTemplate,
} from "../services/ir-nda.ts";
import {
  logAccess,
  listAccessLogs,
  getRoundAnalytics,
  getOverallStats,
  updateAccessLogDuration,
  exportAccessLogsCSV,
  getInvestorEngagement,
  getRecentActivity,
  getRoundDashboardStats,
} from "../services/ir-access-log.ts";
import {
  generateUploadUrl,
  generateViewUrl,
  downloadFileBuffer,
  uploadToS3,
} from "../services/ir-s3.ts";
// TODO: pdf-lib crashes on Bun 1.3.10 — use lazy imports until fixed
// import { watermarkFile } from "../services/ir-watermark.ts";
// import { generateSignedNdaPdf } from "../services/ir-nda-pdf.ts";

// ---------------------------------------------------------------------------
// Investor JWT helpers (separate from platform JWTs)
// ---------------------------------------------------------------------------

interface InvestorTokenPayload {
  sub: string;
  email: string;
  name: string;
  tenantId: string;
  userType: "investor";
  role: "investor";
}

let cachedSecret: Uint8Array | null = null;

async function getSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  const key = await getJwtKey();
  cachedSecret = new TextEncoder().encode(key);
  return cachedSecret;
}

async function signInvestorToken(payload: InvestorTokenPayload): Promise<string> {
  const secret = await getSecret();
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    tenantId: payload.tenantId,
    userType: payload.userType,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("4h")
    .sign(secret);
}

async function verifyInvestorToken(token: string): Promise<InvestorTokenPayload | null> {
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret);
    const p = payload as Record<string, unknown>;
    if (p.userType !== "investor") return null;
    return {
      sub: payload.sub!,
      email: p.email as string,
      name: p.name as string,
      tenantId: p.tenantId as string,
      userType: "investor",
      role: "investor",
    };
  } catch {
    return null;
  }
}

/** Middleware to require investor JWT authentication */
async function requireInvestor(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyInvestorToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired investor token" }, 401);
  }

  c.set("investor", payload);
  return next();
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const ir = new Hono<{
  Variables: {
    investor: InvestorTokenPayload;
  };
}>();

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES — catch-all: every /ir/* route requires auth + admin,
// EXCEPT /ir/portal/* which uses investor auth (declared further below).
// This ensures any new admin endpoint is automatically protected.
// ═══════════════════════════════════════════════════════════════════════════

ir.use("/ir/*", async (c, next) => {
  if (c.req.path.startsWith("/auth/ir/portal/")) return next();
  await requireAuth(c, async () => { await requireAdmin(c, next); });
});

// ── Rounds ───────────────────────────────────────────────────────────────

ir.get("/ir/rounds", async (c) => {
  const tenantId = getEffectiveTenantId(c);
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "20", 10);
  const status = c.req.query("status");

  try {
    const result = await listRounds(tenantId, { status, page, pageSize });
    return c.json(result);
  } catch (err) {
    console.error("[IR API] Error listing rounds:", err);
    return c.json({ error: "Failed to list rounds" }, 500);
  }
});

ir.post("/ir/rounds", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const body = await c.req.json();

  if (!body.name || !body.slug) {
    return c.json({ error: "name and slug are required" }, 400);
  }

  try {
    const result = await createRound(tenantId, body, user.sub);
    return c.json(result, 201);
  } catch (err) {
    console.error("[IR API] Error creating round:", err);
    return c.json({ error: "Failed to create round" }, 500);
  }
});

ir.get("/ir/rounds/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const round = await getRoundById(id);
    if (!round) return c.json({ error: "Round not found" }, 404);
    return c.json(round);
  } catch (err) {
    console.error("[IR API] Error fetching round:", err);
    return c.json({ error: "Failed to fetch round" }, 500);
  }
});

ir.put("/ir/rounds/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    await updateRound(id, body, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error updating round:", err);
    return c.json({ error: "Failed to update round" }, 500);
  }
});

// Request OTP before deleting a round
ir.post("/ir/rounds/:id/delete-otp", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);

  try {
    const { code } = await createOtpRequest({
      tenantId,
      provider: "email_otp",
      destination: user.email,
    });
    await sendEmailOtp(user.email, code);
    return c.json({ success: true, message: "Verification code sent" });
  } catch (err) {
    console.error("[IR API] Error sending delete-round OTP:", err);
    return c.json({ error: "Failed to send verification code" }, 500);
  }
});

ir.delete("/ir/rounds/:id", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");

  // Require OTP verification
  const body = await c.req.json<{ code?: string }>().catch(() => ({}) as { code?: string });
  if (!body.code) {
    return c.json({ error: "Verification code is required" }, 400);
  }

  try {
    const result = await verifyOtp({
      tenantId,
      destination: user.email,
      code: body.code,
    });

    if (!result.valid) {
      return c.json({ error: "Invalid or expired verification code" }, 400);
    }

    await softDeleteRound(id, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error deleting round:", err);
    return c.json({ error: "Failed to delete round" }, 500);
  }
});

// ── Round Investors ──────────────────────────────────────────────────────

ir.get("/ir/rounds/:id/investors", async (c) => {
  const roundId = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "20", 10);
  const status = c.req.query("status");

  try {
    const result = await listInvestorRounds(roundId, { status, page, pageSize });
    return c.json(result);
  } catch (err) {
    console.error("[IR API] Error listing round investors:", err);
    return c.json({ error: "Failed to list round investors" }, 500);
  }
});

ir.post("/ir/rounds/:id/investors", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const roundId = c.req.param("id");
  const body = await c.req.json<{
    email: string;
    name: string;
    firm?: string;
    title?: string;
    phone?: string;
    notes?: string;
    ndaMode?: "digital" | "offline";
  }>();

  if (!body.email || !body.name) {
    return c.json({ error: "email and name are required" }, 400);
  }

  try {
    // Find or create investor
    let investor = await getInvestorByEmail(tenantId, body.email);
    if (!investor) {
      const result = await createInvestor(tenantId, body, user.sub);
      investor = await getInvestorById(result.id);
    }

    if (!investor) {
      return c.json({ error: "Failed to create investor" }, 500);
    }

    // Add to round with NDA mode (digital = NDA popup, offline = skip NDA)
    const irResult = await addInvestorToRound(tenantId, investor.id, roundId, user.sub, {
      ndaMode: body.ndaMode,
    });

    // Fire welcome email (best-effort, non-blocking)
    sendWelcomeEmail(investor).catch((err) => {
      console.error("[IR API] Failed to send welcome email:", err);
    });

    return c.json({ id: irResult.id, investorId: investor.id }, 201);
  } catch (err) {
    console.error("[IR API] Error adding investor to round:", err);
    return c.json({ error: "Failed to add investor to round" }, 500);
  }
});

const VALID_STATUSES = [
  "invited", "nda_signed", "viewing",
  "termsheet_sent", "termsheet_signed",
  "docs_out", "docs_signed", "dropped",
] as const;

ir.put("/ir/rounds/:rid/investors/:iid", async (c) => {
  const user = c.get("user");
  const investorRoundId = c.req.param("iid");
  const body = await c.req.json<{ status: string }>();

  if (!body.status) {
    return c.json({ error: "status is required" }, 400);
  }

  if (!VALID_STATUSES.includes(body.status as any)) {
    return c.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, 400);
  }

  try {
    await updateInvestorRoundStatus(investorRoundId, body.status, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error updating investor status:", err);
    return c.json({ error: "Failed to update investor status" }, 500);
  }
});

ir.delete("/ir/rounds/:rid/investors/:iid", async (c) => {
  const user = c.get("user");
  const investorRoundId = c.req.param("iid");

  try {
    await removeInvestorFromRound(investorRoundId, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error removing investor:", err);
    return c.json({ error: "Failed to remove investor" }, 500);
  }
});

// ── Update NDA mode (digital ↔ offline) ──

ir.put("/ir/rounds/:rid/investors/:iid/nda-mode", async (c) => {
  const user = c.get("user");
  const investorRoundId = c.req.param("iid");
  const body = await c.req.json<{ ndaMode: "digital" | "offline" }>();

  if (!body.ndaMode || !["digital", "offline"].includes(body.ndaMode)) {
    return c.json({ error: "ndaMode must be 'digital' or 'offline'" }, 400);
  }

  try {
    await query(
      `UPDATE ir_investor_rounds
       SET nda_mode = $1, nda_required = $2, updated_by = $3, updated_at = now()
       WHERE id = $4 AND deleted_at IS NULL`,
      [body.ndaMode, body.ndaMode === "digital", user.sub, investorRoundId]
    );
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error updating NDA mode:", err);
    return c.json({ error: "Failed to update NDA mode" }, 500);
  }
});

// ── Update investor profile (name, firm, title, etc.) ──

ir.put("/ir/investors/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; firm?: string; title?: string }>();

  if (!body.name && !body.firm && !body.title) {
    return c.json({ error: "At least one field is required" }, 400);
  }

  try {
    const updated = await updateInvestor(id, body, user.sub);
    if (!updated) {
      return c.json({ error: "Investor not found" }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err) {
    console.error("[IR API] Error updating investor:", err);
    return c.json({ error: "Failed to update investor" }, 500);
  }
});

// ── Round Documents ──────────────────────────────────────────────────────

ir.get("/ir/rounds/:id/documents", async (c) => {
  const roundId = c.req.param("id");
  const category = c.req.query("category");

  try {
    const result = await listDocuments(roundId, { category });
    return c.json(result);
  } catch (err) {
    console.error("[IR API] Error listing documents:", err);
    return c.json({ error: "Failed to list documents" }, 500);
  }
});

ir.post("/ir/rounds/:id/documents", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const roundId = c.req.param("id");
  const body = await c.req.json();

  if (!body.name) {
    return c.json({ error: "name is required" }, 400);
  }

  try {
    const result = await createDocument(tenantId, roundId, body, user.sub);

    // If mimeType is provided, generate a presigned upload URL
    let uploadUrl: string | null = null;
    if (body.mimeType && body.name) {
      const s3Result = await generateUploadUrl({
        tenantId,
        roundId,
        docId: result.id,
        fileName: body.name,
        mimeType: body.mimeType,
      });
      uploadUrl = s3Result.uploadUrl;

      // Update the document with S3 metadata
      await updateDocument(
        result.id,
        { s3Key: s3Result.s3Key, s3Bucket: s3Result.s3Bucket },
        user.sub
      );
    }

    return c.json({ ...result, uploadUrl }, 201);
  } catch (err) {
    console.error("[IR API] Error creating document:", err);
    return c.json({ error: "Failed to create document" }, 500);
  }
});

// ── Document File Upload (proxy through server to avoid S3 CORS) ─────────

ir.post("/ir/documents/:id/upload", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");

  try {
    const doc = await getDocumentById(id);
    if (!doc) return c.json({ error: "Document not found" }, 404);

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }

    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const s3Result = await uploadToS3({
      tenantId,
      roundId: doc.roundId,
      docId: id,
      fileName: file.name || doc.name,
      mimeType,
      body: buffer,
    });

    // Update document with S3 metadata
    await updateDocument(
      id,
      {
        s3Key: s3Result.s3Key,
        s3Bucket: s3Result.s3Bucket,
        mimeType,
        fileSizeBytes: buffer.length,
      },
      user.sub
    );

    return c.json({ success: true, s3Key: s3Result.s3Key });
  } catch (err) {
    console.error("[IR API] Error uploading file:", err);
    return c.json({ error: "Failed to upload file" }, 500);
  }
});

// ── Document Upload URL (for re-upload / replace) ────────────────────────

ir.post("/ir/documents/:id/upload-url", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{ fileName: string; mimeType: string }>();

  if (!body.fileName || !body.mimeType) {
    return c.json({ error: "fileName and mimeType are required" }, 400);
  }

  try {
    const doc = await getDocumentById(id);
    if (!doc) return c.json({ error: "Document not found" }, 404);

    const s3Result = await generateUploadUrl({
      tenantId,
      roundId: doc.roundId,
      docId: id,
      fileName: body.fileName,
      mimeType: body.mimeType,
    });

    // Update the document with new S3 key/bucket + file metadata
    await updateDocument(
      id,
      {
        s3Key: s3Result.s3Key,
        s3Bucket: s3Result.s3Bucket,
        mimeType: body.mimeType,
        name: body.fileName,
      },
      user.sub
    );

    return c.json({ uploadUrl: s3Result.uploadUrl, s3Key: s3Result.s3Key });
  } catch (err) {
    console.error("[IR API] Error generating upload URL:", err);
    return c.json({ error: "Failed to generate upload URL" }, 500);
  }
});

// ── Documents (by ID) ────────────────────────────────────────────────────

ir.put("/ir/documents/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json();

  try {
    await updateDocument(id, body, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error updating document:", err);
    return c.json({ error: "Failed to update document" }, 500);
  }
});

ir.delete("/ir/documents/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  try {
    await softDeleteDocument(id, user.sub);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR API] Error deleting document:", err);
    return c.json({ error: "Failed to delete document" }, 500);
  }
});

// ── NDA ──────────────────────────────────────────────────────────────────

ir.get("/ir/rounds/:id/nda", async (c) => {
  const roundId = c.req.param("id");

  try {
    const nda = await getActiveNda(roundId);
    return c.json(nda ?? null);
  } catch (err) {
    console.error("[IR API] Error fetching NDA:", err);
    return c.json({ error: "Failed to fetch NDA" }, 500);
  }
});

ir.post("/ir/rounds/:id/nda", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const roundId = c.req.param("id");
  const body = await c.req.json<{ content: string }>();

  if (!body.content) {
    return c.json({ error: "content is required" }, 400);
  }

  try {
    const nda = await createNdaTemplate(tenantId, roundId, body.content, user.sub);
    return c.json(nda, 201);
  } catch (err) {
    console.error("[IR API] Error creating NDA:", err);
    return c.json({ error: "Failed to create NDA template" }, 500);
  }
});

// ── Analytics ────────────────────────────────────────────────────────────

ir.get("/ir/rounds/:id/analytics", async (c) => {
  const roundId = c.req.param("id");

  try {
    const analytics = await getRoundAnalytics(roundId);
    return c.json(analytics);
  } catch (err) {
    console.error("[IR API] Error fetching analytics:", err);
    return c.json({ error: "Failed to fetch analytics" }, 500);
  }
});

ir.get("/ir/rounds/:id/dashboard-stats", async (c) => {
  const roundId = c.req.param("id");

  try {
    const stats = await getRoundDashboardStats(roundId);
    return c.json(stats);
  } catch (err) {
    console.error("[IR API] Error fetching dashboard stats:", err);
    return c.json({ error: "Failed to fetch dashboard stats" }, 500);
  }
});

ir.get("/ir/rounds/:id/engagement", async (c) => {
  const roundId = c.req.param("id");

  try {
    const engagement = await getInvestorEngagement(roundId);
    return c.json({ data: engagement });
  } catch (err) {
    console.error("[IR API] Error fetching engagement:", err);
    return c.json({ error: "Failed to fetch engagement signals" }, 500);
  }
});

ir.get("/ir/rounds/:id/access-logs", async (c) => {
  const roundId = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "50", 10);
  const investorId = c.req.query("investorId");
  const action = c.req.query("action");

  try {
    const result = await listAccessLogs(roundId, { page, pageSize, investorId, action });
    return c.json(result);
  } catch (err) {
    console.error("[IR API] Error fetching access logs:", err);
    return c.json({ error: "Failed to fetch access logs" }, 500);
  }
});

ir.get("/ir/rounds/:id/access-logs/export", async (c) => {
  const roundId = c.req.param("id");

  try {
    const csv = await exportAccessLogsCSV(roundId);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="access-logs-${roundId}.csv"`,
      },
    });
  } catch (err) {
    console.error("[IR API] Error exporting access logs:", err);
    return c.json({ error: "Failed to export access logs" }, 500);
  }
});

// ── Overall Stats ────────────────────────────────────────────────────────

ir.get("/ir/stats", async (c) => {
  const tenantId = getEffectiveTenantId(c);

  try {
    const stats = await getOverallStats(tenantId);
    return c.json(stats);
  } catch (err) {
    console.error("[IR API] Error fetching IR stats:", err);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

// ── Recent Activity (global) ─────────────────────────────────────────────

ir.get("/ir/recent-activity", async (c) => {
  const tenantId = getEffectiveTenantId(c);
  const limit = parseInt(c.req.query("limit") || "20", 10);

  try {
    const activity = await getRecentActivity(tenantId, Math.min(limit, 50));
    return c.json({ data: activity });
  } catch (err) {
    console.error("[IR API] Error fetching recent activity:", err);
    return c.json({ error: "Failed to fetch recent activity" }, 500);
  }
});

// ── Investor management ──────────────────────────────────────────────────

ir.get("/ir/investors", async (c) => {
  const tenantId = getEffectiveTenantId(c);
  const page = parseInt(c.req.query("page") || "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") || "20", 10);
  const search = c.req.query("search");

  try {
    const result = await listInvestors(tenantId, { page, pageSize, search });
    return c.json(result);
  } catch (err) {
    console.error("[IR API] Error listing investors:", err);
    return c.json({ error: "Failed to list investors" }, 500);
  }
});

// ── Shared helper: send welcome / invite email ──────────────────────────
async function sendWelcomeEmail(investor: { email: string; name?: string | null }) {
  const firstName = investor.name?.split(" ")[0] || "there";
  const portalUrl = process.env.IR_PORTAL_URL || "https://investors.papaya.asia";
  const fromEmail = process.env.OTP_FROM_EMAIL || "noreply@papaya.asia";
  const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
  const ses = new SESClient({ region: process.env.AWS_REGION || "ap-southeast-1" });

  await ses.send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [investor.email] },
      Message: {
        Subject: { Data: "Welcome aboard! Your Papaya dataroom is ready \ud83c\udf89" },
        Body: {
          Html: {
            Data: `
              <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 48px 24px; color: #333;">
                <div style="text-align: center; margin-bottom: 32px;">
                  <img src="https://investors.papaya.asia/papaya-logo.png" alt="Papaya" height="40" style="height: 40px;" />
                </div>
                <h2 style="color: #1a1a1a; font-size: 24px; font-weight: 700; margin-bottom: 20px;">We're thrilled to have you! \ud83d\ude80</h2>
                <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Hi ${firstName},</p>
                <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
                  Thank you for your interest in Papaya \u2014 we're genuinely excited to share our story with you!
                </p>
                <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
                  We've prepared a dedicated dataroom where you can explore our pitch deck,
                  financials, product roadmap, and other key materials \u2014 all in one place,
                  at your own pace.
                </p>
                <p style="text-align: center; margin: 36px 0;">
                  <a href="${portalUrl}" style="display: inline-block; background-color: #ED1B55; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 16px; letter-spacing: 0.3px;">
                    Enter Dataroom \u2192
                  </a>
                </p>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
                  <p style="font-size: 13px; line-height: 1.6; color: #555; margin: 0;">
                    <strong>How to sign in:</strong> Click the button above, enter your email
                    (<span style="color: #ED1B55;">${investor.email}</span>), and we\u2019ll send you a one-time code.
                    No password needed \u2014 it\u2019s that easy!
                  </p>
                </div>
                <p style="font-size: 15px; line-height: 1.7; margin: 24px 0 0;">
                  We can\u2019t wait to show you what we\u2019re building. If you have any questions
                  or would like to schedule a conversation, don\u2019t hesitate to reach out \u2014
                  we\u2019d love to hear from you.
                </p>
                <p style="font-size: 15px; line-height: 1.7; margin: 24px 0 0;">
                  With excitement,<br />
                  <strong>The Papaya Team</strong>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 36px 0 16px;" />
                <p style="color: #aaa; font-size: 11px; text-align: center; line-height: 1.5;">
                  You\u2019re receiving this because your email was added to the Papaya investor dataroom.<br />
                  If this wasn\u2019t intended for you, you can safely ignore this message.
                </p>
              </div>
            `,
          },
          Text: {
            Data: `Hi ${firstName},\n\nThank you for your interest in Papaya \u2014 we're genuinely excited to share our story with you!\n\nWe've prepared a dedicated dataroom where you can explore our pitch deck, financials, product roadmap, and other key materials \u2014 all in one place, at your own pace.\n\nVisit ${portalUrl} and sign in with your email (${investor.email}). We'll send you a one-time code \u2014 no password needed!\n\nWe can't wait to show you what we're building. If you have any questions or would like to chat, don't hesitate to reach out.\n\nWith excitement,\nThe Papaya Team`,
          },
        },
      },
    })
  );
}

ir.post("/ir/investors/:id/invite", async (c) => {
  const id = c.req.param("id");

  try {
    const investor = await getInvestorById(id);
    if (!investor) return c.json({ error: "Investor not found" }, 404);

    await sendWelcomeEmail(investor);

    return c.json({ success: true, message: "Invitation sent" });
  } catch (err) {
    console.error("[IR API] Error sending invitation:", err);
    return c.json({ error: "Failed to send invitation" }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVESTOR PORTAL ROUTES — investor JWT auth
// ═══════════════════════════════════════════════════════════════════════════

// ── OTP Auth (public) ────────────────────────────────────────────────────

ir.post("/ir/portal/otp/request", async (c) => {
  const body = await c.req.json<{ email: string }>();

  if (!body.email) {
    return c.json({ error: "email is required" }, 400);
  }

  const tenantId = getTenantId(c);

  try {
    // Verify investor exists — closed portal, no need to hide existence
    const investor = await getInvestorByEmail(tenantId, body.email);
    if (!investor) {
      return c.json({ error: "Looks like you don't have access yet — reach out to khanh@papaya.asia and we'll get you set up 🙌" }, 400);
    }

    // Check active rounds before sending OTP (avoid sending useless emails)
    const investorRounds = await listRoundsForInvestor(investor.id);
    const hasActiveRound = investorRounds.some((ir) => ir.status !== "dropped");
    if (!hasActiveRound) {
      return c.json({ error: "Looks like you don't have access yet — reach out to khanh@papaya.asia and we'll get you set up 🙌" }, 422);
    }

    // Create and send OTP
    const { code } = await createOtpRequest({
      tenantId,
      provider: "email_otp",
      destination: body.email,
    });

    await sendEmailOtp(body.email, code);

    return c.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    console.error("[IR Portal] Error requesting OTP:", err);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

ir.post("/ir/portal/otp/verify", async (c) => {
  const body = await c.req.json<{ email: string; code: string }>();

  if (!body.email || !body.code) {
    return c.json({ error: "email and code are required" }, 400);
  }

  const tenantId = getTenantId(c);

  try {
    const result = await verifyOtp({
      tenantId,
      destination: body.email,
      code: body.code,
    });

    if (!result.valid) {
      return c.json({ error: "Invalid or expired OTP" }, 401);
    }

    // Look up investor
    const investor = await getInvestorByEmail(tenantId, body.email);
    if (!investor) {
      // Use 400 instead of 404 — CloudFront converts 404 to 200+HTML
      return c.json({ error: "Looks like you don't have access yet — reach out to khanh@papaya.asia and we'll get you set up 🙌" }, 400);
    }

    // Check that investor has at least one non-dropped round
    const investorRounds = await listRoundsForInvestor(investor.id);
    const hasActiveRound = investorRounds.some((ir) => ir.status !== "dropped");
    if (!hasActiveRound) {
      // Use 422 instead of 403 — CloudFront converts 403 to 200+HTML
      return c.json({ error: "Looks like you don't have access yet — reach out to khanh@papaya.asia and we'll get you set up 🙌" }, 422);
    }

    // Sign investor JWT
    const token = await signInvestorToken({
      sub: investor.id,
      email: investor.email,
      name: investor.name,
      tenantId,
      userType: "investor",
      role: "investor",
    });

    // Log access
    const { ipAddress, userAgent } = getClientInfo(c);
    await logAccess(tenantId, {
      investorId: investor.id,
      roundId: "00000000-0000-0000-0000-000000000000", // placeholder for login events
      action: "login",
      ipAddress,
      userAgent,
    }).catch(() => {/* non-critical */});

    return c.json({
      token,
      investor: {
        id: investor.id,
        email: investor.email,
        name: investor.name,
        firm: investor.firm,
      },
    });
  } catch (err) {
    console.error("[IR Portal] Error verifying OTP:", err);
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
});

ir.post("/ir/portal/token/refresh", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization header" }, 401);
  }

  const oldToken = authHeader.slice(7);
  const payload = await verifyInvestorToken(oldToken);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  try {
    const newToken = await signInvestorToken(payload);
    return c.json({ token: newToken });
  } catch (err) {
    console.error("[IR Portal] Error refreshing token:", err);
    return c.json({ error: "Failed to refresh token" }, 500);
  }
});

// ── Portal Protected Routes ──────────────────────────────────────────────

ir.use("/ir/portal/rounds", requireInvestor);
ir.use("/ir/portal/rounds/*", requireInvestor);

ir.get("/ir/portal/rounds", async (c) => {
  const investor = c.get("investor");

  try {
    const investorRounds = await listRoundsForInvestor(investor.sub);
    // Map to the Round shape the frontend expects
    const rounds = investorRounds.map((ir) => ({
      id: ir.roundId,
      slug: ir.roundSlug,
      name: ir.roundName,
      description: null,
      status: ir.roundStatus,
      targetRaise: null,
      currency: null,
      startedAt: null,
      closedAt: null,
    }));
    return c.json({ data: rounds });
  } catch (err) {
    console.error("[IR Portal] Error listing investor rounds:", err);
    return c.json({ error: "Failed to list rounds" }, 500);
  }
});

ir.get("/ir/portal/rounds/:slug", async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 400);

    // Verify investor has access
    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 422);

    // Record access
    await recordInvestorAccess(investorRound.id).catch(() => {});

    // Get NDA status — use per-investor ndaRequired flag (not round-level config)
    const nda = await getActiveNda(round.id);
    const ndaRequired = investorRound.ndaRequired;

    return c.json({
      round,
      investorRound,
      ndaRequired,
      ndaAccepted: !!investorRound.ndaAcceptedAt,
      ndaTemplate: ndaRequired && !investorRound.ndaAcceptedAt ? nda : null,
    });
  } catch (err) {
    console.error("[IR Portal] Error fetching round:", err);
    return c.json({ error: "Failed to fetch round" }, 500);
  }
});

ir.post("/ir/portal/rounds/:slug/nda/accept", async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");
  const { ipAddress, userAgent } = getClientInfo(c);

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 400);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 422);

    if (investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA already accepted" }, 400);
    }

    await acceptNda(investorRound.id, round.id, ipAddress, userAgent);

    // Log NDA acceptance
    await logAccess(investor.tenantId, {
      investorId: investor.sub,
      roundId: round.id,
      action: "nda_accept",
      ipAddress,
      userAgent,
    }).catch(() => {});

    return c.json({ success: true });
  } catch (err) {
    console.error("[IR Portal] Error accepting NDA:", err);
    return c.json({ error: "Failed to accept NDA" }, 500);
  }
});

ir.get("/ir/portal/rounds/:slug/documents", async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");
  const category = c.req.query("category");

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 400);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 422);

    // Check NDA requirement (per-investor flag)
    if (investorRound.ndaRequired && !investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA must be accepted first" }, 422);
    }

    const result = await listDocuments(round.id, { category });

    // Log document list view
    const { ipAddress, userAgent } = getClientInfo(c);
    await logAccess(investor.tenantId, {
      investorId: investor.sub,
      roundId: round.id,
      action: "view",
      ipAddress,
      userAgent,
    }).catch(() => {});

    return c.json(result);
  } catch (err) {
    console.error("[IR Portal] Error listing documents:", err);
    return c.json({ error: "Failed to list documents" }, 500);
  }
});

ir.get("/ir/portal/rounds/:slug/documents/:docId/view", async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");
  const docId = c.req.param("docId");

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 400);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 422);

    // Check NDA requirement
    if (investorRound.ndaRequired && !investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA must be accepted first" }, 422);
    }

    const doc = await getDocumentById(docId);
    if (!doc || doc.roundId !== round.id) return c.json({ error: "Document not found" }, 400);

    // Auto-promote investor to 'active' on first file access
    await promoteToViewingIfNeeded(investorRound.id).catch(() => {});

    // For preview: always return a presigned URL for instant loading.
    // The frontend CSS overlay provides the visual watermark during viewing.
    // Server-side watermarking is only applied on download (where files are saved).
    let presignedUrl: string | null = null;
    if (doc.s3Key) {
      presignedUrl = await generateViewUrl({
        s3Key: doc.s3Key,
        s3Bucket: doc.s3Bucket ?? undefined,
        contentType: doc.mimeType ?? undefined,
      });
    }

    // Log view and return access log ID for duration tracking
    const { ipAddress, userAgent } = getClientInfo(c);
    const accessLog = await logAccess(investor.tenantId, {
      investorId: investor.sub,
      roundId: round.id,
      documentId: docId,
      action: "view",
      ipAddress,
      userAgent,
    }).catch(() => null);

    const headers: Record<string, string> = {};
    if (accessLog) {
      headers["X-Access-Log-Id"] = accessLog.id;
    }

    return c.json({ url: presignedUrl, document: doc }, 200, headers);
  } catch (err) {
    console.error("[IR Portal] Error viewing document:", err);
    return c.json({ error: "Failed to get document" }, 500);
  }
});

ir.get("/ir/portal/rounds/:slug/documents/:docId/download", async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");
  const docId = c.req.param("docId");

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 400);

    // Check download allowed
    const allowDownload = (round.configuration as Record<string, unknown>)?.allowDownload !== false;
    if (!allowDownload) {
      return c.json({ error: "Downloads are not enabled for this round" }, 422);
    }

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 422);

    // Check NDA requirement
    if (investorRound.ndaRequired && !investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA must be accepted first" }, 422);
    }

    const doc = await getDocumentById(docId);
    if (!doc || doc.roundId !== round.id) return c.json({ error: "Document not found" }, 400);

    // Auto-promote investor to 'active' on first file access
    await promoteToViewingIfNeeded(investorRound.id).catch(() => {});

    // Log download
    const { ipAddress, userAgent } = getClientInfo(c);
    await logAccess(investor.tenantId, {
      investorId: investor.sub,
      roundId: round.id,
      documentId: docId,
      action: "download",
      ipAddress,
      userAgent,
    }).catch(() => {});

    if (doc.s3Key) {
      // Always try to stream from S3 through server (avoids presigned URL issues)
      try {
        const { buffer } = await downloadFileBuffer({ s3Key: doc.s3Key, s3Bucket: doc.s3Bucket ?? undefined });

        // Apply watermark if enabled, otherwise serve original
        let content: Buffer = buffer;
        if (doc.watermarkEnabled) {
          const { watermarkFile } = await import("../services/ir-watermark.ts");
          const watermarked = await watermarkFile(buffer, doc.mimeType, investor.email);
          if (watermarked) content = watermarked;
        }

        return new Response(new Uint8Array(content), {
          status: 200,
          headers: {
            "Content-Type": doc.mimeType || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${doc.name}"`,
            "Content-Length": content.length.toString(),
          },
        });
      } catch (err) {
        console.error("[IR Portal] S3 download failed, falling back to presigned URL:", err);
      }

      // Fallback: presigned download URL (if S3 direct download fails)
      const presignedUrl = await generateViewUrl({
        s3Key: doc.s3Key,
        s3Bucket: doc.s3Bucket ?? undefined,
        downloadAs: doc.name,
      });
      return c.json({ url: presignedUrl, document: doc });
    }

    return c.json({ url: null, document: doc });
  } catch (err) {
    console.error("[IR Portal] Error downloading document:", err);
    return c.json({ error: "Failed to get download URL" }, 500);
  }
});

ir.post("/ir/portal/rounds/:slug/documents/:docId/track", async (c) => {
  const body = await c.req.json<{ accessLogId: string; durationSeconds: number }>();

  if (!body.accessLogId || body.durationSeconds == null) {
    return c.json({ error: "accessLogId and durationSeconds are required" }, 400);
  }

  try {
    // Update the existing access log entry's duration (heartbeat pattern)
    await updateAccessLogDuration(body.accessLogId, body.durationSeconds);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR Portal] Error tracking view:", err);
    return c.json({ error: "Failed to track view" }, 500);
  }
});

// ── Duration heartbeat (alternative endpoint) ──────────────────────────

ir.use("/ir/portal/tracking", requireInvestor);

ir.post("/ir/portal/tracking", async (c) => {
  const body = await c.req.json<{ accessLogId: string; durationSeconds: number }>();

  if (!body.accessLogId || body.durationSeconds == null) {
    return c.json({ error: "accessLogId and durationSeconds are required" }, 400);
  }

  try {
    await updateAccessLogDuration(body.accessLogId, body.durationSeconds);
    return c.json({ success: true });
  } catch (err) {
    console.error("[IR Portal] Error updating duration:", err);
    return c.json({ error: "Failed to update duration" }, 500);
  }
});

// ── NDA download (signed NDA PDF) ────────────────────────────────────

ir.get("/ir/portal/rounds/:slug/nda/download", requireInvestor, async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");
  const format = c.req.query("format"); // "pdf" or "json" (default: "pdf")

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 400);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 422);

    if (!investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA not yet accepted" }, 400);
    }

    // Get the NDA template version that was signed
    const ndaTemplate = investorRound.ndaTemplateId
      ? await getSignedNdaTemplate(investorRound.ndaTemplateId)
      : await getActiveNda(round.id);

    if (!ndaTemplate) {
      return c.json({ error: "NDA template not found" }, 400);
    }

    // Return JSON if requested
    if (format === "json") {
      return c.json({
        content: ndaTemplate.content,
        version: ndaTemplate.version,
        acceptedAt: investorRound.ndaAcceptedAt,
        investorName: investor.name,
        investorEmail: investor.email,
        ipAddress: investorRound.ndaIpAddress,
      });
    }

    // Generate signed NDA as PDF (default)
    const investorRecord = await getInvestorById(investor.sub);
    const { generateSignedNdaPdf } = await import("../services/ir-nda-pdf.ts");
    const pdfBuffer = await generateSignedNdaPdf(ndaTemplate.content, {
      email: investor.email,
      name: investor.name,
      firm: investorRecord?.firm ?? null,
      ndaAcceptedAt: investorRound.ndaAcceptedAt,
      ndaIpAddress: investorRound.ndaIpAddress,
    });

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="NDA-${round.name}-${investor.email}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[IR Portal] Error downloading NDA:", err);
    return c.json({ error: "Failed to download NDA" }, 500);
  }
});

export default ir;
