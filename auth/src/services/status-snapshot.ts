import { query } from "../db/pool.ts";

// ── Types ──

interface ServiceSnapshot {
  name: string;
  status: string;
  latencyMs: number | null;
}

interface SnapshotRow {
  id: string;
  checked_at: string;
  services: ServiceSnapshot[];
}

export interface DailyServiceStatus {
  name: string;
  status: string;
}

export interface DailyStatus {
  date: string;
  services: DailyServiceStatus[];
}

// ── Throttle state (5-min per process) ──

let lastSnapshotAt = 0;
const THROTTLE_MS = 5 * 60 * 1000;

// ── Record a snapshot ──

export async function recordSnapshot(services: ServiceSnapshot[]): Promise<void> {
  const now = Date.now();
  if (now - lastSnapshotAt < THROTTLE_MS) return;
  lastSnapshotAt = now;

  try {
    await query(
      `INSERT INTO status_snapshots (checked_at, services, created_by, updated_by)
       VALUES (now(), $1, NULL, NULL)`,
      [JSON.stringify(services)]
    );
  } catch {
    // Non-blocking — don't fail the status endpoint
  }
}

// ── Get daily status history ──

export async function getDailyStatusHistory(days: number = 90): Promise<DailyStatus[]> {
  // Aggregate snapshots by day: for each service, pick the worst status that day
  const result = await query<{
    day: string;
    service_name: string;
    worst_status: string;
  }>(
    `WITH daily AS (
       SELECT
         date_trunc('day', checked_at)::date AS day,
         svc->>'name' AS service_name,
         svc->>'status' AS status
       FROM status_snapshots,
            jsonb_array_elements(services) AS svc
       WHERE deleted_at IS NULL
         AND checked_at > now() - make_interval(days => $1)
     )
     SELECT
       day::text,
       service_name,
       CASE
         WHEN bool_or(status = 'outage') THEN 'outage'
         WHEN bool_or(status = 'degraded') THEN 'degraded'
         WHEN bool_or(status = 'maintenance') THEN 'maintenance'
         ELSE 'operational'
       END AS worst_status
     FROM daily
     GROUP BY day, service_name
     ORDER BY day ASC, service_name ASC`,
    [days]
  );

  // Group by day
  const dayMap = new Map<string, DailyServiceStatus[]>();
  for (const row of result.rows) {
    const services = dayMap.get(row.day) ?? [];
    services.push({ name: row.service_name, status: row.worst_status });
    dayMap.set(row.day, services);
  }

  const history: DailyStatus[] = [];
  for (const [date, services] of dayMap) {
    history.push({ date, services });
  }

  return history;
}
