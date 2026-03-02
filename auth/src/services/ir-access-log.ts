import { query } from "../db/pool.ts";

// ── Row types (snake_case from DB) ──

interface AccessLogRow {
  id: string;
  tenant_id: string;
  investor_id: string;
  round_id: string;
  document_id: string | null;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AccessLogWithInvestorRow extends AccessLogRow {
  investor_name: string;
  investor_email: string;
}

// ── Domain types (camelCase) ──

export interface AccessLog {
  id: string;
  tenantId: string;
  investorId: string;
  roundId: string;
  documentId: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  durationSeconds: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AccessLogWithInvestor extends AccessLog {
  investorName: string;
  investorEmail: string;
}

export interface RoundAnalytics {
  totalViews: number;
  uniqueViewers: number;
  viewsPerDocument: { documentId: string; documentName: string; views: number }[];
  viewsOverTime: { date: string; views: number }[];
  topInvestors: { investorId: string; investorName: string; investorEmail: string; totalActions: number; totalDuration: number }[];
}

export interface OverallStats {
  totalRounds: number;
  activeRounds: number;
  totalInvestors: number;
  totalDocuments: number;
  totalViews: number;
  uniqueViewers: number;
}

// ── Row to domain mapping ──

function rowToAccessLog(row: AccessLogRow): AccessLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    investorId: row.investor_id,
    roundId: row.round_id,
    documentId: row.document_id,
    action: row.action,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    durationSeconds: row.duration_seconds,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function rowToAccessLogWithInvestor(
  row: AccessLogWithInvestorRow
): AccessLogWithInvestor {
  return {
    ...rowToAccessLog(row),
    investorName: row.investor_name,
    investorEmail: row.investor_email,
  };
}

// ── List options ──

export interface ListAccessLogsOptions {
  investorId?: string;
  documentId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}

export interface ListAccessLogsResult {
  data: AccessLogWithInvestor[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Log input ──

export interface LogAccessData {
  investorId: string;
  roundId: string;
  documentId?: string;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}

// ── Functions ──

/** Update the duration of an existing access log entry (heartbeat tracking) */
export async function updateAccessLogDuration(
  accessLogId: string,
  durationSeconds: number
): Promise<void> {
  await query(
    `UPDATE ir_access_logs
     SET duration_seconds = $2, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL`,
    [accessLogId, durationSeconds]
  );
}

/** Export all access logs for a round as CSV string */
export async function exportAccessLogsCSV(
  roundId: string
): Promise<string> {
  const result = await query<{
    created_at: string;
    investor_email: string;
    investor_name: string;
    file_name: string | null;
    file_category: string | null;
    action: string;
    duration_seconds: number | null;
    ip_address: string | null;
  }>(
    `SELECT al.created_at, inv.email AS investor_email, inv.name AS investor_name,
            d.name AS file_name, d.category AS file_category,
            al.action, al.duration_seconds, al.ip_address
     FROM ir_access_logs al
     JOIN ir_investors inv ON inv.id = al.investor_id
     LEFT JOIN ir_documents d ON d.id = al.document_id
     WHERE al.round_id = $1 AND al.deleted_at IS NULL
     ORDER BY al.created_at DESC`,
    [roundId]
  );

  const header = "Date,Investor Email,Investor Name,File Name,Category,Action,Duration (seconds),IP Address";
  const rows = result.rows.map((row) => {
    const escapeCsv = (val: string | null | undefined) => {
      if (val == null) return "";
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };
    return [
      row.created_at,
      escapeCsv(row.investor_email),
      escapeCsv(row.investor_name),
      escapeCsv(row.file_name),
      escapeCsv(row.file_category),
      row.action,
      row.duration_seconds ?? "",
      row.ip_address ?? "",
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export async function logAccess(
  tenantId: string,
  data: LogAccessData
): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO ir_access_logs (tenant_id, investor_id, round_id, document_id, action, ip_address, user_agent, duration_seconds, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      tenantId,
      data.investorId,
      data.roundId,
      data.documentId ?? null,
      data.action,
      data.ipAddress ?? null,
      data.userAgent ?? null,
      data.durationSeconds ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ]
  );

  return { id: result.rows[0]!.id };
}

export async function listAccessLogs(
  roundId: string,
  opts?: ListAccessLogsOptions
): Promise<ListAccessLogsResult> {
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 200);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [
    "al.round_id = $1",
    "al.deleted_at IS NULL",
  ];
  const params: unknown[] = [roundId];
  let paramIdx = 2;

  if (opts?.investorId) {
    conditions.push(`al.investor_id = $${paramIdx}`);
    params.push(opts.investorId);
    paramIdx++;
  }

  if (opts?.documentId) {
    conditions.push(`al.document_id = $${paramIdx}`);
    params.push(opts.documentId);
    paramIdx++;
  }

  if (opts?.action) {
    conditions.push(`al.action = $${paramIdx}`);
    params.push(opts.action);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM ir_access_logs al
     WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<AccessLogWithInvestorRow>(
    `SELECT al.id, al.tenant_id, al.investor_id, al.round_id, al.document_id,
            al.action, al.ip_address, al.user_agent, al.duration_seconds, al.metadata,
            al.created_at,
            inv.name AS investor_name, inv.email AS investor_email
     FROM ir_access_logs al
     JOIN ir_investors inv ON inv.id = al.investor_id
     WHERE ${where}
     ORDER BY al.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    data: dataResult.rows.map(rowToAccessLogWithInvestor),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getRoundAnalytics(
  roundId: string
): Promise<RoundAnalytics> {
  // Total views
  const totalResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM ir_access_logs
     WHERE round_id = $1 AND deleted_at IS NULL`,
    [roundId]
  );
  const totalViews = parseInt(totalResult.rows[0]!.count, 10);

  // Unique viewers
  const uniqueResult = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT investor_id) AS count
     FROM ir_access_logs
     WHERE round_id = $1 AND deleted_at IS NULL`,
    [roundId]
  );
  const uniqueViewers = parseInt(uniqueResult.rows[0]!.count, 10);

  // Views per document
  const docsResult = await query<{
    document_id: string;
    document_name: string;
    views: string;
  }>(
    `SELECT al.document_id, d.name AS document_name, COUNT(*) AS views
     FROM ir_access_logs al
     JOIN ir_documents d ON d.id = al.document_id AND d.deleted_at IS NULL
     WHERE al.round_id = $1 AND al.document_id IS NOT NULL AND al.deleted_at IS NULL
     GROUP BY al.document_id, d.name
     ORDER BY views DESC`,
    [roundId]
  );
  const viewsPerDocument = docsResult.rows.map((row) => ({
    documentId: row.document_id,
    documentName: row.document_name,
    views: parseInt(row.views, 10),
  }));

  // Views over time (last 30 days, by day)
  const timeResult = await query<{ date: string; views: string }>(
    `SELECT DATE(created_at) AS date, COUNT(*) AS views
     FROM ir_access_logs
     WHERE round_id = $1 AND deleted_at IS NULL
       AND created_at >= now() - INTERVAL '30 days'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [roundId]
  );
  const viewsOverTime = timeResult.rows.map((row) => ({
    date: row.date,
    views: parseInt(row.views, 10),
  }));

  // Top investors by engagement
  const investorResult = await query<{
    investor_id: string;
    investor_name: string;
    investor_email: string;
    total_actions: string;
    total_duration: string;
  }>(
    `SELECT al.investor_id,
            inv.name AS investor_name,
            inv.email AS investor_email,
            COUNT(*) AS total_actions,
            COALESCE(SUM(al.duration_seconds), 0) AS total_duration
     FROM ir_access_logs al
     JOIN ir_investors inv ON inv.id = al.investor_id
     WHERE al.round_id = $1 AND al.deleted_at IS NULL
     GROUP BY al.investor_id, inv.name, inv.email
     ORDER BY total_actions DESC
     LIMIT 20`,
    [roundId]
  );
  const topInvestors = investorResult.rows.map((row) => ({
    investorId: row.investor_id,
    investorName: row.investor_name,
    investorEmail: row.investor_email,
    totalActions: parseInt(row.total_actions, 10),
    totalDuration: parseInt(row.total_duration, 10),
  }));

  return {
    totalViews,
    uniqueViewers,
    viewsPerDocument,
    viewsOverTime,
    topInvestors,
  };
}

// ── Engagement signals ──

export interface InvestorEngagement {
  investorId: string;
  investorEmail: string;
  investorName: string;
  investorFirm: string | null;
  roundId: string;
  status: string;
  ndaAcceptedAt: string | null;
  ndaRequired: boolean;
  invitedAt: string | null;
  lastActiveAt: string | null;
  totalViews: number;
  totalDownloads: number;
  uniqueFilesViewed: number;
  totalTimeSpent: number;
}

/**
 * Get engagement data for all investors in a round.
 * Aggregates access log data to compute views, downloads, time spent, last active.
 */
export async function getInvestorEngagement(
  roundId: string
): Promise<InvestorEngagement[]> {
  const result = await query<{
    investor_id: string;
    investor_email: string;
    investor_name: string;
    investor_firm: string | null;
    round_id: string;
    status: string;
    nda_accepted_at: string | null;
    nda_required: boolean;
    invited_at: string | null;
    last_active_at: string | null;
    total_views: string;
    total_downloads: string;
    unique_files_viewed: string;
    total_time_spent: string;
  }>(
    `SELECT
       inv.id AS investor_id,
       inv.email AS investor_email,
       inv.name AS investor_name,
       inv.firm AS investor_firm,
       ir.round_id,
       ir.status,
       ir.nda_accepted_at,
       ir.nda_required,
       ir.invited_at,
       ir.last_access_at AS last_active_at,
       COALESCE(agg.total_views, 0) AS total_views,
       COALESCE(agg.total_downloads, 0) AS total_downloads,
       COALESCE(agg.unique_files_viewed, 0) AS unique_files_viewed,
       COALESCE(agg.total_time_spent, 0) AS total_time_spent
     FROM ir_investor_rounds ir
     JOIN ir_investors inv ON inv.id = ir.investor_id AND inv.deleted_at IS NULL
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE al.action = 'view') AS total_views,
         COUNT(*) FILTER (WHERE al.action = 'download') AS total_downloads,
         COUNT(DISTINCT al.document_id) FILTER (WHERE al.action = 'view') AS unique_files_viewed,
         COALESCE(SUM(al.duration_seconds) FILTER (WHERE al.action = 'view'), 0) AS total_time_spent
       FROM ir_access_logs al
       WHERE al.investor_id = inv.id
         AND al.round_id = ir.round_id
         AND al.deleted_at IS NULL
     ) agg ON true
     WHERE ir.round_id = $1 AND ir.deleted_at IS NULL
     ORDER BY ir.created_at DESC`,
    [roundId]
  );

  return result.rows.map((row) => ({
    investorId: row.investor_id,
    investorEmail: row.investor_email,
    investorName: row.investor_name,
    investorFirm: row.investor_firm,
    roundId: row.round_id,
    status: row.status,
    ndaAcceptedAt: row.nda_accepted_at,
    ndaRequired: row.nda_required,
    invitedAt: row.invited_at,
    lastActiveAt: row.last_active_at,
    totalViews: parseInt(row.total_views, 10),
    totalDownloads: parseInt(row.total_downloads, 10),
    uniqueFilesViewed: parseInt(row.unique_files_viewed, 10),
    totalTimeSpent: parseInt(row.total_time_spent, 10),
  }));
}

export async function getOverallStats(
  tenantId: string
): Promise<OverallStats> {
  // Total rounds
  const roundsResult = await query<{ total: string; active: string }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'active') AS active
     FROM ir_rounds
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const totalRounds = parseInt(roundsResult.rows[0]!.total, 10);
  const activeRounds = parseInt(roundsResult.rows[0]!.active, 10);

  // Total investors
  const investorsResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM ir_investors
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const totalInvestors = parseInt(investorsResult.rows[0]!.count, 10);

  // Total documents
  const docsResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM ir_documents
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const totalDocuments = parseInt(docsResult.rows[0]!.count, 10);

  // Total views and unique viewers
  const viewsResult = await query<{ total_views: string; unique_viewers: string }>(
    `SELECT
       COUNT(*) AS total_views,
       COUNT(DISTINCT investor_id) AS unique_viewers
     FROM ir_access_logs
     WHERE tenant_id = $1 AND deleted_at IS NULL`,
    [tenantId]
  );
  const totalViews = parseInt(viewsResult.rows[0]!.total_views, 10);
  const uniqueViewers = parseInt(viewsResult.rows[0]!.unique_viewers, 10);

  return {
    totalRounds,
    activeRounds,
    totalInvestors,
    totalDocuments,
    totalViews,
    uniqueViewers,
  };
}
