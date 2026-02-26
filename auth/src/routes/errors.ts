import { Hono } from "hono";
import {
  requireAuth,
  requireAdmin,
  isSuperAdmin,
  getEffectiveTenantId,
  getClientInfo,
} from "../middleware.ts";
import { verifyAccessToken } from "../services/jwt.ts";
import type { TokenPayload } from "../services/jwt.ts";
import {
  upsertErrorReport,
  generateFingerprint,
  listErrorReports,
  getErrorReport,
  updateErrorStatus,
} from "../services/error-report.ts";

const errors = new Hono();

// ── POST /errors/report — Submit error (optional auth) ──

errors.post("/errors/report", async (c) => {
  // Try to extract user from Authorization header (but don't require it)
  let user: TokenPayload | null = null;
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    user = await verifyAccessToken(token);
  }

  const body = await c.req.json<{
    source?: string;
    message?: string;
    stackTrace?: string;
    componentStack?: string;
    url?: string;
    endpoint?: string;
    severity?: string;
    metadata?: Record<string, unknown>;
    fingerprint?: string;
  }>();

  // Validate required fields
  if (!body.source || !body.message) {
    return c.json({ error: "source and message are required" }, 400);
  }

  // Validate source
  const validSources = [
    "frontend_boundary",
    "frontend_unhandled",
    "backend_unhandled",
    "backend_api",
    "agent",
  ];
  if (!validSources.includes(body.source)) {
    return c.json({ error: `Invalid source. Must be one of: ${validSources.join(", ")}` }, 400);
  }

  // Validate severity if provided
  const validSeverities = ["critical", "error", "warning"];
  if (body.severity && !validSeverities.includes(body.severity)) {
    return c.json({ error: `Invalid severity. Must be one of: ${validSeverities.join(", ")}` }, 400);
  }

  const { userAgent, ipAddress } = getClientInfo(c);
  const fingerprint = body.fingerprint ?? generateFingerprint(body.source, body.message, body.stackTrace);

  const result = await upsertErrorReport({
    tenantId: user?.tenantId,
    source: body.source,
    severity: body.severity,
    message: body.message,
    stackTrace: body.stackTrace,
    componentStack: body.componentStack,
    url: body.url,
    endpoint: body.endpoint,
    userId: user?.sub,
    impersonatorId: user?.impersonatorId,
    userAgent,
    ipAddress,
    metadata: body.metadata,
    fingerprint,
    createdBy: user?.sub ?? "anonymous",
  });

  return c.json({ id: result.id, deduplicated: !result.isNew });
});

// ── Admin routes — require auth + admin ──

errors.use("/errors", requireAuth, requireAdmin);
errors.use("/errors/:id", requireAuth, requireAdmin);
errors.use("/errors/:id/*", requireAuth, requireAdmin);

// ── GET /errors — List errors (admin only) ──

errors.get("/errors", async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");
  const source = c.req.query("source");
  const status = c.req.query("status");
  const severity = c.req.query("severity");
  const search = c.req.query("search");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const sortBy = c.req.query("sort_by") || "last_seen_at";
  const sortOrder = c.req.query("sort_order") || "desc";

  // Non-super-admin can only see their own tenant's errors
  const effectiveTenantId = isSuperAdmin(user)
    ? tenantId || undefined
    : user.tenantId;

  const result = await listErrorReports({
    tenantId: effectiveTenantId,
    source,
    status,
    severity,
    search,
    page,
    limit,
    sortBy,
    sortOrder,
  });

  return c.json(result);
});

// ── GET /errors/:id — Get single error (admin only) ──

errors.get("/errors/:id", async (c) => {
  const id = c.req.param("id");
  const report = await getErrorReport(id);

  if (!report) {
    return c.json({ error: "Error report not found" }, 404);
  }

  // Non-super-admin can only see their own tenant's errors
  const user = c.get("user");
  if (!isSuperAdmin(user) && report.tenantId && report.tenantId !== user.tenantId) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ error: report });
});

// ── PUT /errors/:id/status — Update status (admin only) ──

errors.put("/errors/:id/status", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const body = await c.req.json<{
    status: string;
    fixPrUrl?: string;
    fixPrNumber?: number;
    fixBranch?: string;
  }>();

  if (!body.status) {
    return c.json({ error: "status is required" }, 400);
  }

  try {
    const updated = await updateErrorStatus(id, body.status, user.sub, {
      fixPrUrl: body.fixPrUrl,
      fixPrNumber: body.fixPrNumber,
      fixBranch: body.fixBranch,
    });

    if (!updated) {
      return c.json({ error: "Error report not found" }, 404);
    }

    return c.json({ error: updated });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid status")) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

// ── POST /errors/:id/auto-fix — Trigger auto-fix (super admin only) ──

errors.post("/errors/:id/auto-fix", async (c) => {
  const user = c.get("user");

  if (!isSuperAdmin(user)) {
    return c.json({ error: "Super admin access required" }, 403);
  }

  const id = c.req.param("id");
  const report = await getErrorReport(id);

  if (!report) {
    return c.json({ error: "Error report not found" }, 404);
  }

  // Update status to auto_fix_pending
  await updateErrorStatus(id, "auto_fix_pending", user.sub);

  // TODO: Trigger GitHub Actions workflow_dispatch here

  return c.json({ success: true });
});

export default errors;
