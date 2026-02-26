import { createHash } from "crypto";
import { query } from "../db/pool.ts";

// ── Row type (snake_case from DB) ──

export interface ErrorReportRow {
  id: string;
  tenant_id: string | null;
  source: string;
  status: string;
  severity: string;
  message: string;
  stack_trace: string | null;
  component_stack: string | null;
  url: string | null;
  endpoint: string | null;
  user_id: string | null;
  impersonator_id: string | null;
  user_agent: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  fix_pr_url: string | null;
  fix_pr_number: number | null;
  fix_branch: string | null;
  created_at: string;
}

// ── Domain type (camelCase) ──

export interface ErrorReport {
  id: string;
  tenantId: string | null;
  source: string;
  status: string;
  severity: string;
  message: string;
  stackTrace: string | null;
  componentStack: string | null;
  url: string | null;
  endpoint: string | null;
  userId: string | null;
  impersonatorId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  fixPrUrl: string | null;
  fixPrNumber: number | null;
  fixBranch: string | null;
  createdAt: string;
}

// ── Upsert input ──

export interface UpsertErrorReportInput {
  tenantId?: string;
  source: string;
  severity?: string;
  message: string;
  stackTrace?: string;
  componentStack?: string;
  url?: string;
  endpoint?: string;
  userId?: string;
  impersonatorId?: string;
  userAgent?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  fingerprint: string;
  createdBy?: string;
}

// ── List filters ──

export interface ListErrorReportsParams {
  tenantId?: string;
  source?: string;
  status?: string;
  severity?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

// ── Fingerprint generation ──

export function generateFingerprint(source: string, message: string, stackTrace?: string): string {
  const firstFrame = stackTrace?.split("\n").find((line) => line.trim().startsWith("at "))?.trim() || "";
  const content = `${source}:${message}:${firstFrame}`;
  return createHash("sha256").update(content).digest("hex").slice(0, 32);
}

// ── Row to domain mapping ──

function rowToErrorReport(row: ErrorReportRow): ErrorReport {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    source: row.source,
    status: row.status,
    severity: row.severity,
    message: row.message,
    stackTrace: row.stack_trace,
    componentStack: row.component_stack,
    url: row.url,
    endpoint: row.endpoint,
    userId: row.user_id,
    impersonatorId: row.impersonator_id,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    metadata: row.metadata,
    fingerprint: row.fingerprint,
    occurrenceCount: row.occurrence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    fixPrUrl: row.fix_pr_url,
    fixPrNumber: row.fix_pr_number,
    fixBranch: row.fix_branch,
    createdAt: row.created_at,
  };
}

// ── Upsert (INSERT ... ON CONFLICT) ──

export async function upsertErrorReport(
  input: UpsertErrorReportInput
): Promise<{ id: string; isNew: boolean }> {
  const result = await query<{ id: string; is_new: boolean }>(
    `INSERT INTO error_reports (tenant_id, source, severity, message, stack_trace, component_stack, url, endpoint, user_id, impersonator_id, user_agent, ip_address, metadata, fingerprint, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
     ON CONFLICT (fingerprint) WHERE deleted_at IS NULL AND status NOT IN ('resolved', 'ignored', 'wont_fix')
     DO UPDATE SET
       occurrence_count = error_reports.occurrence_count + 1,
       last_seen_at = now(),
       updated_at = now(),
       updated_by = EXCLUDED.updated_by
     RETURNING id, (xmax = 0) AS is_new`,
    [
      input.tenantId ?? null,
      input.source,
      input.severity ?? "error",
      input.message,
      input.stackTrace ?? null,
      input.componentStack ?? null,
      input.url ?? null,
      input.endpoint ?? null,
      input.userId ?? null,
      input.impersonatorId ?? null,
      input.userAgent ?? null,
      input.ipAddress ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.fingerprint,
      input.createdBy ?? "system",
    ]
  );

  const row = result.rows[0]!;
  return { id: row.id, isNew: row.is_new };
}

