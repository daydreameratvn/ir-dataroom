import { query } from "../db/pool.ts";

// ── Types ──

interface ServiceOverrideRow {
  id: string;
  service_name: string;
  status: string;
  reason: string | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ServiceOverride {
  id: string;
  serviceName: string;
  status: string;
  reason: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface SetOverrideInput {
  serviceName: string;
  status: string;
  reason?: string;
  startsAt?: string;
  endsAt?: string;
}

// ── Mapper ──

function rowToOverride(row: ServiceOverrideRow): ServiceOverride {
  return {
    id: row.id,
    serviceName: row.service_name,
    status: row.status,
    reason: row.reason,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

// ── Queries ──

export async function getActiveOverrides(): Promise<ServiceOverride[]> {
  const result = await query<ServiceOverrideRow>(
    `SELECT id, service_name, status, reason, starts_at, ends_at, created_at, created_by
     FROM status_service_overrides
     WHERE deleted_at IS NULL
       AND starts_at <= now()
       AND (ends_at IS NULL OR ends_at > now())
     ORDER BY service_name ASC`
  );
  return result.rows.map(rowToOverride);
}

export async function setOverride(
  input: SetOverrideInput,
  userId: string
): Promise<ServiceOverride> {
  // Soft-delete any existing active override for this service
  await query(
    `UPDATE status_service_overrides
     SET deleted_at = now(), deleted_by = $1, updated_at = now(), updated_by = $1
     WHERE service_name = $2 AND deleted_at IS NULL AND (ends_at IS NULL OR ends_at > now())`,
    [userId, input.serviceName]
  );

  // Insert new override
  const result = await query<ServiceOverrideRow>(
    `INSERT INTO status_service_overrides (service_name, status, reason, starts_at, ends_at, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING id, service_name, status, reason, starts_at, ends_at, created_at, created_by`,
    [
      input.serviceName,
      input.status,
      input.reason ?? null,
      input.startsAt ?? new Date().toISOString(),
      input.endsAt ?? null,
      userId,
    ]
  );
  return rowToOverride(result.rows[0]!);
}

export async function clearOverride(
  serviceName: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE status_service_overrides
     SET deleted_at = now(), deleted_by = $1, updated_at = now(), updated_by = $1
     WHERE service_name = $2 AND deleted_at IS NULL AND (ends_at IS NULL OR ends_at > now())`,
    [userId, serviceName]
  );
  return (result.rowCount ?? 0) > 0;
}
