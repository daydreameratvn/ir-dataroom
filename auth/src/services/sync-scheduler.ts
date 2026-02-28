import { query } from "../db/pool.ts";
import { syncGoogleDirectory } from "./directory-sync.ts";

const SCHEDULER_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const SYNC_STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(): void {
  if (schedulerTimer) return;

  console.log("Directory sync scheduler started (15-min interval)");
  schedulerTimer = setInterval(runScheduledSyncs, SCHEDULER_INTERVAL_MS);

  // Run once on startup after a short delay
  setTimeout(runScheduledSyncs, 10_000);
}

export function stopSyncScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("Directory sync scheduler stopped");
  }
}

async function runScheduledSyncs(): Promise<void> {
  try {
    // SELECT ... FOR UPDATE SKIP LOCKED prevents concurrent execution
    // across multiple ECS tasks
    const result = await query<{ id: string }>(
      `SELECT id FROM tenant_identity_providers
       WHERE deleted_at IS NULL
         AND is_active = true
         AND auto_offboard_enabled = true
         AND encrypted_refresh_token IS NOT NULL
         AND (
           last_sync_at IS NULL
           OR last_sync_at < now() - interval '1 hour'
         )
       FOR UPDATE SKIP LOCKED
       LIMIT 5`,
      []
    );

    for (const row of result.rows) {
      try {
        await syncGoogleDirectory(row.id, null, "scheduled");
      } catch (err) {
        console.error(`Scheduled sync failed for provider ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.error("Sync scheduler error:", err);
  }
}
