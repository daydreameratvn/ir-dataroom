import { getAccessToken } from '@papaya/auth';
import type { PaginatedResponse } from '@papaya/shared-types';

// ── Types ──

export type MemberStatus = 'invited' | 'active' | 'suspended' | 'removed';
export type MemberSource = 'manual' | 'csv' | 'google_workspace' | 'microsoft_365' | 'domain_auto_admit';

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string;
  status: MemberStatus;
  source: MemberSource;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  inviter_name?: string;
}

export interface InviteMembersPayload {
  emails: string[];
  source?: MemberSource;
}

export interface InviteMembersResult {
  invited: number;
  skipped: number;
  errors: string[];
}

export interface ListMembersParams {
  search?: string;
  status?: MemberStatus;
  source?: MemberSource;
  page?: number;
  limit?: number;
}

// ── Helpers ──

const BASE = '/auth/admin/members';

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

export async function listMembers(params: ListMembersParams): Promise<PaginatedResponse<TenantMember>> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.status) searchParams.set('status', params.status);
  if (params.source) searchParams.set('source', params.source);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));

  const response = await fetch(`${BASE}?${searchParams.toString()}`, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<TenantMember>>(response);
}

export async function inviteMembers(payload: InviteMembersPayload): Promise<InviteMembersResult> {
  const response = await fetch(`${BASE}/invite`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<InviteMembersResult>(response);
}

export async function importMembersFromCsv(emails: string[]): Promise<InviteMembersResult> {
  const response = await fetch(`${BASE}/import`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ emails, source: 'csv' }),
  });
  return handleResponse<InviteMembersResult>(response);
}

export async function updateMemberStatus(
  memberId: string,
  status: MemberStatus,
): Promise<TenantMember> {
  const response = await fetch(`${BASE}/${memberId}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  return handleResponse<TenantMember>(response);
}

export async function removeMember(memberId: string): Promise<void> {
  const response = await fetch(`${BASE}/${memberId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}
