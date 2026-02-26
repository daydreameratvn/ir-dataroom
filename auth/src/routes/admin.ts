import { Hono } from "hono";
import {
  requireAuth,
  requireAdmin,
  isSuperAdmin,
  getEffectiveTenantId,
  getClientInfo,
} from "../middleware.ts";
import {
  listUsers,
  findAdminUserById,
  findAdminUserByIdAnyTenant,
  createUser,
  updateUser,
  softDeleteUser,
  findUserByEmail,
  listTenants,
  setImpersonatable,
  getUserRoles,
} from "../services/user.ts";
import type { TokenPayload } from "../services/jwt.ts";
import { signAccessToken } from "../services/jwt.ts";
import {
  createSession,
  generateRefreshToken,
  revokeSession,
  validateRefreshToken,
} from "../services/session.ts";
import { logImpersonation } from "../services/impersonation.ts";
import { getCookie } from "hono/cookie";

const admin = new Hono();

const ROLE_HIERARCHY = ["admin", "executive", "manager", "staff", "viewer"];

function canSetLevel(actor: TokenPayload, targetLevel: string): boolean {
  const actorIdx = ROLE_HIERARCHY.indexOf(actor.role);
  const targetIdx = ROLE_HIERARCHY.indexOf(targetLevel);
  if (actorIdx === -1 || targetIdx === -1) return false;
  // Cannot escalate to same or higher level than own (except super admin)
  if (isSuperAdmin(actor)) return true;
  return targetIdx > actorIdx;
}

function canSetType(actor: TokenPayload, targetType: string): boolean {
  // Only papaya users can set userType to 'papaya'
  if (targetType === "papaya" && actor.userType !== "papaya") return false;
  return true;
}

// All admin routes require auth + admin level
admin.use("/admin/*", requireAuth, requireAdmin);

// GET /auth/admin/users — List users
admin.get("/admin/users", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);

  const search = c.req.query("search");
  const userType = c.req.query("user_type");
  const userLevel = c.req.query("user_level");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = parseInt(c.req.query("limit") || "20", 10);

  // Non-super-admin cannot query other tenants
  if (!isSuperAdmin(user) && tenantId !== user.tenantId) {
    return c.json({ error: "Cannot access users in another tenant" }, 403);
  }

  const result = await listUsers({
    tenantId,
    search,
    userType,
    userLevel,
    page,
    limit,
  });

  return c.json(result);
});

// GET /auth/admin/users/:id — Get single user
admin.get("/admin/users/:id", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("id");
  const tenantId = getEffectiveTenantId(c);

  if (!isSuperAdmin(user) && tenantId !== user.tenantId) {
    return c.json({ error: "Cannot access users in another tenant" }, 403);
  }

  const target = await findAdminUserById(userId, tenantId);
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: target });
});

// POST /auth/admin/users — Create user
admin.post("/admin/users", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    tenantId?: string;
    email: string;
    name: string;
    phone?: string;
    userType: string;
    userLevel: string;
    title?: string;
    department?: string;
    locale?: string;
  }>();

  if (!body.email || !body.name || !body.userType || !body.userLevel) {
    return c.json({ error: "email, name, userType, and userLevel are required" }, 400);
  }

  // Determine target tenant
  const tenantId = isSuperAdmin(user) && body.tenantId
    ? body.tenantId
    : user.tenantId;

  if (!isSuperAdmin(user) && tenantId !== user.tenantId) {
    return c.json({ error: "Cannot create users in another tenant" }, 403);
  }

  // Validate level/type permissions
  if (!canSetLevel(user, body.userLevel)) {
    return c.json({ error: "Cannot assign a user level equal to or higher than your own" }, 403);
  }

  if (!canSetType(user, body.userType)) {
    return c.json({ error: "Cannot assign userType 'papaya' — insufficient permissions" }, 403);
  }

  // Check email uniqueness within tenant
  const existing = await findUserByEmail(tenantId, body.email);
  if (existing) {
    return c.json({ error: "A user with this email already exists in this tenant" }, 409);
  }

  const newUser = await createUser({
    tenantId,
    email: body.email,
    name: body.name,
    phone: body.phone,
    userType: body.userType,
    userLevel: body.userLevel,
    title: body.title,
    department: body.department,
    locale: body.locale,
    createdBy: user.sub,
  });

  return c.json({ user: newUser }, 201);
});

// PUT /auth/admin/users/:id — Update user
admin.put("/admin/users/:id", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("id");
  const tenantId = getEffectiveTenantId(c);

  if (!isSuperAdmin(user) && tenantId !== user.tenantId) {
    return c.json({ error: "Cannot update users in another tenant" }, 403);
  }

  const body = await c.req.json<{
    name?: string;
    email?: string;
    phone?: string;
    userType?: string;
    userLevel?: string;
    title?: string;
    department?: string;
    locale?: string;
  }>();

  // Verify target user exists
  const target = await findAdminUserById(userId, tenantId);
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  // Validate level/type escalation
  if (body.userLevel && !canSetLevel(user, body.userLevel)) {
    return c.json({ error: "Cannot assign a user level equal to or higher than your own" }, 403);
  }

  if (body.userType && !canSetType(user, body.userType)) {
    return c.json({ error: "Cannot assign userType 'papaya' — insufficient permissions" }, 403);
  }

  // Check email uniqueness if changing email
  if (body.email && body.email !== target.email) {
    const existing = await findUserByEmail(tenantId, body.email);
    if (existing) {
      return c.json({ error: "A user with this email already exists in this tenant" }, 409);
    }
  }

  const updated = await updateUser(userId, tenantId, body, user.sub);
  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user: updated });
});

