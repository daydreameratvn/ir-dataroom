import { Hono } from "hono";
import { SignJWT, jwtVerify } from "jose";
import { requireAuth, requireAdmin, getEffectiveTenantId, getClientInfo } from "../middleware.ts";
import { getJwtKey, authConfig } from "../config.ts";
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
  softDeleteInvestor,
  addInvestorToRound,
  updateInvestorRoundStatus,
  removeInvestorFromRound,
  listInvestorRounds,
  listRoundsForInvestor,
  getInvestorRound,
  recordInvestorAccess,
  promoteToActiveIfNeeded,
} from "../services/ir-investor.ts";
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
} from "../services/ir-access-log.ts";

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
// ADMIN ROUTES — requireAuth + requireAdmin
// ═══════════════════════════════════════════════════════════════════════════

ir.use("/ir/rounds*", requireAuth, requireAdmin);
ir.use("/ir/documents/*", requireAuth, requireAdmin);
ir.use("/ir/investors/*", requireAuth, requireAdmin);
ir.use("/ir/stats", requireAuth, requireAdmin);

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

ir.delete("/ir/rounds/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  try {
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
    skipNda?: boolean;
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

    // Add to round (skipNda bypasses NDA requirement for this investor)
    const irResult = await addInvestorToRound(tenantId, investor.id, roundId, user.sub, {
      skipNda: body.skipNda,
    });
    return c.json({ id: irResult.id, investorId: investor.id }, 201);
  } catch (err) {
    console.error("[IR API] Error adding investor to round:", err);
    return c.json({ error: "Failed to add investor to round" }, 500);
  }
});

