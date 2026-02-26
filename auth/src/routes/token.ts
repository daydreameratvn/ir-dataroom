import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { requireAuth, getClientInfo } from "../middleware.ts";
import {
  validateRefreshToken,
  rotateSession,
  revokeSession,
  generateRefreshToken,
} from "../services/session.ts";
import { findUserById, findAdminUserByIdAnyTenant, getUserRoles } from "../services/user.ts";
import { signAccessToken } from "../services/jwt.ts";

const token = new Hono();

// POST /auth/token/refresh — exchange refresh token for new access token
token.post("/token/refresh", async (c) => {
  // Check for impersonation refresh token first, then standard refresh token
  let refreshToken = getCookie(c, "impersonation_refresh_token");
  const isImpersonationRefresh = !!refreshToken;

  if (!refreshToken) {
    refreshToken = getCookie(c, "refresh_token");
  }

  if (!refreshToken) {
    try {
      const body = await c.req.json<{ refreshToken?: string }>();
      refreshToken = body.refreshToken;
    } catch {
      // No body or invalid JSON
    }
  }

  if (!refreshToken) {
    return c.json({ error: "Refresh token is required" }, 400);
  }

  const session = await validateRefreshToken(refreshToken);
  if (!session) {
    // Clear the invalid cookie
    const cookieName = isImpersonationRefresh ? "impersonation_refresh_token" : "refresh_token";
    c.header(
      "Set-Cookie",
      `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0`
    );
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const { userAgent, ipAddress } = getClientInfo(c);

  // Rotate: revoke old session, create new one
  const newRefreshToken = generateRefreshToken();
  const fourHoursMs = 4 * 60 * 60 * 1000;
  await rotateSession({
    oldSessionId: session.sessionId,
    tenantId: session.tenantId,
    userId: session.userId,
    newRefreshToken,
    userAgent,
    ipAddress,
    impersonatorId: session.impersonatorId,
    ttlMs: session.impersonatorId ? fourHoursMs : undefined,
  });

  const roles = getUserRoles(user);
  const accessToken = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId,
    userType: user.userType,
    role: roles.role,
    allowedRoles: roles.allowedRoles,
    impersonatorId: session.impersonatorId,
  });

  // Set the appropriate cookie
  if (session.impersonatorId) {
    c.header(
      "Set-Cookie",
      `impersonation_refresh_token=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${4 * 60 * 60}`
    );
  } else {
    c.header(
      "Set-Cookie",
      `refresh_token=${newRefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=${30 * 24 * 60 * 60}`
    );
  }

  const response: Record<string, unknown> = {
    accessToken,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      userType: user.userType,
      userLevel: user.userLevel,
    },
  };

  // Include impersonation info if this is an impersonation session
  if (session.impersonatorId) {
    const impersonator = await findAdminUserByIdAnyTenant(session.impersonatorId);
    response.impersonation = {
      impersonatorId: session.impersonatorId,
      impersonatorName: impersonator?.name ?? "Admin",
    };
  }

  return c.json(response);
});

// POST /auth/token/revoke — revoke current session
token.post("/token/revoke", requireAuth, async (c) => {
  const refreshToken = getCookie(c, "refresh_token");

  if (refreshToken) {
    const session = await validateRefreshToken(refreshToken);
    if (session) {
      await revokeSession(session.sessionId);
    }
  }

  // Clear the refresh token cookie
  c.header(
    "Set-Cookie",
    "refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=0"
  );

  return c.json({ success: true });
});

export default token;
