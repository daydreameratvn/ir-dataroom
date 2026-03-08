import { getAccessToken } from '@papaya/auth';

// ── Types ──

export interface TenantDomain {
  id: string;
  tenant_id: string;
  domain: string;
  verified: boolean;
  auto_admit: boolean;
  verification_token: string | null;
  created_at: string;
}

export interface AddDomainPayload {
  domain: string;
}

// ── Helpers ──

const BASE = '/auth/admin/domains';

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

// ── API functions ──

export async function listDomains(): Promise<TenantDomain[]> {
  const response = await fetch(BASE, { headers: getHeaders() });
  const result = await handleResponse<{ data: TenantDomain[] }>(response);
  return result.data;
}

export async function addDomain(payload: AddDomainPayload): Promise<TenantDomain> {
  const response = await fetch(BASE, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<TenantDomain>(response);
}

export async function verifyDomain(domainId: string): Promise<TenantDomain> {
  const response = await fetch(`${BASE}/${domainId}/verify`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handleResponse<TenantDomain>(response);
}

export async function updateDomainAutoAdmit(
  domainId: string,
  autoAdmit: boolean,
): Promise<TenantDomain> {
  const response = await fetch(`${BASE}/${domainId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ auto_admit: autoAdmit }),
  });
  return handleResponse<TenantDomain>(response);
}

export async function deleteDomain(domainId: string): Promise<void> {
  const response = await fetch(`${BASE}/${domainId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}
