import { query } from "../db/pool.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  userType: string;
  userLevel: string;
  phone?: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  user_type: string;
  user_level: string;
  phone: string | null;
}

const ROLE_HIERARCHY = ["admin", "executive", "manager", "staff", "viewer"];

function getAllowedRoles(userLevel: string): string[] {
  const idx = ROLE_HIERARCHY.indexOf(userLevel);
  if (idx === -1) return ["viewer"];
  return ROLE_HIERARCHY.slice(idx);
}

export function getUserRoles(user: AuthUser): {
  role: string;
  allowedRoles: string[];
} {
  return {
    role: user.userLevel,
    allowedRoles: getAllowedRoles(user.userLevel),
  };
}

function rowToUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tenantId: row.tenant_id,
    userType: row.user_type,
    userLevel: row.user_level,
    phone: row.phone ?? undefined,
  };
}

export async function findUserByIdentity(
  tenantId: string,
  provider: string,
  providerUserId: string
): Promise<AuthUser | null> {
  const result = await query<UserRow>(
    `SELECT u.id, u.email, u.name, u.tenant_id, u.user_type, u.user_level, u.phone
     FROM auth_identities ai
     JOIN users u ON u.id = ai.user_id AND u.deleted_at IS NULL
     WHERE ai.tenant_id = $1
       AND ai.provider = $2
       AND ai.provider_user_id = $3
       AND ai.deleted_at IS NULL`,
    [tenantId, provider, providerUserId]
  );

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

export async function findUserByEmail(
  tenantId: string,
  email: string
): Promise<AuthUser | null> {
  const result = await query<UserRow>(
    `SELECT id, email, name, tenant_id, user_type, user_level, phone
     FROM users
     WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL`,
    [tenantId, email]
  );

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

export async function findUserByPhone(
  tenantId: string,
  phone: string
): Promise<AuthUser | null> {
  const result = await query<UserRow>(
    `SELECT id, email, name, tenant_id, user_type, user_level, phone
     FROM users
     WHERE tenant_id = $1 AND phone = $2 AND deleted_at IS NULL`,
    [tenantId, phone]
  );

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const result = await query<UserRow>(
    `SELECT id, email, name, tenant_id, user_type, user_level, phone
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

export async function linkIdentity(
  tenantId: string,
  userId: string,
  provider: string,
  providerUserId: string
): Promise<void> {
  await query(
    `INSERT INTO auth_identities (tenant_id, user_id, provider, provider_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [tenantId, userId, provider, providerUserId]
  );
}

export async function updateLastLogin(userId: string): Promise<void> {
  await query(
    `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`,
    [userId]
  );
}

export async function recordLoginAttempt(opts: {
  tenantId: string;
  userId?: string;
  provider: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  failureReason?: string;
}): Promise<void> {
  await query(
    `INSERT INTO auth_login_attempts (tenant_id, user_id, provider, success, ip_address, user_agent, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      opts.tenantId,
      opts.userId ?? null,
      opts.provider,
      opts.success,
      opts.ipAddress ?? null,
      opts.userAgent ?? null,
      opts.failureReason ?? null,
    ]
  );
}