// DELETE /auth/admin/users/:id — Soft delete
admin.delete("/admin/users/:id", async (c) => {
  const user = c.get("user");
  const userId = c.req.param("id");
  const tenantId = getEffectiveTenantId(c);

  if (!isSuperAdmin(user) && tenantId !== user.tenantId) {
    return c.json({ error: "Cannot delete users in another tenant" }, 403);
  }

  // Prevent self-deletion
  if (userId === user.sub) {
    return c.json({ error: "Cannot delete your own account" }, 400);
  }

  const deleted = await softDeleteUser(userId, tenantId, user.sub);
  if (!deleted) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ success: true });
});

// GET /auth/admin/tenants — List tenants (super admin only)
admin.get("/admin/tenants", async (c) => {
  const user = c.get("user");

  if (!isSuperAdmin(user)) {
    return c.json({ error: "Super admin access required" }, 403);
  }

  const tenants = await listTenants();
  return c.json({ tenants });
});

// PUT /auth/admin/users/:id/impersonatable — Toggle impersonatable flag (super admin only)
admin.put("/admin/users/:id/impersonatable", async (c) => {
  const user = c.get("user");

  if (!isSuperAdmin(user)) {
    return c.json({ error: "Super admin access required" }, 403);
  }

  const userId = c.req.param("id");
  const body = await c.req.json<{ impersonatable: boolean }>();

  if (typeof body.impersonatable !== "boolean") {
    return c.json({ error: "impersonatable (boolean) is required" }, 400);
  }

  const tenantId = getEffectiveTenantId(c);
  const updated = await setImpersonatable(userId, tenantId, body.impersonatable, user.sub);

  if (!updated) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ success: true });
});

// POST /auth/admin/impersonate/:userId — Start impersonation (super admin only)
admin.post("/admin/impersonate/:userId", async (c) => {
  const actor = c.get("user");

  if (!isSuperAdmin(actor)) {
    return c.json({ error: "Super admin access required" }, 403);
  }

  const targetUserId = c.req.param("userId");

  // Prevent self-impersonation
  if (targetUserId === actor.sub) {
    return c.json({ error: "Cannot impersonate yourself" }, 400);
  }

  // Load target user (any tenant — super admin can impersonate across tenants)
  const target = await findAdminUserByIdAnyTenant(targetUserId);
  if (!target) {
    return c.json({ error: "User not found" }, 404);
  }

  if (!target.isImpersonatable) {
    return c.json({ error: "User is not impersonatable" }, 403);
  }

  const { userAgent, ipAddress } = getClientInfo(c);

  // Sign access token for target user with impersonatorId claim
  const roles = getUserRoles(target);
  const accessToken = await signAccessToken({
    sub: target.id,
    email: target.email,
    name: target.name,
    tenantId: target.tenantId,
    userType: target.userType,
    role: roles.role,
    allowedRoles: roles.allowedRoles,
    impersonatorId: actor.sub,
  });

  // Create impersonation session with 4-hour TTL
  const refreshToken = generateRefreshToken();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  const session = await createSession({
    tenantId: target.tenantId,
    userId: target.id,
    refreshToken,
    userAgent,
    ipAddress,
    impersonatorId: actor.sub,
    ttlMs: fourHoursMs,
  });

  // Log impersonation start
  await logImpersonation({
    tenantId: target.tenantId,
    impersonatorId: actor.sub,
    targetUserId: target.id,
    sessionId: session.id,
    action: "start",
    ipAddress,
    userAgent,
  });

  // Set impersonation refresh token cookie (4hr TTL)
  c.header(
    "Set-Cookie",
    `impersonation_refresh_token=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${4 * 60 * 60}`
  );

  // Load impersonator name for the banner
  const impersonator = await findAdminUserByIdAnyTenant(actor.sub);

  return c.json({
    accessToken,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    user: {
      id: target.id,
      email: target.email,
      name: target.name,
      tenantId: target.tenantId,
      userType: target.userType,
      userLevel: target.userLevel,
      isImpersonatable: target.isImpersonatable,
    },
    impersonation: {
      impersonatorId: actor.sub,
      impersonatorName: impersonator?.name ?? actor.name,
    },
  });
});

// POST /auth/admin/impersonate/end — End impersonation
admin.post("/admin/impersonate/end", async (c) => {
  const actor = c.get("user");

  if (!actor.impersonatorId) {
    return c.json({ error: "Not currently impersonating" }, 400);
  }

  // Revoke the impersonation session
  const impersonationToken = getCookie(c, "impersonation_refresh_token");
  if (impersonationToken) {
    const session = await validateRefreshToken(impersonationToken);
    if (session) {
      await revokeSession(session.sessionId);

      const { userAgent, ipAddress } = getClientInfo(c);
      await logImpersonation({
        tenantId: session.tenantId,
        impersonatorId: actor.impersonatorId,
        targetUserId: actor.sub,
        sessionId: session.sessionId,
        action: "end",
        ipAddress,
        userAgent,
      });
    }
  }

  // Clear the impersonation refresh token cookie
  c.header(
    "Set-Cookie",
    "impersonation_refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0"
  );

  return c.json({ success: true });
});

export default admin;
