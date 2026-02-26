import { getAccessToken } from '@papaya/auth';

const BASE = '/auth/errors';

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

// ── Types ──

export interface ErrorReport {
  id: string;
  tenantId: string | null;
  source: string;
  status: string;
  severity: string;
  message: string;
  stackTrace: string | null;
  componentStack: string | null;
  url: string | null;
  endpoint: string | null;
  userId: string | null;
  impersonatorId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  fingerprint: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  fixPrUrl: string | null;
  fixPrNumber: number | null;
  fixBranch: string | null;
  createdAt: string;
}

export interface ListErrorsParams {
  tenantId?: string;
  source?: string;
  status?: string;
  severity?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListErrorsResult {
  data: ErrorReport[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── API functions ──

export async function listErrors(params: ListErrorsParams): Promise<ListErrorsResult> {
  const searchParams = new URLSearchParams();
  if (params.tenantId) searchParams.set('tenant_id', params.tenantId);
  if (params.source) searchParams.set('source', params.source);
  if (params.status) searchParams.set('status', params.status);
  if (params.severity) searchParams.set('severity', params.severity);
  if (params.search) searchParams.set('search', params.search);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));

  const url = `${BASE}?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<ListErrorsResult>(response);
}

export async function getError(id: string): Promise<ErrorReport> {
  const response = await fetch(`${BASE}/${id}`, { headers: getHeaders() });
  const result = await handleResponse<{ error: ErrorReport }>(response);
  return result.error;
}

export async function updateErrorStatus(id: string, status: string): Promise<void> {
  const response = await fetch(`${BASE}/${id}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function triggerAutoFix(id: string): Promise<void> {
  const response = await fetch(`${BASE}/${id}/auto-fix`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}
