import { getAccessToken } from '@papaya/auth';
import type {
  PendingAssessment,
  ScourgeJob,
  ScourgeJobDetail,
} from './types';

// ── Helpers ──

const BASE = '/auth/fwa';

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

// ── Assessment ──

export async function startAssessment(
  claimCode: string,
  text?: string,
  chatId?: string,
): Promise<Response> {
  const response = await fetch(`${BASE}/assess`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ claimCode, text, chatId }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }

  return response;
}

export async function sendApproval(
  chatId: string,
  toolCallId: string,
  toolName: string,
  approved: boolean,
): Promise<Response> {
  const response = await fetch(`${BASE}/assess/approve`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ chatId, toolCallId, toolName, approved }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }

  return response;
}

export async function listPendingAssessments(): Promise<PendingAssessment[]> {
  const response = await fetch(`${BASE}/pending`, { headers: getHeaders() });
  const result = await handleResponse<{ data: PendingAssessment[] }>(response);
  return result.data;
}

// ── Compliance ──

export async function startComplianceCheck(claimCode: string): Promise<Response> {
  const response = await fetch(`${BASE}/compliance`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ claimCode }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }

  return response;
}

export async function quickComplianceCheck(
  claimCode: string,
): Promise<{ claimCode: string; result: string }> {
  const searchParams = new URLSearchParams({ claimCode });
  const response = await fetch(`${BASE}/compliance?${searchParams.toString()}`, {
    headers: getHeaders(),
  });
  return handleResponse<{ claimCode: string; result: string }>(response);
}

// ── Scourge ──

export async function startScourgeJob(claimCode: string): Promise<Response> {
  const response = await fetch(`${BASE}/scourge`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ claimCode }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }

  return response;
}

export async function listScourgeJobs(): Promise<ScourgeJob[]> {
  const response = await fetch(`${BASE}/scourge`, { headers: getHeaders() });
  const result = await handleResponse<{ data: ScourgeJob[] }>(response);
  return result.data;
}

export async function getScourgeJob(id: string): Promise<ScourgeJobDetail> {
  const response = await fetch(`${BASE}/scourge/${id}`, { headers: getHeaders() });
  return handleResponse<ScourgeJobDetail>(response);
}
