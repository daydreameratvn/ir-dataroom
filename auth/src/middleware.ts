import type { Context, Next } from "hono";
import { verifyAccessToken } from "./services/jwt.ts";
import type { TokenPayload } from "./services/jwt.ts";

declare module "hono" {
  interface ContextVariableMap {
    user: TokenPayload;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("user", payload);
  return next();
}

export function getTenantId(c: Context): string {
  // Tenant ID comes from header (set by platform) or query param
  return (
    c.req.header("x-tenant-id") ??
    c.req.query("tenant_id") ??
    "papaya-demo"
  );
}

export function getClientInfo(c: Context): {
  userAgent?: string;
  ipAddress?: string;
} {
  return {
    userAgent: c.req.header("user-agent"),
    ipAddress:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip"),
  };
}

export async function requireAdmin(c: Context, next: Next) {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const isAdmin = user.role === "admin";
  if (!isAdmin) {
    return c.json({ error: "Admin access required" }, 403);
  }

  return next();
}

export function isSuperAdmin(user: TokenPayload): boolean {
  return user.userType === "papaya" && user.role === "admin";
}

/** Gets effective tenant ID — super admins can specify any tenant via query param */
export function getEffectiveTenantId(c: Context): string {
  const user = c.get("user");
  if (isSuperAdmin(user)) {
    return c.req.query("tenant_id") || user.tenantId;
  }
  return user.tenantId;
}
