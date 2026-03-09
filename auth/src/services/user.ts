import { gqlQuery } from "./gql.ts";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  userType: string;
  userLevel: string;
  phone?: string;
  isImpersonatable: boolean;
  canImpersonate: boolean;
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

/** DDN returns camelCase fields — map to AuthUser */
interface GqlUserRow {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  userType: string;
  userLevel: string;
  phone: string | null;
  isImpersonatable: boolean;
  canImpersonate: boolean;
}

function gqlRowToUser(row: GqlUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tenantId: row.tenantId,
    userType: row.userType,
    userLevel: row.userLevel,
    phone: row.phone ?? undefined,
    isImpersonatable: row.isImpersonatable ?? false,
    canImpersonate: row.canImpersonate ?? false,
  };
}

const USER_GQL_FIELDS = `id email name tenantId userType userLevel phone isImpersonatable canImpersonate`;

export async function findUserByIdentity(
  tenantId: string,
  provider: string,
  providerUserId: string
): Promise<AuthUser | null> {
  const data = await gqlQuery<{
    authIdentities: Array<{ user: GqlUserRow }>;
  }>(`
    query FindUserByIdentity($tenantId: Uuid!, $provider: String1!, $providerUserId: String1!) {
      authIdentities(
        where: {
          tenantId: { _eq: $tenantId },
          provider: { _eq: $provider },
          providerUserId: { _eq: $providerUserId },
          deletedAt: { _is_null: true },
          user: { deletedAt: { _is_null: true } }
        }
        limit: 1
      ) {
        user { ${USER_GQL_FIELDS} }
      }
    }
  `, { tenantId, provider, providerUserId });

  const row = data.authIdentities[0];
  return row ? gqlRowToUser(row.user) : null;
}

export async function findUserByEmail(
  tenantId: string,
  email: string
): Promise<AuthUser | null> {
  const data = await gqlQuery<{ users: GqlUserRow[] }>(`
    query FindUserByEmail($tenantId: Uuid!, $email: String1!) {
      users(
        where: { tenantId: { _eq: $tenantId }, email: { _eq: $email }, deletedAt: { _is_null: true } }
        limit: 1
      ) { ${USER_GQL_FIELDS} }
    }
  `, { tenantId, email });

  const row = data.users[0];
  return row ? gqlRowToUser(row) : null;
}

export async function findUserByPhone(
  tenantId: string,
  phone: string
): Promise<AuthUser | null> {
  const data = await gqlQuery<{ users: GqlUserRow[] }>(`
    query FindUserByPhone($tenantId: Uuid!, $phone: String1!) {
      users(
        where: { tenantId: { _eq: $tenantId }, phone: { _eq: $phone }, deletedAt: { _is_null: true } }
        limit: 1
      ) { ${USER_GQL_FIELDS} }
    }
  `, { tenantId, phone });

  const row = data.users[0];
  return row ? gqlRowToUser(row) : null;
}

export async function findUserById(userId: string): Promise<AuthUser | null> {
  const data = await gqlQuery<{ users: GqlUserRow[] }>(`
    query FindUserById($userId: Uuid!) {
      users(
        where: { id: { _eq: $userId }, deletedAt: { _is_null: true } }
        limit: 1
      ) { ${USER_GQL_FIELDS} }
    }
  `, { userId });

  const row = data.users[0];
  return row ? gqlRowToUser(row) : null;
}

export async function linkIdentity(
  tenantId: string,
  userId: string,
  provider: string,
  providerUserId: string
): Promise<void> {
  // Check if identity already exists to replicate ON CONFLICT DO NOTHING
  const existing = await gqlQuery<{
    authIdentities: Array<{ id: string }>;
  }>(`
    query CheckIdentity($tenantId: Uuid!, $provider: String1!, $providerUserId: String1!) {
      authIdentities(
        where: {
          tenantId: { _eq: $tenantId },
          provider: { _eq: $provider },
          providerUserId: { _eq: $providerUserId }
        }
        limit: 1
      ) { id }
    }
  `, { tenantId, provider, providerUserId });

  if (existing.authIdentities.length > 0) return;

  try {
    await gqlQuery(`
      mutation LinkIdentity($object: InsertAuthIdentitiesObjectInput!) {
        insertAuthIdentities(objects: [$object]) { affectedRows }
      }
    `, {
      object: { tenantId, userId, provider, providerUserId },
    });
  } catch {
    // Ignore duplicate key errors (race condition equivalent of ON CONFLICT DO NOTHING)
  }
}

export async function updateLastLogin(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await gqlQuery(`
    mutation UpdateLastLogin($userId: Uuid!, $now: Timestamptz!) {
      updateUsersById(
        keyId: $userId
        updateColumns: {
          lastLoginAt: { set: $now }
          updatedAt: { set: $now }
        }
      ) { affectedRows }
    }
  `, { userId, now });
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
  await gqlQuery(`
    mutation RecordLoginAttempt($object: InsertAuthLoginAttemptsObjectInput!) {
      insertAuthLoginAttempts(objects: [$object]) { affectedRows }
    }
  `, {
    object: {
      tenantId: opts.tenantId,
      userId: opts.userId ?? null,
      provider: opts.provider,
      success: opts.success,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      failureReason: opts.failureReason ?? null,
    },
  });
}

