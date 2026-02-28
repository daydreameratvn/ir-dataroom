import { query } from "../db/pool.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  userType: string;
  userLevel: string;
  phone?: string;
  isImpersonatable: boolean;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  user_type: string;
  user_level: string;
  phone: string | null;
  is_impersonatable: boolean;
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
    isImpersonatable: row.is_impersonatable ?? false,
  };
}

export async function findUserByIdentity(
  tenantId: string,
  provider: string,
  providerUserId: string
): Promise<AuthUser | null> {
  const result = await query<UserRow>(
    `SELECT u.id, u.email, u.name, u.tenant_id, u.user_type, u.user_level, u.phone, u.is_impersonatable
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
    `SELECT id, email, name, tenant_id, user_type, user_level, phone, is_impersonatable
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
    `SELECT id, email, name, tenant_id, user_type, user_level, phone, is_impersonatable
     FROM users
     WHERE tenant_id = $1 AND phone = $2 AND deleted_at IS NULL`,
    [tenantId, phone]
  );

  const row = result.rows[0];
  return row ? rowToUser(row) : null;
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const result = await query<UserRow>(
    `SELECT id, email, name, tenant_id, user_type, user_level, phone, is_impersonatable
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

// ---------- Directory auto-join ----------

interface AutoJoinProviderRow {
  id: string;
  auto_join_user_type: string;
  auto_join_user_level: string;
}

export async function findAutoJoinProvider(
  domain: string,
  tenantId: string
): Promise<AutoJoinProviderRow | null> {
  const result = await query<AutoJoinProviderRow>(
    `SELECT id, auto_join_user_type, auto_join_user_level
     FROM tenant_identity_providers
     WHERE tenant_id = $1
       AND $2 = ANY(domains)
       AND auto_join_enabled = true
       AND is_active = true
       AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, domain.toLowerCase()]
  );
  return result.rows[0] ?? null;
}

export async function autoProvisionUser(opts: {
  tenantId: string;
  email: string;
  name: string;
  userType: string;
  userLevel: string;
  directoryProviderId: string;
  directorySyncId?: string;
}): Promise<AuthUser> {
  const id = crypto.randomUUID();
  const result = await query<UserRow>(
    `INSERT INTO users
       (id, tenant_id, email, name, user_type, user_level,
        directory_provider_id, directory_sync_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, email, name, tenant_id, user_type, user_level, phone, is_impersonatable`,
    [
      id,
      opts.tenantId,
      opts.email,
      opts.name,
      opts.userType,
      opts.userLevel,
      opts.directoryProviderId,
      opts.directorySyncId ?? null,
    ]
  );
  return rowToUser(result.rows[0]!);
}

// ---------- Admin user management ----------

export interface AdminUserView extends AuthUser {
  title?: string;
  department?: string;
  locale?: string;
  lastLoginAt?: string;
  createdAt: string;
  createdByName?: string;
}

export interface ListUsersOptions {
  tenantId: string;
  search?: string;
  userType?: string;
  userLevel?: string;
  page?: number;
  limit?: number;
}