ir.put("/ir/rounds/:rid/investors/:iid", async (c) => {
  const user = c.get("user");
  const investorRoundId = c.req.param("iid");
  const body = await c.req.json<{ status: string }>();

  if (!body.status) {
    return c.json({ error: "status is required" }, 400);
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
    return c.json(result, 201);
  } catch (err) {
    console.error("[IR API] Error creating document:", err);
    return c.json({ error: "Failed to create document" }, 500);
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

ir.post("/ir/investors/:id/invite", async (c) => {
  const id = c.req.param("id");

  try {
    const investor = await getInvestorById(id);
    if (!investor) return c.json({ error: "Investor not found" }, 404);

    // Send invitation email via SES
    const fromEmail = process.env.OTP_FROM_EMAIL || "noreply@papaya.asia";
    const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({ region: process.env.AWS_REGION || "ap-southeast-1" });

    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [investor.email] },
        Message: {
          Subject: { Data: "You've been invited to Papaya's investor dataroom" },
          Body: {
            Html: {
              Data: `
                <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
                  <h2 style="color: #1a1a1a;">Investor Dataroom Access</h2>
                  <p>Hi ${investor.name},</p>
                  <p>You've been invited to access Papaya's investor dataroom. Click the link below to get started:</p>
                  <p style="margin: 24px 0;">
                    <a href="https://investors.papaya.asia" style="background-color: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                      Access Dataroom
                    </a>
                  </p>
                  <p style="color: #666;">You'll be asked to verify your email address before accessing documents.</p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                  <p style="color: #999; font-size: 12px;">Papaya Insurance</p>
                </div>
              `,
            },
            Text: {
              Data: `Hi ${investor.name},\n\nYou've been invited to access Papaya's investor dataroom.\n\nVisit https://investors.papaya.asia to get started.\n\nPapaya Insurance`,
            },
          },
        },
      })
    );

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

  // Default tenant for investor portal
  const tenantId = c.req.header("x-tenant-id") || "papaya-demo";

  try {
    // Verify investor exists
    const investor = await getInvestorByEmail(tenantId, body.email);
    if (!investor) {
      // Return success even if not found (don't leak existence)
      return c.json({ success: true, message: "If an account exists, an OTP has been sent" });
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
    return c.json({ error: "Failed to send OTP" }, 500);
  }
});

ir.post("/ir/portal/otp/verify", async (c) => {
  const body = await c.req.json<{ email: string; code: string }>();

  if (!body.email || !body.code) {
    return c.json({ error: "email and code are required" }, 400);
  }

  const tenantId = c.req.header("x-tenant-id") || "papaya-demo";

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
      return c.json({ error: "Investor not found" }, 404);
    }

    // Check that investor has at least one non-dropped round
    const investorRounds = await listRoundsForInvestor(investor.id);
    const hasActiveRound = investorRounds.some((ir) => ir.status !== "dropped");
    if (!hasActiveRound) {
      return c.json({ error: "No active rounds found for this investor" }, 403);
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
    return c.json({ error: "Failed to verify OTP" }, 500);
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

ir.use("/ir/portal/rounds*", requireInvestor);

ir.get("/ir/portal/rounds", async (c) => {
  const investor = c.get("investor");

  try {
    const rounds = await listRoundsForInvestor(investor.sub);
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
    if (!round) return c.json({ error: "Round not found" }, 404);

    // Verify investor has access
    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 403);

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
    if (!round) return c.json({ error: "Round not found" }, 404);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 403);

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
    if (!round) return c.json({ error: "Round not found" }, 404);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 403);

    // Check NDA requirement (per-investor flag)
    if (investorRound.ndaRequired && !investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA must be accepted first" }, 403);
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
    if (!round) return c.json({ error: "Round not found" }, 404);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 403);

    const doc = await getDocumentById(docId);
    if (!doc || doc.roundId !== round.id) return c.json({ error: "Document not found" }, 404);

    // Auto-promote investor to 'active' on first file access
    await promoteToActiveIfNeeded(investorRound.id).catch(() => {});

    // Generate presigned URL (placeholder — S3 integration in Phase 6)
    const presignedUrl = doc.s3Key
      ? `https://${doc.s3Bucket}.s3.ap-southeast-1.amazonaws.com/${doc.s3Key}`
      : null;

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
    if (!round) return c.json({ error: "Round not found" }, 404);

    // Check download allowed
    const allowDownload = (round.configuration as Record<string, unknown>)?.allowDownload !== false;
    if (!allowDownload) {
      return c.json({ error: "Downloads are not enabled for this round" }, 403);
    }

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 403);

    const doc = await getDocumentById(docId);
    if (!doc || doc.roundId !== round.id) return c.json({ error: "Document not found" }, 404);

    // Auto-promote investor to 'active' on first file access
    await promoteToActiveIfNeeded(investorRound.id).catch(() => {});

    // Generate presigned URL (placeholder — S3 integration in Phase 6)
    const presignedUrl = doc.s3Key
      ? `https://${doc.s3Bucket}.s3.ap-southeast-1.amazonaws.com/${doc.s3Key}`
      : null;

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

    return c.json({ url: presignedUrl, document: doc });
  } catch (err) {
    console.error("[IR Portal] Error downloading document:", err);
    return c.json({ error: "Failed to get download URL" }, 500);
  }
});

ir.post("/ir/portal/rounds/:slug/documents/:docId/track", async (c) => {
  const investor = c.get("investor");
  const slug = c.req.param("slug");
  const docId = c.req.param("docId");
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

  try {
    const round = await getRoundBySlug(investor.tenantId, slug);
    if (!round) return c.json({ error: "Round not found" }, 404);

    const investorRound = await getInvestorRound(investor.sub, round.id);
    if (!investorRound) return c.json({ error: "Access denied" }, 403);

    if (!investorRound.ndaAcceptedAt) {
      return c.json({ error: "NDA not yet accepted" }, 400);
    }

    // Get the NDA template version that was signed
    const ndaTemplate = investorRound.ndaTemplateId
      ? await getSignedNdaTemplate(investorRound.ndaTemplateId)
      : await getActiveNda(round.id);

    if (!ndaTemplate) {
      return c.json({ error: "NDA template not found" }, 404);
    }

    return c.json({
      content: ndaTemplate.content,
      version: ndaTemplate.version,
      acceptedAt: investorRound.ndaAcceptedAt,
      investorName: investor.name,
      investorEmail: investor.email,
      ipAddress: investorRound.ndaIpAddress,
    });
  } catch (err) {
    console.error("[IR Portal] Error downloading NDA:", err);
    return c.json({ error: "Failed to download NDA" }, 500);
  }
});

export default ir;