// ---------- Directory auto-join ----------

interface AutoJoinProviderRow {
  id: string;
  autoJoinUserType: string;
  autoJoinUserLevel: string;
}

export async function findAutoJoinProvider(
  domain: string,
  tenantId: string
): Promise<AutoJoinProviderRow | null> {
  // Query all active auto-join providers for the tenant, then filter by domain in TypeScript
  // (Hasura DDN doesn't support array-contains filtering on text[] columns)
  const data = await gqlQuery<{
    tenantIdentityProviders: Array<{
      id: string;
      autoJoinUserType: string;
      autoJoinUserLevel: string;
      domains: string[];
    }>;
  }>(`
    query FindAutoJoinProviders($tenantId: Uuid!) {
      tenantIdentityProviders(
        where: {
          tenantId: { _eq: $tenantId },
          autoJoinEnabled: { _eq: true },
          isActive: { _eq: true },
          deletedAt: { _is_null: true }
        }
        limit: 10
      ) { id autoJoinUserType autoJoinUserLevel domains }
    }
  `, { tenantId });

  const lowerDomain = domain.toLowerCase();
  const match = data.tenantIdentityProviders.find(
    (p) => p.domains.some((d) => d.toLowerCase() === lowerDomain)
  );

  return match
    ? { id: match.id, autoJoinUserType: match.autoJoinUserType, autoJoinUserLevel: match.autoJoinUserLevel }
    : null;
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
  const data = await gqlQuery<{
    insertUsers: { returning: GqlUserRow[] };
  }>(`
    mutation AutoProvisionUser($object: InsertUsersObjectInput!) {
      insertUsers(objects: [$object]) {
        returning { ${USER_GQL_FIELDS} }
      }
    }
  `, {
    object: {
      id,
      tenantId: opts.tenantId,
      email: opts.email,
      name: opts.name,
      userType: opts.userType,
      userLevel: opts.userLevel,
      directoryProviderId: opts.directoryProviderId,
      directorySyncId: opts.directorySyncId ?? null,
    },
  });

  return gqlRowToUser(data.insertUsers.returning[0]!);
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

interface GqlAdminUserRow extends GqlUserRow {
  title: string | null;
  department: string | null;
  locale: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

function gqlRowToAdminUser(row: GqlAdminUserRow): AdminUserView {
  return {
    ...gqlRowToUser(row),
    title: row.title ?? undefined,
    department: row.department ?? undefined,
    locale: row.locale ?? undefined,
    lastLoginAt: row.lastLoginAt ?? undefined,
    createdAt: row.createdAt,
  };
}

const ADMIN_USER_GQL_FIELDS = `${USER_GQL_FIELDS} title department locale lastLoginAt createdAt`;

export async function listUsers(opts: ListUsersOptions): Promise<ListUsersResult> {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  // Build where clause dynamically
  const where: Record<string, unknown> = {
    tenantId: { _eq: opts.tenantId },
    deletedAt: { _is_null: true },
  };

  if (opts.search) {
    const pattern = `%${opts.search}%`;
    where._or = [
      { name: { _ilike: pattern } },
      { email: { _ilike: pattern } },
    ];
  }

  if (opts.userType) {
    where.userType = { _eq: opts.userType };
  }

  if (opts.userLevel) {
    where.userLevel = { _eq: opts.userLevel };
  }

  const data = await gqlQuery<{
    usersAggregate: { _count: number };
    users: GqlAdminUserRow[];
  }>(`
    query ListUsers($where: UsersBoolExp!, $limit: Int!, $offset: Int!, $filterInput: UsersFilterInput) {
      usersAggregate(filter_input: $filterInput) { _count }
      users(
        where: $where, limit: $limit, offset: $offset,
        order_by: [{ createdAt: Desc }]
      ) { ${ADMIN_USER_GQL_FIELDS} }
    }
  `, { where, limit, offset, filterInput: { where } });

  const total = data.usersAggregate._count;
  const users = data.users.map(gqlRowToAdminUser);

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
  const data = await gqlQuery<{
    insertUsers: { returning: GqlAdminUserRow[] };
  }>(`
    mutation CreateUser($object: InsertUsersObjectInput!) {
      insertUsers(objects: [$object]) {
        returning { ${ADMIN_USER_GQL_FIELDS} }
      }
    }
  `, {
    object: {
      id,
      tenantId: opts.tenantId,
      email: opts.email,
      name: opts.name,
      phone: opts.phone ?? null,
      userType: opts.userType,
      userLevel: opts.userLevel,
      title: opts.title ?? null,
      department: opts.department ?? null,
      locale: opts.locale ?? null,
      createdBy: opts.createdBy,
      updatedBy: opts.createdBy,
    },
  });

  return gqlRowToAdminUser(data.insertUsers.returning[0]!);
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
  const now = new Date().toISOString();
  const updateColumns: Record<string, { set: unknown }> = {
    updatedAt: { set: now },
    updatedBy: { set: updatedBy },
  };

  const fieldMap: Record<string, string> = {
    name: "name",
    email: "email",
    phone: "phone",
    userType: "userType",
    userLevel: "userLevel",
    title: "title",
    department: "department",
    locale: "locale",
  };

  let hasChanges = false;
  for (const [key, gqlField] of Object.entries(fieldMap)) {
    const value = fields[key as keyof typeof fields];
    if (value !== undefined) {
      updateColumns[gqlField] = { set: value };
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    return findAdminUserById(userId, tenantId);
  }

  const data = await gqlQuery<{
    updateUsersById: { returning: GqlAdminUserRow[] };
  }>(`
    mutation UpdateUser($keyId: Uuid!, $preCheck: UsersBoolExp, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
      updateUsersById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) {
        returning { ${ADMIN_USER_GQL_FIELDS} }
      }
    }
  `, {
    keyId: userId,
    preCheck: { tenantId: { _eq: tenantId }, deletedAt: { _is_null: true } },
    updateColumns,
  });

  const row = data.updateUsersById.returning[0];
  return row ? gqlRowToAdminUser(row) : null;
}

export async function softDeleteUser(
  userId: string,
  tenantId: string,
  deletedBy: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await gqlQuery<{
    updateUsersById: { affectedRows: number };
  }>(`
    mutation SoftDeleteUser($keyId: Uuid!, $preCheck: UsersBoolExp, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
      updateUsersById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: userId,
    preCheck: { tenantId: { _eq: tenantId }, deletedAt: { _is_null: true } },
    updateColumns: {
      deletedAt: { set: now },
      deletedBy: { set: deletedBy },
      updatedAt: { set: now },
      updatedBy: { set: deletedBy },
    },
  });

  return data.updateUsersById.affectedRows > 0;
}

export async function findAdminUserById(
  userId: string,
  tenantId: string
): Promise<AdminUserView | null> {
  const data = await gqlQuery<{ users: GqlAdminUserRow[] }>(`
    query FindAdminUserById($userId: Uuid!, $tenantId: Uuid!) {
      users(
        where: { id: { _eq: $userId }, tenantId: { _eq: $tenantId }, deletedAt: { _is_null: true } }
        limit: 1
      ) { ${ADMIN_USER_GQL_FIELDS} }
    }
  `, { userId, tenantId });

  const row = data.users[0];
  return row ? gqlRowToAdminUser(row) : null;
}

export interface TenantView {
  id: string;
  name: string;
  national?: string;
  configuration?: Record<string, unknown>;
  createdAt: string;
}

export async function listTenants(): Promise<TenantView[]> {
  const data = await gqlQuery<{
    tenants: Array<{
      id: string;
      name: string;
      national: string | null;
      configuration: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>(`
    query ListTenants {
      tenants(
        where: { deletedAt: { _is_null: true } }
        order_by: [{ name: Asc }]
      ) { id name national configuration createdAt }
    }
  `);

  return data.tenants.map((row) => ({
    id: row.id,
    name: row.name,
    national: row.national ?? undefined,
    configuration: row.configuration ?? undefined,
    createdAt: row.createdAt,
  }));
}

export async function setImpersonatable(
  userId: string,
  tenantId: string,
  value: boolean,
  updatedBy: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await gqlQuery<{
    updateUsersById: { affectedRows: number };
  }>(`
    mutation SetImpersonatable($keyId: Uuid!, $preCheck: UsersBoolExp, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
      updateUsersById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: userId,
    preCheck: { tenantId: { _eq: tenantId }, deletedAt: { _is_null: true } },
    updateColumns: {
      isImpersonatable: { set: value },
      updatedAt: { set: now },
      updatedBy: { set: updatedBy },
    },
  });

  return data.updateUsersById.affectedRows > 0;
}

export async function setCanImpersonate(
  userId: string,
  tenantId: string,
  value: boolean,
  updatedBy: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const data = await gqlQuery<{
    updateUsersById: { affectedRows: number };
  }>(`
    mutation SetCanImpersonate($keyId: Uuid!, $preCheck: UsersBoolExp, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
      updateUsersById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: userId,
    preCheck: { tenantId: { _eq: tenantId }, deletedAt: { _is_null: true } },
    updateColumns: {
      canImpersonate: { set: value },
      updatedAt: { set: now },
      updatedBy: { set: updatedBy },
    },
  });

  return data.updateUsersById.affectedRows > 0;
}

export async function findAdminUserByIdAnyTenant(
  userId: string
): Promise<AdminUserView | null> {
  const data = await gqlQuery<{ users: GqlAdminUserRow[] }>(`
    query FindAdminUserByIdAnyTenant($userId: Uuid!) {
      users(
        where: { id: { _eq: $userId }, deletedAt: { _is_null: true } }
        limit: 1
      ) { ${ADMIN_USER_GQL_FIELDS} }
    }
  `, { userId });

  const row = data.users[0];
  return row ? gqlRowToAdminUser(row) : null;
}
