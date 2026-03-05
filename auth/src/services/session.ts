import { randomBytes, createHash } from "crypto";
import { gqlQuery } from "./gql.ts";
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
  impersonatorId?: string;
  ttlMs?: number;
}): Promise<{ id: string; expiresAt: Date }> {
  const tokenHash = hashToken(opts.refreshToken);
  const ttl = opts.ttlMs ?? authConfig.refreshTokenDays * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttl);

  const data = await gqlQuery<{
    insertAuthSessions: { returning: Array<{ id: string }> };
  }>(`
    mutation CreateSession($object: InsertAuthSessionsObjectInput!) {
      insertAuthSessions(objects: [$object]) {
        returning { id }
      }
    }
  `, {
    object: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      tokenHash,
      expiresAt: expiresAt.toISOString(),
      userAgent: opts.userAgent ?? null,
      ipAddress: opts.ipAddress ?? null,
      // TODO: add impersonatorId after DDN metadata deploy
    },
  });

  return { id: data.insertAuthSessions.returning[0]!.id, expiresAt };
}

export async function validateRefreshToken(
  refreshToken: string
): Promise<{ userId: string; tenantId: string; sessionId: string; impersonatorId?: string } | null> {
  const tokenHash = hashToken(refreshToken);
  const now = new Date().toISOString();

  const data = await gqlQuery<{
    authSessions: Array<{
      id: string;
      userId: string;
      tenantId: string;
    }>;
  }>(`
    query ValidateRefreshToken($tokenHash: String1!, $now: Timestamptz!) {
      authSessions(
        where: {
          tokenHash: { _eq: $tokenHash }
          expiresAt: { _gt: $now }
          revokedAt: { _is_null: true }
          deletedAt: { _is_null: true }
        }
        limit: 1
      ) {
        id
        userId
        tenantId
      }
    }
  `, { tokenHash, now });

  const row = data.authSessions[0];
  if (!row) return null;

  return {
    sessionId: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    // TODO: add impersonatorId after DDN metadata deploy
  };
}

export async function rotateSession(opts: {
  oldSessionId: string;
  tenantId: string;
  userId: string;
  newRefreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  impersonatorId?: string;
  ttlMs?: number;
}): Promise<{ id: string; expiresAt: Date }> {
  // Revoke old session
  const now = new Date().toISOString();
  await gqlQuery(`
    mutation RevokeOldSession($id: Uuid!, $now: Timestamptz!) {
      updateAuthSessionsById(
        keyId: $id
        updateColumns: {
          revokedAt: { set: $now }
          updatedAt: { set: $now }
        }
      ) { affectedRows }
    }
  `, { id: opts.oldSessionId, now });

  // Create new session
  return createSession({
    tenantId: opts.tenantId,
    userId: opts.userId,
    refreshToken: opts.newRefreshToken,
    userAgent: opts.userAgent,
    ipAddress: opts.ipAddress,
    impersonatorId: opts.impersonatorId,
    ttlMs: opts.ttlMs,
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  await gqlQuery(`
    mutation RevokeSession($id: Uuid!, $now: Timestamptz!) {
      updateAuthSessionsById(
        keyId: $id
        updateColumns: {
          revokedAt: { set: $now }
          updatedAt: { set: $now }
        }
      ) { affectedRows }
    }
  `, { id: sessionId, now });
}

export async function revokeAllUserSessions(
  userId: string,
  tenantId: string
): Promise<void> {
  const now = new Date().toISOString();

  // Query active sessions for this user
  const data = await gqlQuery<{
    authSessions: Array<{ id: string }>;
  }>(`
    query FindActiveSessions($userId: Uuid!, $tenantId: Uuid!) {
      authSessions(
        where: {
          userId: { _eq: $userId }
          tenantId: { _eq: $tenantId }
          revokedAt: { _is_null: true }
          deletedAt: { _is_null: true }
        }
      ) { id }
    }
  `, { userId, tenantId });

  // Revoke each session
  for (const session of data.authSessions) {
    await gqlQuery(`
      mutation RevokeSessionById($id: Uuid!, $now: Timestamptz!) {
        updateAuthSessionsById(
          keyId: $id
          updateColumns: {
            revokedAt: { set: $now }
            updatedAt: { set: $now }
          }
        ) { affectedRows }
      }
    `, { id: session.id, now });
  }
}
