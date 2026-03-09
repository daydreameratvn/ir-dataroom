import { getAccessToken } from '@papaya/auth';
import type { User, UserType, UserLevel, Tenant, PaginatedResponse } from '@papaya/shared-types';

// ── Extended user type returned by admin API ──

export interface AdminUser extends User {
  phone?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  createdByName?: string;
}

// ── Request types ──

export interface CreateUserPayload {
  tenantId?: string;
  email: string;
  name: string;
  phone?: string;
  userType: UserType;
  userLevel: UserLevel;
  title?: string;
  department?: string;
  locale?: string;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  phone?: string;
  userType?: UserType;
  userLevel?: UserLevel;
  title?: string;
  department?: string;
  locale?: string;
}

export interface ListUsersParams {
  tenantId?: string;
  search?: string;
  userType?: UserType;
  userLevel?: UserLevel;
  page?: number;
  limit?: number;
}

// ── Helpers ──

const BASE = '/auth/admin';

function getHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function adminFetch(url: string, options?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, options);
      // Retry once on 503 (transient server issue / ECS rollout)
      if (res.status === 503 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      // CloudFront can convert API 403/404 into 200+HTML — retry once
      const ct = res.headers.get('content-type') ?? '';
      if (res.ok && !ct.includes('application/json') && ct.includes('text/html') && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      return res;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new Error('Service unavailable — please try again later');
    }
  }
  throw new Error('Service unavailable — please try again later');
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error;

    if (!message && response.status >= 500) {
      throw new Error('Service unavailable — please try again later');
    }

    throw new Error(String(message ?? `Request failed (${response.status})`));
  }
  // Guard against non-JSON responses (e.g., CloudFront returning HTML for 403/404)
  const ct = response.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) {
    throw new Error('Service unavailable — please try again later');
  }
  return response.json() as Promise<T>;
}

// ── API functions ──

export async function listUsers(params: ListUsersParams): Promise<PaginatedResponse<AdminUser>> {
  const searchParams = new URLSearchParams();
  if (params.tenantId) searchParams.set('tenant_id', params.tenantId);
  if (params.search) searchParams.set('search', params.search);
  if (params.userType) searchParams.set('user_type', params.userType);
  if (params.userLevel) searchParams.set('user_level', params.userLevel);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));

  const url = `${BASE}/users?${searchParams.toString()}`;
  const response = await adminFetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<AdminUser>>(response);
}

export async function getUser(id: string): Promise<AdminUser> {
  const response = await adminFetch(`${BASE}/users/${id}`, { headers: getHeaders() });
  return handleResponse<AdminUser>(response);
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const response = await adminFetch(`${BASE}/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminUser>(response);
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUser> {
  const response = await adminFetch(`${BASE}/users/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminUser>(response);
}

export async function deleteUser(id: string): Promise<void> {
  const response = await adminFetch(`${BASE}/users/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse<void>(response);
}

export async function listTenants(): Promise<Tenant[]> {
  const response = await adminFetch(`${BASE}/tenants`, { headers: getHeaders() });
  const result = await handleResponse<{ data: Tenant[] }>(response);
  return result.data;
}

export async function setUserImpersonatable(userId: string, impersonatable: boolean): Promise<void> {
  const response = await adminFetch(`${BASE}/users/${userId}/impersonatable`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ impersonatable }),
  });
  await handleResponse<void>(response);
}

export async function revokeUserSessions(userId: string): Promise<void> {
  const response = await fetch(`${BASE}/users/${userId}/revoke-sessions`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function setUserCanImpersonate(userId: string, canImpersonate: boolean): Promise<void> {
  const response = await adminFetch(`${BASE}/users/${userId}/can-impersonate`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ canImpersonate }),
  });
  await handleResponse<void>(response);
}