export interface ListUsersResult {
  data: AdminUserView[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface AdminUserRow extends UserRow {
  title: string | null;
  department: string | null;
  locale: string | null;
  last_login_at: string | null;
  created_at: string;
  created_by_name: string | null;
  // is_impersonatable is inherited from UserRow
}

function rowToAdminUser(row: AdminUserRow): AdminUserView {
  return {
    ...rowToUser(row),
    title: row.title ?? undefined,
    department: row.department ?? undefined,
    locale: row.locale ?? undefined,
    lastLoginAt: row.last_login_at ?? undefined,
    createdAt: row.created_at,
    createdByName: row.created_by_name ?? undefined,
  };
}

export async function listUsers(opts: ListUsersOptions): Promise<ListUsersResult> {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = ["u.tenant_id = $1", "u.deleted_at IS NULL"];
  const params: unknown[] = [opts.tenantId];
  let paramIdx = 2;

  if (opts.search) {
    conditions.push(`(u.name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`);
    params.push(`%${opts.search}%`);
    paramIdx++;
  }

  if (opts.userType) {
    conditions.push(`u.user_type = $${paramIdx}`);
    params.push(opts.userType);
    paramIdx++;
  }

  if (opts.userLevel) {
    conditions.push(`u.user_level = $${paramIdx}`);
    params.push(opts.userLevel);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM users u WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<AdminUserRow>(
    `SELECT u.id, u.email, u.name, u.tenant_id, u.user_type, u.user_level, u.phone,
            u.title, u.department, u.locale, u.last_login_at, u.created_at, u.is_impersonatable,
            cb.name AS created_by_name
     FROM users u
     LEFT JOIN users cb ON cb.id = u.created_by
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  const users = dataResult.rows.map(rowToAdminUser);

  return {
    data: users,
    total,
    page,
    pageSize: limit,
    hasMore: page * limit < total,
  };
}

export async function createUser(opts: {
  tenantId: string;
  email: string;
  name: string;
  phone?: string;
  userType: string;
  userLevel: string;
  title?: string;
  department?: string;
  locale?: string;
  createdBy: string;
}): Promise<AdminUserView> {
  const id = crypto.randomUUID();
  const result = await query<AdminUserRow>(
    `INSERT INTO users (id, tenant_id, email, name, phone, user_type, user_level, title, department, locale, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id, email, name, tenant_id, user_type, user_level, phone, title, department, locale, last_login_at, created_at, is_impersonatable`,
    [
      id,
      opts.tenantId,
      opts.email,
      opts.name,
      opts.phone ?? null,
      opts.userType,
      opts.userLevel,
      opts.title ?? null,
      opts.department ?? null,
      opts.locale ?? null,
      opts.createdBy,
    ]
  );

  return rowToAdminUser(result.rows[0]!);
}

export async function updateUser(
  userId: string,
  tenantId: string,
  fields: {
    name?: string;
    email?: string;
    phone?: string;
    userType?: string;
    userLevel?: string;
    title?: string;
    department?: string;
    locale?: string;
  },
  updatedBy: string
): Promise<AdminUserView | null> {
  const setClauses: string[] = ["updated_at = now()", "updated_by = $3"];
  const params: unknown[] = [userId, tenantId, updatedBy];
  let paramIdx = 4;

  const fieldMap: Record<string, string> = {
    name: "name",
    email: "email",
    phone: "phone",
    userType: "user_type",
    userLevel: "user_level",
    title: "title",
    department: "department",
    locale: "locale",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = fields[key as keyof typeof fields];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 2) {
    // No fields to update besides updated_at/updated_by
    return findAdminUserById(userId, tenantId);
  }

  const result = await query<AdminUserRow>(
    `UPDATE users
     SET ${setClauses.join(", ")}
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id, email, name, tenant_id, user_type, user_level, phone, title, department, locale, last_login_at, created_at, is_impersonatable`,
    params
  );

  const row = result.rows[0];
  return row ? rowToAdminUser(row) : null;
}

export async function softDeleteUser(
  userId: string,
  tenantId: string,
  deletedBy: string
): Promise<boolean> {
  const result = await query(
    `UPDATE users
     SET deleted_at = now(), deleted_by = $3, updated_at = now(), updated_by = $3
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [userId, tenantId, deletedBy]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

export async function findAdminUserById(
  userId: string,
  tenantId: string
): Promise<AdminUserView | null> {
  const result = await query<AdminUserRow>(
    `SELECT id, email, name, tenant_id, user_type, user_level, phone,
            title, department, locale, last_login_at, created_at, is_impersonatable
     FROM users
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [userId, tenantId]
  );

  const row = result.rows[0];
  return row ? rowToAdminUser(row) : null;
}

interface TenantRow {
  id: string;
  name: string;
  national: string | null;
  configuration: Record<string, unknown> | null;
  created_at: string;
}

export interface TenantView {
  id: string;
  name: string;
  national?: string;
  configuration?: Record<string, unknown>;
  createdAt: string;
}

export async function listTenants(): Promise<TenantView[]> {
  const result = await query<TenantRow>(
    `SELECT id, name, national, configuration, created_at
     FROM tenants
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    national: row.national ?? undefined,
    configuration: row.configuration ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function setImpersonatable(
  userId: string,
  tenantId: string,
  value: boolean,
  updatedBy: string
): Promise<boolean> {
  const result = await query(
    `UPDATE users
     SET is_impersonatable = $3, updated_at = now(), updated_by = $4
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [userId, tenantId, value, updatedBy]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

export async function findAdminUserByIdAnyTenant(
  userId: string
): Promise<AdminUserView | null> {
  const result = await query<AdminUserRow>(
    `SELECT id, email, name, tenant_id, user_type, user_level, phone,
            title, department, locale, last_login_at, created_at, is_impersonatable
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  const row = result.rows[0];
  return row ? rowToAdminUser(row) : null;
}
