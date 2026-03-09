import { query } from "../db/pool.ts";

// ── Row types (snake_case from DB) ──

interface InvestorRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  firm: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

interface InvestorRoundRow {
  id: string;
  tenant_id: string;
  investor_id: string;
  round_id: string;
  status: string;
  nda_required: boolean;
  nda_mode: string;
  nda_template_id: string | null;
  invited_at: string | null;
  nda_accepted_at: string | null;
  nda_ip_address: string | null;
  nda_user_agent: string | null;
  last_access_at: string | null;
  access_count: number;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

interface InvestorRoundWithInvestorRow extends InvestorRoundRow {
  investor_name: string;
  investor_email: string;
  investor_firm: string | null;
}

interface InvestorRoundWithRoundRow extends InvestorRoundRow {
  round_name: string;
  round_slug: string;
  round_status: string;
}

// ── Domain types (camelCase) ──

export interface Investor {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  firm: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  userId: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

export interface InvestorRound {
  id: string;
  tenantId: string;
  investorId: string;
  roundId: string;
  status: string;
  ndaRequired: boolean;
  ndaMode: string;
  ndaTemplateId: string | null;
  invitedAt: string | null;
  ndaAcceptedAt: string | null;
  ndaIpAddress: string | null;
  ndaUserAgent: string | null;
  lastAccessAt: string | null;
  accessCount: number;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

export interface InvestorRoundWithInvestor extends InvestorRound {
  investorName: string;
  investorEmail: string;
  investorFirm: string | null;
}

export interface InvestorRoundWithRound extends InvestorRound {
  roundName: string;
  roundSlug: string;
  roundStatus: string;
}

// ── Row to domain mapping ──

function rowToInvestor(row: InvestorRow): Investor {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name,
    firm: row.firm,
    title: row.title,
    phone: row.phone,
    notes: row.notes,
    userId: row.user_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function rowToInvestorRound(row: InvestorRoundRow): InvestorRound {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    investorId: row.investor_id,
    roundId: row.round_id,
    status: row.status,
    ndaRequired: row.nda_required,
    ndaMode: row.nda_mode,
    ndaTemplateId: row.nda_template_id,
    invitedAt: row.invited_at,
    ndaAcceptedAt: row.nda_accepted_at,
    ndaIpAddress: row.nda_ip_address,
    ndaUserAgent: row.nda_user_agent,
    lastAccessAt: row.last_access_at,
    accessCount: row.access_count,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function rowToInvestorRoundWithInvestor(
  row: InvestorRoundWithInvestorRow
): InvestorRoundWithInvestor {
  return {
    ...rowToInvestorRound(row),
    investorName: row.investor_name,
    investorEmail: row.investor_email,
    investorFirm: row.investor_firm,
  };
}

function rowToInvestorRoundWithRound(
  row: InvestorRoundWithRoundRow
): InvestorRoundWithRound {
  return {
    ...rowToInvestorRound(row),
    roundName: row.round_name,
    roundSlug: row.round_slug,
    roundStatus: row.round_status,
  };
}

// ── List options ──

export interface ListInvestorsOptions {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ListInvestorsResult {
  data: Investor[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListInvestorRoundsOptions {
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ListInvestorRoundsResult {
  data: InvestorRoundWithInvestor[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Column constants ──

const INVESTOR_COLUMNS = `id, tenant_id, email, name, firm, title, phone, notes, user_id,
  created_at, created_by, updated_at`;

const INVESTOR_ROUND_COLUMNS = `id, tenant_id, investor_id, round_id, status,
  nda_required, nda_mode, nda_template_id,
  invited_at, nda_accepted_at, nda_ip_address, nda_user_agent,
  last_access_at, access_count, created_at, created_by, updated_at`;

// ── Investor CRUD ──

export async function listInvestors(
  tenantId: string,
  opts?: ListInvestorsOptions
): Promise<ListInvestorsResult> {
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["tenant_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (opts?.search) {
    conditions.push(
      `(name ILIKE $${paramIdx} OR email ILIKE $${paramIdx} OR firm ILIKE $${paramIdx})`
    );
    params.push(`%${opts.search}%`);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ir_investors WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<InvestorRow>(
    `SELECT ${INVESTOR_COLUMNS}
     FROM ir_investors
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    data: dataResult.rows.map(rowToInvestor),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getInvestorById(id: string): Promise<Investor | null> {
  const result = await query<InvestorRow>(
    `SELECT ${INVESTOR_COLUMNS}
     FROM ir_investors
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  const row = result.rows[0];
  return row ? rowToInvestor(row) : null;
}

export async function getInvestorByEmail(
  tenantId: string,
  email: string
): Promise<Investor | null> {
  const result = await query<InvestorRow>(
    `SELECT ${INVESTOR_COLUMNS}
     FROM ir_investors
     WHERE tenant_id = $1 AND email = $2 AND deleted_at IS NULL`,
    [tenantId, email]
  );

  const row = result.rows[0];
  return row ? rowToInvestor(row) : null;
}

export interface CreateInvestorData {
  email: string;
  name: string;
  firm?: string;
  title?: string;
  phone?: string;
  notes?: string;
}

export async function createInvestor(
  tenantId: string,
  data: CreateInvestorData,
  userId: string
): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO ir_investors (tenant_id, email, name, firm, title, phone, notes, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     RETURNING id`,
    [
      tenantId,
      data.email,
      data.name,
      data.firm ?? null,
      data.title ?? null,
      data.phone ?? null,
      data.notes ?? null,
      userId,
    ]
  );

  return { id: result.rows[0]!.id };
}

export interface UpdateInvestorData {
  email?: string;
  name?: string;
  firm?: string;
  title?: string;
  phone?: string;
  notes?: string;
}

export async function updateInvestor(
  id: string,
  data: UpdateInvestorData,
  userId: string,
  tenantId?: string
): Promise<Investor | null> {
  const setClauses: string[] = ["updated_at = now()", "updated_by = $2"];
  const params: unknown[] = [id, userId];
  let paramIdx = 3;

  const fieldMap: Record<string, string> = {
    email: "email",
    name: "name",
    firm: "firm",
    title: "title",
    phone: "phone",
    notes: "notes",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = data[key as keyof UpdateInvestorData];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 2) {
    return getInvestorById(id);
  }

  // Scope to tenant if provided to prevent cross-tenant access
  const tenantClause = tenantId ? ` AND tenant_id = $${paramIdx}` : "";
  if (tenantId) params.push(tenantId);

  const result = await query<InvestorRow>(
    `UPDATE ir_investors
     SET ${setClauses.join(", ")}
     WHERE id = $1 AND deleted_at IS NULL${tenantClause}
     RETURNING ${INVESTOR_COLUMNS}`,
    params
  );

  const row = result.rows[0];
  return row ? rowToInvestor(row) : null;
}

export async function softDeleteInvestor(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE ir_investors
     SET deleted_at = now(), deleted_by = $2, updated_at = now(), updated_by = $2
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

// ── Investor Round management ──

export async function addInvestorToRound(
  tenantId: string,
  investorId: string,
  roundId: string,
  userId: string,
  opts?: { ndaMode?: "digital" | "offline" }
): Promise<{ id: string }> {
  const ndaMode = opts?.ndaMode ?? "digital";
  const isOffline = ndaMode === "offline";
  const status = isOffline ? "nda_signed" : "invited";
  const ndaRequired = !isOffline;

  const result = await query<{ id: string }>(
    `INSERT INTO ir_investor_rounds (tenant_id, investor_id, round_id, status, nda_required, nda_mode, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING id`,
    [tenantId, investorId, roundId, status, ndaRequired, ndaMode, userId]
  );

  return { id: result.rows[0]!.id };
}

/** Auto-promote investor from nda_signed to viewing on first file access */
export async function promoteToViewingIfNeeded(
  investorRoundId: string
): Promise<void> {
  await query(
    `UPDATE ir_investor_rounds
     SET status = 'viewing', updated_at = now()
     WHERE id = $1 AND status = 'nda_signed' AND deleted_at IS NULL`,
    [investorRoundId]
  );
}

export async function updateInvestorRoundStatus(
  id: string,
  status: string,
  userId: string
): Promise<InvestorRound | null> {
  const result = await query<InvestorRoundRow>(
    `UPDATE ir_investor_rounds
     SET status = $2, updated_at = now(), updated_by = $3
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${INVESTOR_ROUND_COLUMNS}`,
    [id, status, userId]
  );

  const row = result.rows[0];
  return row ? rowToInvestorRound(row) : null;
}

export async function removeInvestorFromRound(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE ir_investor_rounds
     SET deleted_at = now(), deleted_by = $2, updated_at = now(), updated_by = $2
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

export async function listInvestorRounds(
  roundId: string,
  opts?: ListInvestorRoundsOptions
): Promise<ListInvestorRoundsResult> {
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [
    "ir.round_id = $1",
    "ir.deleted_at IS NULL",
  ];
  const params: unknown[] = [roundId];
  let paramIdx = 2;

  if (opts?.status) {
    conditions.push(`ir.status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM ir_investor_rounds ir
     WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<InvestorRoundWithInvestorRow>(
    `SELECT ir.id, ir.tenant_id, ir.investor_id, ir.round_id, ir.status,
            ir.nda_required, ir.nda_mode, ir.nda_template_id,
            ir.invited_at, ir.nda_accepted_at, ir.nda_ip_address, ir.nda_user_agent,
            ir.last_access_at, ir.access_count, ir.created_at, ir.created_by, ir.updated_at,
            inv.name AS investor_name, inv.email AS investor_email, inv.firm AS investor_firm
     FROM ir_investor_rounds ir
     JOIN ir_investors inv ON inv.id = ir.investor_id AND inv.deleted_at IS NULL
     WHERE ${where}
     ORDER BY ir.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    data: dataResult.rows.map(rowToInvestorRoundWithInvestor),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function listRoundsForInvestor(
  investorId: string
): Promise<InvestorRoundWithRound[]> {
  const result = await query<InvestorRoundWithRoundRow>(
    `SELECT ir.id, ir.tenant_id, ir.investor_id, ir.round_id, ir.status,
            ir.nda_required, ir.nda_mode, ir.nda_template_id,
            ir.invited_at, ir.nda_accepted_at, ir.nda_ip_address, ir.nda_user_agent,
            ir.last_access_at, ir.access_count, ir.created_at, ir.created_by, ir.updated_at,
            r.name AS round_name, r.slug AS round_slug, r.status AS round_status
     FROM ir_investor_rounds ir
     JOIN ir_rounds r ON r.id = ir.round_id AND r.deleted_at IS NULL
     WHERE ir.investor_id = $1 AND ir.deleted_at IS NULL
     ORDER BY ir.created_at DESC`,
    [investorId]
  );

  return result.rows.map(rowToInvestorRoundWithRound);
}

export async function getInvestorRound(
  investorId: string,
  roundId: string
): Promise<InvestorRoundWithRound | null> {
  const result = await query<InvestorRoundWithRoundRow>(
    `SELECT ir.id, ir.tenant_id, ir.investor_id, ir.round_id, ir.status,
            ir.nda_required, ir.nda_mode, ir.nda_template_id,
            ir.invited_at, ir.nda_accepted_at, ir.nda_ip_address, ir.nda_user_agent,
            ir.last_access_at, ir.access_count, ir.created_at, ir.created_by, ir.updated_at,
            r.name AS round_name, r.slug AS round_slug, r.status AS round_status
     FROM ir_investor_rounds ir
     JOIN ir_rounds r ON r.id = ir.round_id AND r.deleted_at IS NULL
     WHERE ir.investor_id = $1 AND ir.round_id = $2 AND ir.deleted_at IS NULL`,
    [investorId, roundId]
  );

  const row = result.rows[0];
  return row ? rowToInvestorRoundWithRound(row) : null;
}

export async function recordInvestorAccess(
  investorRoundId: string
): Promise<void> {
  await query(
    `UPDATE ir_investor_rounds
     SET access_count = access_count + 1,
         last_access_at = now(),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [investorRoundId]
  );
}
