const BASE = '/auth/phoenix';
const TOKEN_KEY = 'phoenix_token';
const ACTIVE_POLICY_KEY = 'phoenix_active_policy';

function getToken(): string | null {
  const active = localStorage.getItem(ACTIVE_POLICY_KEY);
  if (!active) return null;
  return localStorage.getItem(`${TOKEN_KEY}_${active}`);
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem(ACTIVE_POLICY_KEY);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ── Auth ──

export interface PolicyInfo {
  id: string;
  policyNumber: string;
  insuredName: string;
  status: string;
}

export interface LoginResult {
  policyNumber: string;
  success: boolean;
  message?: string;
  token?: string;
  policy?: PolicyInfo;
}

export async function login(policyNumbers: string[]): Promise<LoginResult[]> {
  const res = await apiFetch<{ results: LoginResult[] }>('/login', {
    method: 'POST',
    body: JSON.stringify({ policyNumbers }),
  });
  return res.results;
}

export interface RefreshTokenResponse {
  token: string;
}

export function refreshToken(): Promise<RefreshTokenResponse> {
  return apiFetch('/token/refresh', { method: 'POST' });
}

// ── Claims ──

export interface Claim {
  id: string;
  claimNumber: string;
  status: string;
  claimantName: string;
  providerName: string | null;
  amountClaimed: number;
  amountApproved: number | null;
  amountPaid: number | null;
  currency: string;
  dateOfLoss: string | null;
  dateOfService: string | null;
  createdAt: string;
}

export interface ClaimDocument {
  id: string;
  fileName: string;
  fileType: string | null;
  fileUrl: string;
  fileSizeBytes: number | null;
  documentType: string | null;
  createdAt: string;
}

export interface ClaimNote {
  id: string;
  content: string;
  noteType: string;
  agentName: string | null;
  createdAt: string;
}

export interface ClaimDetail extends Claim {
  documents: ClaimDocument[];
  notes: ClaimNote[];
  aiSummary: string | null;
  aiRecommendation: string | null;
}

export async function listClaims(): Promise<Claim[]> {
  const result = await apiFetch<{ data: Claim[] }>('/claims');
  return result.data;
}

export function getClaimDetail(claimId: string): Promise<ClaimDetail> {
  return apiFetch(`/claims/${encodeURIComponent(claimId)}`);
}

export interface CreateClaimInput {
  claimantName: string;
  amountClaimed: number;
  currency?: string;
  dateOfLoss?: string;
  dateOfService?: string;
  providerName?: string;
}

export function createClaim(data: CreateClaimInput): Promise<Claim> {
  return apiFetch('/claims', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface UploadDocResult {
  uploadUrl: string;
  document: ClaimDocument;
}

export function getUploadUrl(
  claimId: string,
  data: { fileName: string; fileType: string; documentType?: string },
): Promise<UploadDocResult> {
  return apiFetch(`/claims/${encodeURIComponent(claimId)}/documents`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function requestOtp(claimId: string): Promise<{ success: boolean }> {
  return apiFetch(`/claims/${encodeURIComponent(claimId)}/otp/request`, {
    method: 'POST',
  });
}

export function verifyOtp(
  claimId: string,
  code: string,
): Promise<{ success: boolean; verified: boolean }> {
  return apiFetch(`/claims/${encodeURIComponent(claimId)}/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
