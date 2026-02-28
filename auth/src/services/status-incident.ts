import { query } from "../db/pool.ts";

// ── Row types (snake_case from DB) ──

interface StatusIncidentRow {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  affected_services: string[];
  started_at: string;
  resolved_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface StatusIncidentUpdateRow {
  id: string;
  incident_id: string;
  status: string;
  message: string;
  created_at: string;
  created_by: string | null;
}

// ── Domain types (camelCase) ──

export interface StatusIncident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  affectedServices: string[];
  startedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  status: string;
  message: string;
  createdAt: string;
  createdBy: string | null;
}

export interface StatusIncidentWithUpdates extends StatusIncident {
  updates: IncidentUpdate[];
}

// ── Input types ──

export interface CreateIncidentInput {
  title: string;
  description?: string;
  severity: string;
  affectedServices: string[];
  startedAt?: string;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  severity?: string;
  affectedServices?: string[];
  status?: string;
}

// ── Mappers ──

function rowToIncident(row: StatusIncidentRow): StatusIncident {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    affectedServices: row.affected_services,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

function rowToUpdate(row: StatusIncidentUpdateRow): IncidentUpdate {
  return {
    id: row.id,
    incidentId: row.incident_id,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

// ── CRUD ──

export async function createIncident(
  input: CreateIncidentInput,
  userId: string
): Promise<StatusIncident> {
  const result = await query<StatusIncidentRow>(
    `INSERT INTO status_incidents (title, description, severity, affected_services, started_at, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id, title, description, severity, status, affected_services, started_at, resolved_at, created_at, created_by, updated_at, updated_by`,
    [
      input.title,
      input.description ?? null,
      input.severity,
      input.affectedServices,
      input.startedAt ?? new Date().toISOString(),
      userId,
    ]
  );
  return rowToIncident(result.rows[0]!);
}

export async function getIncidentById(id: string): Promise<StatusIncidentWithUpdates | null> {
  const incidentResult = await query<StatusIncidentRow>(
    `SELECT id, title, description, severity, status, affected_services, started_at, resolved_at, created_at, created_by, updated_at, updated_by
     FROM status_incidents
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  const row = incidentResult.rows[0];
  if (!row) return null;

  const updatesResult = await query<StatusIncidentUpdateRow>(
    `SELECT id, incident_id, status, message, created_at, created_by
     FROM status_incident_updates
     WHERE incident_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [id]
  );

  return {
    ...rowToIncident(row),
    updates: updatesResult.rows.map(rowToUpdate),
  };
}

export async function listIncidents(params: {
  status?: string;
  severity?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: StatusIncident[]; total: number; hasMore: boolean }> {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions: string[] = ["deleted_at IS NULL"];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (params.status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(params.status);
  }
  if (params.severity) {
    conditions.push(`severity = $${paramIdx++}`);
    values.push(params.severity);
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM status_incidents WHERE ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<StatusIncidentRow>(
    `SELECT id, title, description, severity, status, affected_services, started_at, resolved_at, created_at, created_by, updated_at, updated_by
     FROM status_incidents
     WHERE ${where}
     ORDER BY started_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...values, limit, offset]
  );

  return {
    data: dataResult.rows.map(rowToIncident),
    total,
    hasMore: page * limit < total,
  };
}

export async function listActiveIncidents(): Promise<StatusIncident[]> {
  const result = await query<StatusIncidentRow>(
    `SELECT id, title, description, severity, status, affected_services, started_at, resolved_at, created_at, created_by, updated_at, updated_by
     FROM status_incidents
     WHERE deleted_at IS NULL
       AND (status != 'resolved' OR resolved_at > now() - interval '7 days')
       AND started_at > now() - interval '7 days'
     ORDER BY
       CASE WHEN status != 'resolved' THEN 0 ELSE 1 END,
       started_at DESC
     LIMIT 20`
  );
  return result.rows.map(rowToIncident);
}

export async function updateIncident(
  id: string,
  input: UpdateIncidentInput,
  userId: string
): Promise<StatusIncident | null> {
  const sets: string[] = ["updated_at = now()", "updated_by = $1"];
  const values: unknown[] = [userId];
  let paramIdx = 2;

  if (input.title !== undefined) {
    sets.push(`title = $${paramIdx++}`);
    values.push(input.title);
  }
  if (input.description !== undefined) {
    sets.push(`description = $${paramIdx++}`);
    values.push(input.description);
  }
  if (input.severity !== undefined) {
    sets.push(`severity = $${paramIdx++}`);
    values.push(input.severity);
  }
  if (input.affectedServices !== undefined) {
    sets.push(`affected_services = $${paramIdx++}`);
    values.push(input.affectedServices);
  }
  if (input.status !== undefined) {
    sets.push(`status = $${paramIdx++}`);
    values.push(input.status);
  }

  values.push(id);

  const result = await query<StatusIncidentRow>(
    `UPDATE status_incidents
     SET ${sets.join(", ")}
     WHERE id = $${paramIdx} AND deleted_at IS NULL
     RETURNING id, title, description, severity, status, affected_services, started_at, resolved_at, created_at, created_by, updated_at, updated_by`,
    values
  );

  const row = result.rows[0];
  return row ? rowToIncident(row) : null;
}

export async function resolveIncident(
  id: string,
  userId: string
): Promise<StatusIncident | null> {
  const result = await query<StatusIncidentRow>(
    `UPDATE status_incidents
     SET status = 'resolved', resolved_at = now(), updated_at = now(), updated_by = $1
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, title, description, severity, status, affected_services, started_at, resolved_at, created_at, created_by, updated_at, updated_by`,
    [userId, id]
  );

  const row = result.rows[0];
  return row ? rowToIncident(row) : null;
}

export async function softDeleteIncident(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE status_incidents
     SET deleted_at = now(), deleted_by = $1, updated_at = now(), updated_by = $1
     WHERE id = $2 AND deleted_at IS NULL`,
    [userId, id]
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Incident Updates ──

export async function postUpdate(
  incidentId: string,
  status: string,
  message: string,
  userId: string
): Promise<IncidentUpdate> {
  // Insert the update
  const result = await query<StatusIncidentUpdateRow>(
    `INSERT INTO status_incident_updates (incident_id, status, message, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING id, incident_id, status, message, created_at, created_by`,
    [incidentId, status, message, userId]
  );

  // Sync parent incident status
  const resolvedAt = status === "resolved" ? "now()" : "NULL";
  await query(
    `UPDATE status_incidents
     SET status = $1, resolved_at = ${status === "resolved" ? "now()" : "resolved_at"}, updated_at = now(), updated_by = $2
     WHERE id = $3 AND deleted_at IS NULL`,
    [status, userId, incidentId]
  );

  return rowToUpdate(result.rows[0]!);
}

export async function listUpdates(incidentId: string): Promise<IncidentUpdate[]> {
  const result = await query<StatusIncidentUpdateRow>(
    `SELECT id, incident_id, status, message, created_at, created_by
     FROM status_incident_updates
     WHERE incident_id = $1 AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [incidentId]
  );
  return result.rows.map(rowToUpdate);
}
