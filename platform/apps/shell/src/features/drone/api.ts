import { getAccessToken } from '@papaya/auth';
import type { PaginatedResponse } from '@papaya/shared-types';
import type {
  DroneRun,
  DroneRunResult,
  DroneSchedule,
  DroneStats,
  DroneTier,
  EligibleClaim,
} from './types';

// ── Helpers ──

const BASE = '/auth/drone';

function getHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
  return response.json() as Promise<T>;
}

// ── Runs ──

export interface ListRunsParams {
  page?: number;
  limit?: number;
  status?: string;
  tier?: DroneTier;
}

export async function listRuns(params: ListRunsParams): Promise<PaginatedResponse<DroneRun>> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.status) searchParams.set('status', params.status);
  if (params.tier) searchParams.set('tier', String(params.tier));

  const url = `${BASE}/runs?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<DroneRun>>(response);
}

export async function getRun(id: string): Promise<DroneRun> {
  const response = await fetch(`${BASE}/runs/${id}`, { headers: getHeaders() });
  return handleResponse<DroneRun>(response);
}

export async function getRunResults(
  runId: string,
  params?: { page?: number; limit?: number }
): Promise<PaginatedResponse<DroneRunResult>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const url = `${BASE}/runs/${runId}/results?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<DroneRunResult>>(response);
}

export interface StartRunPayload {
  tier: DroneTier;
  batchSize: number;
  claimCaseIds?: string[];
}

export async function startRun(payload: StartRunPayload): Promise<{ id: string; runId: string; totalClaims: number }> {
  const response = await fetch(`${BASE}/runs`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ id: string; runId: string; totalClaims: number }>(response);
}

export async function cancelRun(id: string): Promise<void> {
  const response = await fetch(`${BASE}/runs/${id}/cancel`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

// ── Eligible Claims ──

export async function getEligible(tier: DroneTier, batchSize?: number): Promise<EligibleClaim[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('tier', String(tier));
  if (batchSize) searchParams.set('batchSize', String(batchSize));

  const response = await fetch(`${BASE}/eligible?${searchParams.toString()}`, {
    headers: getHeaders(),
  });
  const result = await handleResponse<{ data: EligibleClaim[] }>(response);
  return result.data;
}

// ── Schedules ──

export async function listSchedules(): Promise<DroneSchedule[]> {
  const response = await fetch(`${BASE}/schedules`, { headers: getHeaders() });
  const result = await handleResponse<{ data: DroneSchedule[] }>(response);
  return result.data;
}

export interface CreateSchedulePayload {
  name: string;
  description?: string;
  tier: DroneTier;
  batchSize: number;
  cronExpression: string;
  timezone?: string;
  slackChannel?: string;
}

export async function createSchedule(payload: CreateSchedulePayload): Promise<{ id: string }> {
  const response = await fetch(`${BASE}/schedules`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ id: string }>(response);
}

export interface UpdateSchedulePayload {
  name?: string;
  description?: string;
  tier?: DroneTier;
  batchSize?: number;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  slackChannel?: string | null;
}

export async function updateSchedule(
  id: string,
  payload: UpdateSchedulePayload
): Promise<void> {
  const response = await fetch(`${BASE}/schedules/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function deleteSchedule(id: string): Promise<void> {
  const response = await fetch(`${BASE}/schedules/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

// ── Stats ──

export async function getStats(): Promise<DroneStats> {
  const response = await fetch(`${BASE}/stats`, { headers: getHeaders() });
  return handleResponse<DroneStats>(response);
}
