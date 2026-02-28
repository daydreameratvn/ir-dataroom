import { getAccessToken } from '@papaya/auth';
import type { UserType, UserLevel, PaginatedResponse } from '@papaya/shared-types';

// ── Types ──

export interface IdentityProvider {
  id: string;
  tenant_id: string;
  provider_type: string;
  display_name: string;
  domains: string[];
  auto_join_enabled: boolean;
  auto_join_user_type: UserType | null;
  auto_join_user_level: UserLevel | null;
  auto_offboard_enabled: boolean;
  admin_email: string | null;
  google_customer_id: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  trigger_type: string;
  triggered_by: string | null;
  status: string;
  users_fetched: number;
  users_created: number;
  users_updated: number;
  users_deactivated: number;
  users_skipped: number;
  errors_count: number;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
}

export interface CreateProviderPayload {
  providerType: string;
  displayName: string;
  domains?: string[];
  autoJoinEnabled?: boolean;
  autoJoinUserType?: UserType;
  autoJoinUserLevel?: UserLevel;
  autoOffboardEnabled?: boolean;
}

export interface UpdateProviderPayload {
  displayName?: string;
  domains?: string[];
  autoJoinEnabled?: boolean;
  autoJoinUserType?: UserType;
  autoJoinUserLevel?: UserLevel;
  autoOffboardEnabled?: boolean;
  isActive?: boolean;
}

export interface SyncResult {
  logId: string;
  status: string;
  counts: {
    usersFetched: number;
    usersCreated: number;
    usersUpdated: number;
    usersDeactivated: number;
    usersSkipped: number;
    errorsCount: number;
  };
}

// ── Helpers ──

const BASE = '/auth/admin/directory';

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

export async function listProviders(): Promise<IdentityProvider[]> {
  const response = await fetch(`${BASE}/providers`, { headers: getHeaders() });
  const result = await handleResponse<{ data: IdentityProvider[] }>(response);
  return result.data;
}

export async function createProvider(
  payload: CreateProviderPayload,
): Promise<IdentityProvider> {
  const response = await fetch(`${BASE}/providers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<IdentityProvider>(response);
}

export async function updateProvider(
  id: string,
  payload: UpdateProviderPayload,
): Promise<IdentityProvider> {
  const response = await fetch(`${BASE}/providers/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<IdentityProvider>(response);
}

export async function deleteProvider(id: string): Promise<void> {
  const response = await fetch(`${BASE}/providers/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function getGoogleConnectUrl(
  providerId: string,
): Promise<string> {
  const response = await fetch(
    `${BASE}/connect/google?provider_id=${providerId}`,
    { headers: getHeaders() },
  );
  const result = await handleResponse<{ url: string }>(response);
  return result.url;
}

export async function triggerSync(providerId: string): Promise<SyncResult> {
  const response = await fetch(`${BASE}/providers/${providerId}/sync`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return handleResponse<SyncResult>(response);
}

export async function listSyncLogs(
  providerId: string,
  page = 1,
  limit = 20,
): Promise<PaginatedResponse<SyncLog>> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const response = await fetch(
    `${BASE}/providers/${providerId}/logs?${params}`,
    { headers: getHeaders() },
  );
  return handleResponse<PaginatedResponse<SyncLog>>(response);
}
