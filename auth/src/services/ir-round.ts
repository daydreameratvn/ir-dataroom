import { query } from "../db/pool.ts";

// ── Row type (snake_case from DB) ──

interface RoundRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  configuration: Record<string, unknown>;
  target_raise: string | null;
  currency: string | null;
  started_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

// ── Domain type (camelCase) ──

export interface Round {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  description: string | null;
  configuration: Record<string, unknown>;
  targetRaise: string | null;
  currency: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

// ── Row to domain mapping ──

function rowToRound(row: RoundRow): Round {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    description: row.description,
    configuration: row.configuration,
    targetRaise: row.target_raise,
    currency: row.currency,
    startedAt: row.started_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

// ── List options ──

export interface ListRoundsOptions {
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ListRoundsResult {
  data: Round[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── CRUD functions ──

const ROUND_COLUMNS = `id, tenant_id, name, slug, status, description, configuration,
  target_raise, currency, started_at, closed_at, created_at, created_by, updated_at`;

export async function listRounds(
  tenantId: string,
  opts?: ListRoundsOptions
): Promise<ListRoundsResult> {
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["tenant_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [tenantId];
  let paramIdx = 2;

  if (opts?.status) {
    conditions.push(`status = $${paramIdx}`);
    params.push(opts.status);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ir_rounds WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<RoundRow>(
    `SELECT ${ROUND_COLUMNS}
     FROM ir_rounds
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    data: dataResult.rows.map(rowToRound),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getRoundById(id: string): Promise<Round | null> {
  const result = await query<RoundRow>(
    `SELECT ${ROUND_COLUMNS}
     FROM ir_rounds
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  const row = result.rows[0];
  return row ? rowToRound(row) : null;
}

export async function getRoundBySlug(
  tenantId: string,
  slug: string
): Promise<Round | null> {
  const result = await query<RoundRow>(
    `SELECT ${ROUND_COLUMNS}
     FROM ir_rounds
     WHERE tenant_id = $1 AND slug = $2 AND deleted_at IS NULL`,
    [tenantId, slug]
  );

  const row = result.rows[0];
  return row ? rowToRound(row) : null;
}

export interface CreateRoundData {
  name: string;
  slug: string;
  status?: string;
  description?: string;
  configuration?: Record<string, unknown>;
  targetRaise?: number;
  currency?: string;
  startedAt?: string;
  closedAt?: string;
}

export async function createRound(
  tenantId: string,
  data: CreateRoundData,
  userId: string
): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO ir_rounds (tenant_id, name, slug, status, description, configuration, target_raise, currency, started_at, closed_at, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     RETURNING id`,
    [
      tenantId,
      data.name,
      data.slug,
      data.status ?? "draft",
      data.description ?? null,
      JSON.stringify(data.configuration ?? {}),
      data.targetRaise ?? null,
      data.currency ?? "USD",
      data.startedAt ?? null,
      data.closedAt ?? null,
      userId,
    ]
  );

  return { id: result.rows[0]!.id };
}

export interface UpdateRoundData {
  name?: string;
  slug?: string;
  status?: string;
  description?: string;
  configuration?: Record<string, unknown>;
  targetRaise?: number;
  currency?: string;
  startedAt?: string;
  closedAt?: string;
}

export async function updateRound(
  id: string,
  data: UpdateRoundData,
  userId: string
): Promise<Round | null> {
  const setClauses: string[] = ["updated_at = now()", "updated_by = $2"];
  const params: unknown[] = [id, userId];
  let paramIdx = 3;

  const fieldMap: Record<string, string> = {
    name: "name",
    slug: "slug",
    status: "status",
    description: "description",
    targetRaise: "target_raise",
    currency: "currency",
    startedAt: "started_at",
    closedAt: "closed_at",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = data[key as keyof UpdateRoundData];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  if (data.configuration !== undefined) {
    setClauses.push(`configuration = $${paramIdx}`);
    params.push(JSON.stringify(data.configuration));
    paramIdx++;
  }

  if (setClauses.length === 2) {
    return getRoundById(id);
  }

  const result = await query<RoundRow>(
    `UPDATE ir_rounds
     SET ${setClauses.join(", ")}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${ROUND_COLUMNS}`,
    params
  );

  const row = result.rows[0];
  return row ? rowToRound(row) : null;
}

export async function softDeleteRound(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE ir_rounds
     SET deleted_at = now(), deleted_by = $2, updated_at = now(), updated_by = $2
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}
