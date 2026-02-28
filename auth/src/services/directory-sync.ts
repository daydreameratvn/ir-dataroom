import { query } from "../db/pool.ts";
import { decryptToken } from "./encryption.ts";
import {
  refreshAccessToken,
  listDirectoryUsers,
  type GoogleDirectoryUser,
} from "./google-directory.ts";
import { revokeAllUserSessions } from "./session.ts";
import { linkIdentity } from "./user.ts";

interface ProviderRow {
  id: string;
  tenant_id: string;
  provider_type: string;
  encrypted_refresh_token: string;
  google_customer_id: string;
  admin_email: string;
  auto_join_user_type: string | null;
  auto_join_user_level: string | null;
  auto_offboard_enabled: boolean;
  domains: string[];
}

interface SyncCounts {
  usersFetched: number;
  usersCreated: number;
  usersUpdated: number;
  usersDeactivated: number;
  usersSkipped: number;
  errorsCount: number;
}

const DEACTIVATION_SAFETY_THRESHOLD = 0.5;

export async function syncGoogleDirectory(
  providerId: string,
  triggeredBy: string | null,
  triggerType: "manual" | "scheduled" | "auto_join"
): Promise<{ logId: string; status: string; counts: SyncCounts }> {
  // Load provider config
  const providerResult = await query<ProviderRow>(
    `SELECT id, tenant_id, provider_type, encrypted_refresh_token,
            google_customer_id, admin_email, auto_join_user_type,
            auto_join_user_level, auto_offboard_enabled, domains
     FROM tenant_identity_providers
     WHERE id = $1 AND deleted_at IS NULL AND is_active = true`,
    [providerId]
  );
  const provider = providerResult.rows[0];
  if (!provider) throw new Error(`Provider ${providerId} not found or inactive`);
  if (!provider.encrypted_refresh_token) {
    throw new Error("Provider has no refresh token — admin must connect first");
  }

  const tenantId = provider.tenant_id;
  const counts: SyncCounts = {
    usersFetched: 0,
    usersCreated: 0,
    usersUpdated: 0,
    usersDeactivated: 0,
    usersSkipped: 0,
    errorsCount: 0,
  };

  // Create sync log entry
  const logResult = await query<{ id: string }>(
    `INSERT INTO directory_sync_logs
       (tenant_id, provider_id, trigger_type, triggered_by, status, created_by)
     VALUES ($1, $2, $3, $4, 'in_progress', $4)
     RETURNING id`,
    [tenantId, providerId, triggerType, triggeredBy]
  );
  const logId = logResult.rows[0]!.id;

  try {
    // Refresh access token
    const refreshToken = await decryptToken(provider.encrypted_refresh_token);
    const accessToken = await refreshAccessToken(refreshToken);

    // Fetch all Google Directory users (paginated)
    const googleUsers: GoogleDirectoryUser[] = [];
    let pageToken: string | undefined;

    do {
      const page = await listDirectoryUsers(
        accessToken,
        provider.google_customer_id || "my_customer",
        pageToken
      );
      if (page.users) {
        googleUsers.push(...page.users);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    counts.usersFetched = googleUsers.length;

    // Filter to only users matching configured domains
    const domainSet = new Set(provider.domains.map((d) => d.toLowerCase()));
    const relevantUsers = googleUsers.filter((gu) => {
      const domain = gu.primaryEmail.split("@")[1]?.toLowerCase();
      return domain && domainSet.has(domain);
    });

    // Get existing Oasis users linked to this provider
    const existingResult = await query<{
      id: string;
      email: string;
      name: string;
      directory_sync_id: string;
    }>(
      `SELECT id, email, name, directory_sync_id
       FROM users
       WHERE tenant_id = $1
         AND directory_provider_id = $2
         AND deleted_at IS NULL`,
      [tenantId, providerId]
    );

    const existingByGoogleId = new Map(
      existingResult.rows.map((row) => [row.directory_sync_id, row])
    );

    // Safety guardrail: check deactivation ratio
    const activeGoogleIds = new Set(
      relevantUsers.filter((gu) => !gu.suspended).map((gu) => gu.id)
    );
    const wouldDeactivate = existingResult.rows.filter(
      (row) => !activeGoogleIds.has(row.directory_sync_id)
    );
    if (
      existingResult.rows.length > 10 &&
      wouldDeactivate.length / existingResult.rows.length >
        DEACTIVATION_SAFETY_THRESHOLD
    ) {
      const msg = `Safety abort: ${wouldDeactivate.length}/${existingResult.rows.length} users would be deactivated (>${DEACTIVATION_SAFETY_THRESHOLD * 100}%)`;
      await finishSyncLog(logId, "failed", counts, msg);
      await updateProviderSyncStatus(providerId, "failed", msg);
      return { logId, status: "failed", counts };
    }

    // Process each Google user
    for (const gu of relevantUsers) {
      try {
        const existing = existingByGoogleId.get(gu.id);

        if (gu.suspended) {
          // Suspended in Google → soft-delete in Oasis
          if (existing) {
            await query(
              `UPDATE users
               SET deleted_at = now(), deleted_by = $2, updated_at = now(), updated_by = $2
               WHERE id = $1 AND deleted_at IS NULL`,
              [existing.id, triggeredBy]
            );
            await revokeAllUserSessions(existing.id, tenantId);
            counts.usersDeactivated++;
          } else {
            counts.usersSkipped++;
          }
          continue;
        }

        if (existing) {
          // Update name if changed
          const fullName = gu.name.fullName;
          if (existing.name !== fullName) {
            await query(
              `UPDATE users SET name = $2, updated_at = now(), updated_by = $3
               WHERE id = $1`,
              [existing.id, fullName, triggeredBy]
            );
            counts.usersUpdated++;
          } else {
            counts.usersSkipped++;
          }
        } else {
          // Create new user
          const userType = provider.auto_join_user_type || "insurer";
          const userLevel = provider.auto_join_user_level || "viewer";
          const userId = crypto.randomUUID();

          await query(
            `INSERT INTO users
               (id, tenant_id, email, name, user_type, user_level,
                directory_sync_id, directory_provider_id,
                created_by, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
            [
              userId,
              tenantId,
              gu.primaryEmail,
              gu.name.fullName,
              userType,
              userLevel,
              gu.id,
              providerId,
              triggeredBy,
            ]
          );

          // Link Google SSO identity so they can log in
          await linkIdentity(tenantId, userId, "google", gu.id);
          counts.usersCreated++;
        }
      } catch (err) {
        console.error(`Error syncing user ${gu.primaryEmail}:`, err);
        counts.errorsCount++;
      }
    }

    // Offboarding: users in Oasis but not in Google directory
    if (provider.auto_offboard_enabled) {
      const googleIdSet = new Set(relevantUsers.map((gu) => gu.id));
      for (const row of existingResult.rows) {
        if (!googleIdSet.has(row.directory_sync_id)) {
          try {
            await query(
              `UPDATE users
               SET deleted_at = now(), deleted_by = $2, updated_at = now(), updated_by = $2
               WHERE id = $1 AND deleted_at IS NULL`,
              [row.id, triggeredBy]
            );
            await revokeAllUserSessions(row.id, tenantId);
            counts.usersDeactivated++;
          } catch (err) {
            console.error(`Error offboarding user ${row.email}:`, err);
            counts.errorsCount++;
          }
        }
      }
    }

    const status = counts.errorsCount > 0 ? "partial" : "success";
    await finishSyncLog(logId, status, counts);
    await updateProviderSyncStatus(providerId, status);

    return { logId, status, counts };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Directory sync failed for provider ${providerId}:`, errorMsg);
    await finishSyncLog(logId, "failed", counts, errorMsg);
    await updateProviderSyncStatus(providerId, "failed", errorMsg);
    return { logId, status: "failed", counts };
  }
}

async function finishSyncLog(
  logId: string,
  status: string,
  counts: SyncCounts,
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE directory_sync_logs
     SET status = $2,
         users_fetched = $3, users_created = $4, users_updated = $5,
         users_deactivated = $6, users_skipped = $7, errors_count = $8,
         completed_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at))::int * 1000,
         error_message = $9,
         updated_at = now()
     WHERE id = $1`,
    [
      logId,
      status,
      counts.usersFetched,
      counts.usersCreated,
      counts.usersUpdated,
      counts.usersDeactivated,
      counts.usersSkipped,
      counts.errorsCount,
      errorMessage ?? null,
    ]
  );
}

async function updateProviderSyncStatus(
  providerId: string,
  status: string,
  error?: string
): Promise<void> {
  await query(
    `UPDATE tenant_identity_providers
     SET last_sync_at = now(), last_sync_status = $2, last_sync_error = $3,
         updated_at = now()
     WHERE id = $1`,
    [providerId, status, error ?? null]
  );
}
