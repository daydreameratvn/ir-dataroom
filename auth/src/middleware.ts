import type { Context, Next } from "hono";
import { verifyAccessToken, type TokenPayload } from "./services/jwt.ts";

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
