// ── Drone Run ──

export type DroneRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type DroneRunType = 'manual' | 'scheduled';

export type DroneTier = 1 | 2;

export interface DroneRun {
  id: string;
  runType: DroneRunType;
  tier: DroneTier;
  status: DroneRunStatus;
  batchSize: number;
  totalClaims: number;
  processedCount: number;
  successCount: number;
  deniedCount: number;
  errorCount: number;
  skippedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

// ── Drone Run Result (individual claim) ──

export type DroneClaimStatus =
  | 'success'
  | 'denied'
  | 'error'
  | 'skipped';

export interface DroneRunResult {
  id: string;
  claimCode: string;
  claimCaseId: string;
  tier: DroneTier;
  status: DroneClaimStatus;
  message: string;
  requestAmount: number;
  paidAmount: number;
  nonPaidAmount: number;
  toolsCalled: string[];
  toolCallCount: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

// ── Drone Schedule ──

export interface DroneSchedule {
  id: string;
  name: string;
  description: string;
  tier: DroneTier;
  batchSize: number;
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  slackChannel: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

// ── Drone Stats ──

export interface DroneStats {
  totalRuns: number;
  completedRuns: number;
  totalProcessed: number;
  totalSuccess: number;
  totalDenied: number;
  totalErrors: number;
  totalSkipped: number;
  avgDurationMs: number;
}

// ── Eligible Claim ──

export interface EligibleClaim {
  claimCaseId: string;
  claimCode: string;
  benefitType: string;
  icdCodes: string[];
}

// ── SSE Events ──

export type DroneSSEEventType =
  | 'run_started'
  | 'claim_started'
  | 'claim_completed'
  | 'run_completed'
  | 'error';

export interface DroneSSEEvent {
  type: DroneSSEEventType;
  runId: string;
  claimCode?: string;
  claimStatus?: DroneClaimStatus;
  processed?: number;
  total?: number;
  message?: string;
}
