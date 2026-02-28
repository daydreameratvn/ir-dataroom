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

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
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
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<AdminUser>>(response);
}

export async function getUser(id: string): Promise<AdminUser> {
  const response = await fetch(`${BASE}/users/${id}`, { headers: getHeaders() });
  return handleResponse<AdminUser>(response);
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const response = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminUser>(response);
}

export async function updateUser(id: string, payload: UpdateUserPayload): Promise<AdminUser> {
  const response = await fetch(`${BASE}/users/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminUser>(response);
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`${BASE}/users/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function listTenants(): Promise<Tenant[]> {
  const response = await fetch(`${BASE}/tenants`, { headers: getHeaders() });
  const result = await handleResponse<{ data: Tenant[] }>(response);
  return result.data;
}

export async function setUserImpersonatable(userId: string, impersonatable: boolean): Promise<void> {
  const response = await fetch(`${BASE}/users/${userId}/impersonatable`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ impersonatable }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function setUserCanImpersonate(userId: string, canImpersonate: boolean): Promise<void> {
  const response = await fetch(`${BASE}/users/${userId}/can-impersonate`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ canImpersonate }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}
