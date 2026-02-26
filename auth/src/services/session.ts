import { randomBytes, createHash } from "crypto";
import { query } from "../db/pool.ts";
import { authConfig } from "../config.ts";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(opts: {
  tenantId: string;
  userId: string;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ id: string; expiresAt: Date }> {
  const tokenHash = hashToken(opts.refreshToken);
  const expiresAt = new Date(
    Date.now() + authConfig.refreshTokenDays * 24 * 60 * 60 * 1000
  );

  const result = await query<{ id: string }>(
    `INSERT INTO auth_sessions (tenant_id, user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [opts.tenantId, opts.userId, tokenHash, expiresAt, opts.userAgent, opts.ipAddress]
  );

  return { id: result.rows[0]!.id, expiresAt };
}

export async function validateRefreshToken(
  refreshToken: string
): Promise<{ userId: string; tenantId: string; sessionId: string } | null> {
  const tokenHash = hashToken(refreshToken);

  const result = await query<{
    id: string;
    user_id: string;
    tenant_id: string;
  }>(
    `SELECT id, user_id, tenant_id FROM auth_sessions
     WHERE token_hash = $1
       AND expires_at > now()
       AND revoked_at IS NULL
       AND deleted_at IS NULL`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    sessionId: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
  };
}

export async function rotateSession(opts: {
  oldSessionId: string;
  tenantId: string;
  userId: string;
  newRefreshToken: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ id: string; expiresAt: Date }> {
  // Revoke old session
  await query(
    `UPDATE auth_sessions SET revoked_at = now(), updated_at = now()
     WHERE id = $1`,
    [opts.oldSessionId]
  );

  // Create new session
  return createSession({
    tenantId: opts.tenantId,
    userId: opts.userId,
    refreshToken: opts.newRefreshToken,
    userAgent: opts.userAgent,
    ipAddress: opts.ipAddress,
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE auth_sessions SET revoked_at = now(), updated_at = now()
     WHERE id = $1`,
    [sessionId]
  );
}

export async function revokeAllUserSessions(
  userId: string,
  tenantId: string
): Promise<void> {
  await query(
    `UPDATE auth_sessions SET revoked_at = now(), updated_at = now()
     WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL AND deleted_at IS NULL`,
    [userId, tenantId]
  );
}