// ── List with pagination and filters ──

const VALID_SORT_COLUMNS: Record<string, string> = {
  last_seen_at: "last_seen_at",
  first_seen_at: "first_seen_at",
  occurrence_count: "occurrence_count",
  severity: "severity",
  created_at: "created_at",
};

export async function listErrorReports(
  params: ListErrorReportsParams
): Promise<{ errors: ErrorReport[]; total: number; page: number; limit: number }> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;
  const sortColumn = VALID_SORT_COLUMNS[params.sortBy ?? "last_seen_at"] ?? "last_seen_at";
  const sortOrder = params.sortOrder === "asc" ? "ASC" : "DESC";

  const conditions: string[] = ["deleted_at IS NULL"];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (params.tenantId) {
    conditions.push(`tenant_id = $${paramIdx++}`);
    values.push(params.tenantId);
  }

  if (params.source) {
    conditions.push(`source = $${paramIdx++}`);
    values.push(params.source);
  }

  if (params.status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(params.status);
  }

  if (params.severity) {
    conditions.push(`severity = $${paramIdx++}`);
    values.push(params.severity);
  }

  if (params.search) {
    conditions.push(`message ILIKE $${paramIdx++}`);
    values.push(`%${params.search}%`);
  }

  const where = conditions.join(" AND ");

  // Count query
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM error_reports WHERE ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  // Data query
  const dataResult = await query<ErrorReportRow>(
    `SELECT id, tenant_id, source, status, severity, message, stack_trace, component_stack,
            url, endpoint, user_id, impersonator_id, user_agent, ip_address, metadata,
            fingerprint, occurrence_count, first_seen_at, last_seen_at,
            fix_pr_url, fix_pr_number, fix_branch, created_at
     FROM error_reports
     WHERE ${where}
     ORDER BY ${sortColumn} ${sortOrder}
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...values, limit, offset]
  );

  return {
    errors: dataResult.rows.map(rowToErrorReport),
    total,
    page,
    limit,
  };
}

// ── Get single error by ID ──

export async function getErrorReport(id: string): Promise<ErrorReport | null> {
  const result = await query<ErrorReportRow>(
    `SELECT id, tenant_id, source, status, severity, message, stack_trace, component_stack,
            url, endpoint, user_id, impersonator_id, user_agent, ip_address, metadata,
            fingerprint, occurrence_count, first_seen_at, last_seen_at,
            fix_pr_url, fix_pr_number, fix_branch, created_at
     FROM error_reports
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  const row = result.rows[0];
  return row ? rowToErrorReport(row) : null;
}

// ── Update error status ──

const VALID_STATUSES = ["new", "acknowledged", "auto_fix_pending", "auto_fix_pr_created", "resolved", "ignored", "wont_fix"];

export async function updateErrorStatus(
  id: string,
  status: string,
  updatedBy: string,
  extra?: { fixPrUrl?: string; fixPrNumber?: number; fixBranch?: string }
): Promise<ErrorReport | null> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  const result = await query<ErrorReportRow>(
    `UPDATE error_reports
     SET status = $1,
         fix_pr_url = COALESCE($2, fix_pr_url),
         fix_pr_number = COALESCE($3, fix_pr_number),
         fix_branch = COALESCE($4, fix_branch),
         updated_at = now(),
         updated_by = $5
     WHERE id = $6 AND deleted_at IS NULL
     RETURNING id, tenant_id, source, status, severity, message, stack_trace, component_stack,
               url, endpoint, user_id, impersonator_id, user_agent, ip_address, metadata,
               fingerprint, occurrence_count, first_seen_at, last_seen_at,
               fix_pr_url, fix_pr_number, fix_branch, created_at`,
    [
      status,
      extra?.fixPrUrl ?? null,
      extra?.fixPrNumber ?? null,
      extra?.fixBranch ?? null,
      updatedBy,
      id,
    ]
  );

  const row = result.rows[0];
  return row ? rowToErrorReport(row) : null;
}
