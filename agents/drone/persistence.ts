/**
 * Drone persistence layer — writes run metadata and results to Banyan's own database
 * via the DDN Cloud GraphQL endpoint.
 *
 * This is separate from the Apple GraphQL client (getClient()) which is used for
 * claim operations. When Apple is fully deployed as a DDN subgraph, both clients
 * can be merged.
 */

import { ApolloClient, HttpLink, InMemoryCache, gql } from "@apollo/client/core";

// ---------------------------------------------------------------------------
// Banyan DDN Client
// ---------------------------------------------------------------------------

const BANYAN_ENDPOINT = process.env.BANYAN_DDN_ENDPOINT ?? "https://banyan-prod.ddn.hasura.app/graphql";
const BANYAN_TOKEN = process.env.HASURA_ADMIN_TOKEN;

if (!BANYAN_TOKEN) {
  console.warn("[drone/persistence] HASURA_ADMIN_TOKEN not set — drone persistence disabled");
}

const banyanClient = BANYAN_TOKEN
  ? new ApolloClient({
      cache: new InMemoryCache(),
      link: new HttpLink({
        uri: BANYAN_ENDPOINT,
        headers: { Authorization: `Bearer ${BANYAN_TOKEN}` },
      }),
    })
  : null;

// Default tenant for drone operations (Papaya's own tenant)
const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateDroneRunInput {
  runType: "manual" | "scheduled" | "single";
  tier: 1 | 2;
  batchSize: number;
  totalClaims: number;
  triggeredBy?: string;
  scheduleId?: string;
}

