import { getAccessToken } from '@papaya/auth';
import type {
  ListClaimsParams,
  PaginatedClaims,
  PortalClaim,
  PortalDashboardStats,
  FWACasesResponse,
  FWACase,
  FWAAnalyticsData,
  FWAGroupBy,
  BenefitGroup,
} from './types';

// ── Helpers ──

const BASE = '/auth/portal';

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

// ── Dashboard ──

export async function getDashboardStats(): Promise<PortalDashboardStats> {
  const response = await fetch(`${BASE}/stats`, { headers: getHeaders() });
  return handleResponse<PortalDashboardStats>(response);
}

// ── Claims ──

export async function listClaims(params: ListClaimsParams): Promise<PaginatedClaims> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.status) searchParams.set('status', params.status);
  if (params.search) searchParams.set('search', params.search);

  const url = `${BASE}/claims?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedClaims>(response);
}

export async function getClaim(id: string): Promise<PortalClaim> {
  const response = await fetch(`${BASE}/claims/${id}`, { headers: getHeaders() });
  return handleResponse<PortalClaim>(response);
}

export async function createClaim(formData: FormData): Promise<{ id: string; claimNumber: string }> {
  const token = getAccessToken();
  const response = await fetch(`${BASE}/claims`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // No Content-Type — browser sets multipart boundary automatically
    },
    body: formData,
  });
  return handleResponse<{ id: string; claimNumber: string }>(response);
}

export async function reprocessClaim(id: string): Promise<void> {
  const response = await fetch(`${BASE}/claims/${id}/reprocess`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String((body as Record<string, unknown>).error ?? response.statusText));
  }
}

export async function saveExpenses(
  claimId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${BASE}/claims/${claimId}/expenses`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String((body as Record<string, unknown>).error ?? response.statusText));
  }
}

export async function saveBenefitGrouping(
  claimId: string,
  data: { benefitGroups: BenefitGroup[] },
): Promise<void> {
  const response = await fetch(`${BASE}/claims/${claimId}/benefit-grouping`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String((body as Record<string, unknown>).error ?? response.statusText));
  }
}

// ── Approval ──

export async function approveClaim(id: string, notes?: string): Promise<void> {
  const response = await fetch(`${BASE}/claims/${id}/approve`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String((body as Record<string, unknown>).error ?? response.statusText));
  }
}

export async function rejectClaim(id: string, reason: string): Promise<void> {
  const response = await fetch(`${BASE}/claims/${id}/reject`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String((body as Record<string, unknown>).error ?? response.statusText));
  }
}

// ── Documents ──

export function getDocumentFileUrl(documentId: string): string {
  const token = getAccessToken();
  return `${BASE}/documents/${documentId}${token ? `?token=${token}` : ''}`;
}

// ── Analytics ──

export async function getAnalytics(): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}/analytics`, { headers: getHeaders() });
  return handleResponse<Record<string, unknown>>(response);
}

export async function getFWAAnalytics(params?: {
  from?: string;
  to?: string;
  groupBy?: FWAGroupBy;
}): Promise<FWAAnalyticsData> {
  const searchParams = new URLSearchParams();
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);
  const qs = searchParams.toString();
  const url = `${BASE}/fwa-analytics${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<FWAAnalyticsData>(response);
}

// ── FWA Cases ──

export async function listFWACases(): Promise<FWACasesResponse> {
  const response = await fetch(`${BASE}/fwa-cases`, { headers: getHeaders() });
  return handleResponse<FWACasesResponse>(response);
}

export async function getFWACase(id: string): Promise<FWACase> {
  const response = await fetch(`${BASE}/fwa-cases/${id}`, { headers: getHeaders() });
  return handleResponse<FWACase>(response);
}

export async function createFWACase(data: {
  entityType: string;
  entityId: string;
  claimIds: string[];
}): Promise<{ id: string }> {
  const response = await fetch(`${BASE}/fwa-cases`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<{ id: string }>(response);
}

export async function getClaimFWACaseLink(claimId: string): Promise<{
  hasCase: boolean;
  caseId: string | null;
  caseStatus: string | null;
}> {
  const response = await fetch(`${BASE}/claims/${claimId}/fwa-case-link`, { headers: getHeaders() });
  return handleResponse(response);
}

export async function flagClaimForReview(claimId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${BASE}/claims/${claimId}/flag-for-review`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handleResponse(response);
}

export async function deleteFWACase(id: string): Promise<void> {
  const response = await fetch(`${BASE}/fwa-cases/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(String((body as Record<string, unknown>).error ?? response.statusText));
  }
}
