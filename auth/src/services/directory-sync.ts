import { gqlQuery } from "./gql.ts";
import { decryptToken } from "./encryption.ts";
import {
  refreshAccessToken,
  listDirectoryUsers,
  type GoogleDirectoryUser,
} from "./google-directory.ts";
import { revokeAllUserSessions } from "./session.ts";
import { linkIdentity } from "./user.ts";

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
  const providerData = await gqlQuery<{
    tenantIdentityProviders: Array<{
      id: string;
      tenantId: string;
      providerType: string;
      encryptedRefreshToken: string;
      googleCustomerId: string;
      adminEmail: string;
      autoJoinUserType: string | null;
      autoJoinUserLevel: string | null;
      autoOffboardEnabled: boolean;
      domains: string[];
    }>;
  }>(`
    query LoadProvider($providerId: Uuid!) {
      tenantIdentityProviders(
        where: { id: { _eq: $providerId }, deletedAt: { _is_null: true }, isActive: { _eq: true } }
        limit: 1
      ) {
        id tenantId providerType encryptedRefreshToken googleCustomerId
        adminEmail autoJoinUserType autoJoinUserLevel autoOffboardEnabled domains
      }
    }
  `, { providerId });

  const provider = providerData.tenantIdentityProviders[0];
  if (!provider) throw new Error(`Provider ${providerId} not found or inactive`);
  if (!provider.encryptedRefreshToken) {
    throw new Error("Provider has no refresh token — admin must connect first");
  }

  const tenantId = provider.tenantId;
  const counts: SyncCounts = {
    usersFetched: 0,
    usersCreated: 0,
    usersUpdated: 0,
    usersDeactivated: 0,
    usersSkipped: 0,
    errorsCount: 0,
  };

  // Create sync log entry
  const logData = await gqlQuery<{
    insertDirectorySyncLogs: { returning: Array<{ id: string }> };
  }>(`
    mutation CreateSyncLog($object: InsertDirectorySyncLogsObjectInput!) {
      insertDirectorySyncLogs(objects: [$object]) {
        returning { id }
      }
    }
  `, {
    object: {
      tenantId,
      providerId,
      triggerType,
      triggeredBy: triggeredBy ?? null,
      status: "in_progress",
      createdBy: triggeredBy ?? null,
    },
  });
  const logId = logData.insertDirectorySyncLogs.returning[0]!.id;

  try {
    // Refresh access token
    const refreshToken = await decryptToken(provider.encryptedRefreshToken);
    const accessToken = await refreshAccessToken(refreshToken);

    // Fetch all Google Directory users (paginated)
    const googleUsers: GoogleDirectoryUser[] = [];
    let pageToken: string | undefined;

    do {
      const page = await listDirectoryUsers(
        accessToken,
        provider.googleCustomerId || "my_customer",
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
    const existingData = await gqlQuery<{
      users: Array<{
        id: string;
        email: string;
        name: string;
        directorySyncId: string;
      }>;
    }>(`
      query GetExistingUsers($tenantId: Uuid!, $providerId: Uuid!) {
        users(
          where: {
            tenantId: { _eq: $tenantId },
            directoryProviderId: { _eq: $providerId },
            deletedAt: { _is_null: true }
          }
        ) { id email name directorySyncId }
      }
    `, { tenantId, providerId });

    const existingByGoogleId = new Map(
      existingData.users.map((row) => [row.directorySyncId, row])
    );

    // Safety guardrail: check deactivation ratio
    const activeGoogleIds = new Set(
      relevantUsers.filter((gu) => !gu.suspended).map((gu) => gu.id)
    );
    const wouldDeactivate = existingData.users.filter(
      (row) => !activeGoogleIds.has(row.directorySyncId)
    );
    if (
      existingData.users.length > 10 &&
      wouldDeactivate.length / existingData.users.length >
        DEACTIVATION_SAFETY_THRESHOLD
    ) {
      const msg = `Safety abort: ${wouldDeactivate.length}/${existingData.users.length} users would be deactivated (>${DEACTIVATION_SAFETY_THRESHOLD * 100}%)`;
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
            const now = new Date().toISOString();
            await gqlQuery(`
              mutation SoftDeleteSyncUser($keyId: Uuid!, $preCheck: UsersBoolExp, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
                updateUsersById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) { affectedRows }
              }
            `, {
              keyId: existing.id,
              preCheck: { deletedAt: { _is_null: true } },
              updateColumns: {
                deletedAt: { set: now },
                deletedBy: { set: triggeredBy },
                updatedAt: { set: now },
                updatedBy: { set: triggeredBy },
              },
            });
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
            const now = new Date().toISOString();
            await gqlQuery(`
              mutation UpdateSyncUserName($keyId: Uuid!, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
                updateUsersById(keyId: $keyId, updateColumns: $updateColumns) { affectedRows }
              }
            `, {
              keyId: existing.id,
              updateColumns: {
                name: { set: fullName },
                updatedAt: { set: now },
                updatedBy: { set: triggeredBy },
              },
            });
            counts.usersUpdated++;
          } else {
            counts.usersSkipped++;
          }
        } else {
          // Create new user
          const userType = provider.autoJoinUserType || "insurer";
          const userLevel = provider.autoJoinUserLevel || "viewer";
          const userId = crypto.randomUUID();

          await gqlQuery(`
            mutation CreateSyncUser($object: InsertUsersObjectInput!) {
              insertUsers(objects: [$object]) { affectedRows }
            }
          `, {
            object: {
              id: userId,
              tenantId,
              email: gu.primaryEmail,
              name: gu.name.fullName,
              userType,
              userLevel,
              directorySyncId: gu.id,
              directoryProviderId: providerId,
              createdBy: triggeredBy,
              updatedBy: triggeredBy,
            },
          });

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
    if (provider.autoOffboardEnabled) {
      const googleIdSet = new Set(relevantUsers.map((gu) => gu.id));
      for (const row of existingData.users) {
        if (!googleIdSet.has(row.directorySyncId)) {
          try {
            const now = new Date().toISOString();
            await gqlQuery(`
              mutation OffboardUser($keyId: Uuid!, $preCheck: UsersBoolExp, $updateColumns: UpdateUsersByIdUpdateColumnsInput!) {
                updateUsersById(keyId: $keyId, preCheck: $preCheck, updateColumns: $updateColumns) { affectedRows }
              }
            `, {
              keyId: row.id,
              preCheck: { deletedAt: { _is_null: true } },
              updateColumns: {
                deletedAt: { set: now },
                deletedBy: { set: triggeredBy },
                updatedAt: { set: now },
                updatedBy: { set: triggeredBy },
              },
            });
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
  const now = new Date().toISOString();
  await gqlQuery(`
    mutation FinishSyncLog($keyId: Uuid!, $updateColumns: UpdateDirectorySyncLogsByIdUpdateColumnsInput!) {
      updateDirectorySyncLogsById(keyId: $keyId, updateColumns: $updateColumns) { affectedRows }
    }
  `, {
    keyId: logId,
    updateColumns: {
      status: { set: status },
      usersFetched: { set: counts.usersFetched },
      usersCreated: { set: counts.usersCreated },
      usersUpdated: { set: counts.usersUpdated },
      usersDeactivated: { set: counts.usersDeactivated },
      usersSkipped: { set: counts.usersSkipped },
      errorsCount: { set: counts.errorsCount },
      completedAt: { set: now },
      errorMessage: { set: errorMessage ?? null },
      updatedAt: { set: now },
    },
  });
}

async function updateProviderSyncStatus(
  providerId: string,
  status: string,
  error?: string
): Promise<void> {
  const now = new Date().toISOString();
  await gqlQuery(`
    mutation UpdateProviderSyncStatus($keyId: Uuid!, $updateColumns: UpdateTenantIdentityProvidersByIdUpdateColumnsInput!) {
      updateTenantIdentityProvidersById(keyId: $keyId, updateColumns: $updateColumns) { affectedRows }
    }
  `, {
    keyId: providerId,
    updateColumns: {
      lastSyncAt: { set: now },
      lastSyncStatus: { set: status },
      lastSyncError: { set: error ?? null },
      updatedAt: { set: now },
    },
  });
}