export interface DroneRunResult {
  claimCode: string;
  claimCaseId?: string;
  tier: number;
  status: "success" | "denied" | "error" | "skipped";
  message?: string;
  requestAmount?: number;
  paidAmount?: number;
  nonPaidAmount?: number;
  toolsCalled?: string[];
  toolCallCount?: number;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const INSERT_DRONE_RUN = gql`
  mutation InsertDroneRun($object: InsertDroneRunsObject!) {
    insertDroneRuns(objects: [$object]) {
      returning {
        id
      }
    }
  }
`;

const UPDATE_DRONE_RUN = gql`
  mutation UpdateDroneRun($id: Uuid!, $update: UpdateColumnDroneRunsUpdateColumns!) {
    updateDroneRunsById(id: $id, updateColumns: $update) {
      id
      status
      processedCount
      successCount
      errorCount
    }
  }
`;

const INSERT_DRONE_RUN_RESULT = gql`
  mutation InsertDroneRunResult($object: InsertDroneRunResultsObject!) {
    insertDroneRunResults(objects: [$object]) {
      returning {
        id
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const GET_DRONE_RUNS = gql`
  query GetDroneRuns($limit: Int!, $offset: Int!) {
    droneRuns(
      where: { deletedAt: { _isNull: true } }
      orderBy: [{ createdAt: Desc }]
      limit: $limit
      offset: $offset
    ) {
      id
      runType
      tier
      status
      batchSize
      totalClaims
      processedCount
      successCount
      deniedCount
      errorCount
      skippedCount
      startedAt
      completedAt
      durationMs
      createdAt
    }
    droneRunsAggregate(where: { deletedAt: { _isNull: true } }) {
      _count
    }
  }
`;

const GET_DRONE_RUN_BY_ID = gql`
  query GetDroneRunById($id: Uuid!) {
    droneRunsById(id: $id) {
      id
      runType
      tier
      status
      batchSize
      totalClaims
      processedCount
      successCount
      deniedCount
      errorCount
      skippedCount
      startedAt
      completedAt
      durationMs
      createdAt
    }
  }
`;

const GET_DRONE_RUN_RESULTS = gql`
  query GetDroneRunResults($runId: Uuid!, $limit: Int!, $offset: Int!) {
    droneRunResults(
      where: { runId: { _eq: $runId }, deletedAt: { _isNull: true } }
      orderBy: [{ createdAt: Asc }]
      limit: $limit
      offset: $offset
    ) {
      id
      claimCode
      claimCaseId
      tier
      status
      message
      requestAmount
      paidAmount
      nonPaidAmount
      toolsCalled
      toolCallCount
      durationMs
      startedAt
      completedAt
      createdAt
    }
    droneRunResultsAggregate(
      where: { runId: { _eq: $runId }, deletedAt: { _isNull: true } }
    ) {
      _count
    }
  }
`;

const GET_DRONE_SCHEDULES = gql`
  query GetDroneSchedules {
    droneSchedules(
      where: { deletedAt: { _isNull: true } }
      orderBy: [{ createdAt: Desc }]
    ) {
      id
      name
      description
      tier
      batchSize
      cronExpression
      timezone
      enabled
      slackChannel
      lastRunAt
      nextRunAt
      createdAt
    }
  }
`;

const INSERT_DRONE_SCHEDULE = gql`
  mutation InsertDroneSchedule($object: InsertDroneSchedulesObject!) {
    insertDroneSchedules(objects: [$object]) {
      returning {
        id
      }
    }
  }
`;

const GET_DRONE_STATS = gql`
  query GetDroneStats {
    droneRuns(where: { deletedAt: { _isNull: true } }) {
      status
      successCount
      deniedCount
      errorCount
      skippedCount
      processedCount
      durationMs
      tier
      createdAt
    }
  }
`;

// ---------------------------------------------------------------------------
// Persistence Functions
// ---------------------------------------------------------------------------

function getClient() {
  if (!banyanClient) {
    throw new Error("Banyan DDN client not initialized — set HASURA_ADMIN_TOKEN");
  }
  return banyanClient;
}

export async function createDroneRun(input: CreateDroneRunInput): Promise<string> {
  const { data } = await getClient().mutate({
    mutation: INSERT_DRONE_RUN,
    variables: {
      object: {
        tenantId: DEFAULT_TENANT_ID,
        runType: input.runType,
        tier: input.tier,
        batchSize: input.batchSize,
        totalClaims: input.totalClaims,
        triggeredBy: input.triggeredBy,
        scheduleId: input.scheduleId,
        status: "running",
        startedAt: new Date().toISOString(),
      },
    },
  });
  return data.insertDroneRuns.returning[0].id;
}

export async function recordDroneResult(runId: string, result: DroneRunResult): Promise<void> {
  await getClient().mutate({
    mutation: INSERT_DRONE_RUN_RESULT,
    variables: {
      object: {
        tenantId: DEFAULT_TENANT_ID,
        runId,
        claimCode: result.claimCode,
        claimCaseId: result.claimCaseId,
        tier: result.tier,
        status: result.status,
        message: result.message,
        requestAmount: result.requestAmount,
        paidAmount: result.paidAmount,
        nonPaidAmount: result.nonPaidAmount,
        toolsCalled: result.toolsCalled ?? [],
        toolCallCount: result.toolCallCount ?? 0,
        durationMs: result.durationMs,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
    },
  });
}

export async function updateDroneRunProgress(
  runId: string,
  counts: {
    processedCount: number;
    successCount: number;
    deniedCount: number;
    errorCount: number;
    skippedCount: number;
  },
): Promise<void> {
  // Use a raw mutation since the update structure may vary
  await getClient().mutate({
    mutation: gql`
      mutation UpdateRunProgress(
        $id: Uuid!
        $processed: Int!
        $success: Int!
        $denied: Int!
        $error: Int!
        $skipped: Int!
      ) {
        updateDroneRunsById(
          id: $id
          updateColumns: {
            processedCount: { set: $processed }
            successCount: { set: $success }
            deniedCount: { set: $denied }
            errorCount: { set: $error }
            skippedCount: { set: $skipped }
            updatedAt: { set: "${new Date().toISOString()}" }
          }
        ) {
          id
        }
      }
    `,
    variables: {
      id: runId,
      processed: counts.processedCount,
      success: counts.successCount,
      denied: counts.deniedCount,
      error: counts.errorCount,
      skipped: counts.skippedCount,
    },
  });
}

export async function completeDroneRun(
  runId: string,
  status: "completed" | "failed" | "cancelled",
  durationMs: number,
): Promise<void> {
  await getClient().mutate({
    mutation: gql`
      mutation CompleteRun($id: Uuid!) {
        updateDroneRunsById(
          id: $id
          updateColumns: {
            status: { set: "${status}" }
            completedAt: { set: "${new Date().toISOString()}" }
            durationMs: { set: ${durationMs} }
            updatedAt: { set: "${new Date().toISOString()}" }
          }
        ) {
          id
        }
      }
    `,
    variables: { id: runId },
  });
}

// ---------------------------------------------------------------------------
// Query Functions (for API endpoints)
// ---------------------------------------------------------------------------

export async function listDroneRuns(page = 1, pageSize = 20) {
  const { data } = await getClient().query({
    query: GET_DRONE_RUNS,
    variables: { limit: pageSize, offset: (page - 1) * pageSize },
    fetchPolicy: "no-cache",
  });
  return {
    runs: data.droneRuns,
    total: data.droneRunsAggregate._count,
    page,
    pageSize,
  };
}

export async function getDroneRunById(id: string) {
  const { data } = await getClient().query({
    query: GET_DRONE_RUN_BY_ID,
    variables: { id },
    fetchPolicy: "no-cache",
  });
  return data.droneRunsById;
}

export async function listDroneRunResults(runId: string, page = 1, pageSize = 100) {
  const { data } = await getClient().query({
    query: GET_DRONE_RUN_RESULTS,
    variables: { runId, limit: pageSize, offset: (page - 1) * pageSize },
    fetchPolicy: "no-cache",
  });
  return {
    results: data.droneRunResults,
    total: data.droneRunResultsAggregate._count,
    page,
    pageSize,
  };
}

export async function listDroneSchedules() {
  const { data } = await getClient().query({
    query: GET_DRONE_SCHEDULES,
    fetchPolicy: "no-cache",
  });
  return data.droneSchedules;
}

export async function createDroneSchedule(input: {
  name: string;
  description?: string;
  tier: number;
  batchSize: number;
  cronExpression: string;
  timezone?: string;
  slackChannel?: string;
}) {
  const { data } = await getClient().mutate({
    mutation: INSERT_DRONE_SCHEDULE,
    variables: {
      object: {
        tenantId: DEFAULT_TENANT_ID,
        name: input.name,
        description: input.description,
        tier: input.tier,
        batchSize: input.batchSize,
        cronExpression: input.cronExpression,
        timezone: input.timezone ?? "Asia/Ho_Chi_Minh",
        slackChannel: input.slackChannel,
        enabled: true,
      },
    },
  });
  return data.insertDroneSchedules.returning[0].id;
}

export async function updateDroneSchedule(
  id: string,
  fields: {
    name?: string;
    description?: string;
    tier?: number;
    batchSize?: number;
    cronExpression?: string;
    timezone?: string;
    slackChannel?: string;
    enabled?: boolean;
  },
): Promise<void> {
  const updates: string[] = [];
  if (fields.name !== undefined) updates.push(`name: { set: "${fields.name}" }`);
  if (fields.description !== undefined) updates.push(`description: { set: "${fields.description}" }`);
  if (fields.tier !== undefined) updates.push(`tier: { set: ${fields.tier} }`);
  if (fields.batchSize !== undefined) updates.push(`batchSize: { set: ${fields.batchSize} }`);
  if (fields.cronExpression !== undefined) updates.push(`cronExpression: { set: "${fields.cronExpression}" }`);
  if (fields.timezone !== undefined) updates.push(`timezone: { set: "${fields.timezone}" }`);
  if (fields.slackChannel !== undefined) updates.push(`slackChannel: { set: "${fields.slackChannel}" }`);
  if (fields.enabled !== undefined) updates.push(`enabled: { set: ${fields.enabled} }`);
  updates.push(`updatedAt: { set: "${new Date().toISOString()}" }`);

  if (updates.length <= 1) return; // Only updatedAt — nothing to change

  await getClient().mutate({
    mutation: gql`
      mutation UpdateDroneSchedule($id: Uuid!) {
        updateDroneSchedulesById(
          id: $id
          updateColumns: { ${updates.join(", ")} }
        ) {
          id
        }
      }
    `,
    variables: { id },
  });
}

export async function softDeleteDroneSchedule(id: string, userId?: string): Promise<void> {
  const now = new Date().toISOString();
  const deletedByField = userId ? `deletedBy: { set: "${userId}" }` : "";
  await getClient().mutate({
    mutation: gql`
      mutation SoftDeleteDroneSchedule($id: Uuid!) {
        updateDroneSchedulesById(
          id: $id
          updateColumns: {
            deletedAt: { set: "${now}" }
            ${deletedByField}
            updatedAt: { set: "${now}" }
          }
        ) {
          id
        }
      }
    `,
    variables: { id },
  });
}

export async function getDroneStats() {
  const { data } = await getClient().query({
    query: GET_DRONE_STATS,
    fetchPolicy: "no-cache",
  });
  const runs = data.droneRuns;
  const completed = runs.filter((r: any) => r.status === "completed");
  return {
    totalRuns: runs.length,
    completedRuns: completed.length,
    totalProcessed: completed.reduce((s: number, r: any) => s + (r.processedCount || 0), 0),
    totalSuccess: completed.reduce((s: number, r: any) => s + (r.successCount || 0), 0),
    totalDenied: completed.reduce((s: number, r: any) => s + (r.deniedCount || 0), 0),
    totalErrors: completed.reduce((s: number, r: any) => s + (r.errorCount || 0), 0),
    totalSkipped: completed.reduce((s: number, r: any) => s + (r.skippedCount || 0), 0),
    avgDurationMs: completed.length > 0
      ? Math.round(completed.reduce((s: number, r: any) => s + (r.durationMs || 0), 0) / completed.length)
      : 0,
  };
}
