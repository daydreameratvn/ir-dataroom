import { getAccessToken } from '@papaya/auth';
import type { PaginatedResponse } from '@papaya/shared-types';

// ── Types ──

export interface ActivityLog {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name?: string;
  actor_email?: string;
}

export interface ListActivityLogsParams {
  action?: string;
  resource_type?: string;
  page?: number;
  limit?: number;
}

// ── Helpers ──

const BASE = '/auth/admin/activity-logs';

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

export async function listActivityLogs(
  params: ListActivityLogsParams,
): Promise<PaginatedResponse<ActivityLog>> {
  const searchParams = new URLSearchParams();
  if (params.action) searchParams.set('action', params.action);
  if (params.resource_type) searchParams.set('resource_type', params.resource_type);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));

  const response = await fetch(`${BASE}?${searchParams.toString()}`, {
    headers: getHeaders(),
  });
  return handleResponse<PaginatedResponse<ActivityLog>>(response);
}
