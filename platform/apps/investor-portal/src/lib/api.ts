const BASE = '/auth/ir/portal';
const TOKEN_KEY = 'investor_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
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
    // Token expired or invalid — clear and redirect to login
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('investor_info');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

/** Like apiFetch but returns the raw Response for header access */
async function apiFetchRaw(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
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
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('investor_info');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }

  return res;
}

// ── Auth ──

export interface InvestorInfo {
  id: string;
  email: string;
  name: string;
  firm: string | null;
}

export interface VerifyOtpResponse {
  token: string;
  investor: InvestorInfo;
}

export interface RefreshTokenResponse {
  token: string;
}

export function requestOtp(email: string): Promise<void> {
  return apiFetch('/otp/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function verifyOtp(
  email: string,
  code: string,
): Promise<VerifyOtpResponse> {
  return apiFetch('/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export function refreshToken(): Promise<RefreshTokenResponse> {
  return apiFetch('/token/refresh', { method: 'POST' });
}

// ── Rounds ──

export interface Round {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  targetRaise: number | null;
  currency: string | null;
  startedAt: string | null;
  closedAt: string | null;
}

export interface InvestorRound {
  id: string;
  investorId: string;
  roundId: string;
  status: string;
  ndaRequired: boolean;
  ndaTemplateId: string | null;
  ndaAcceptedAt: string | null;
  lastAccessAt: string | null;
  accessCount: number;
}

export interface RoundDetail {
  round: Round;
  investorRound: InvestorRound;
  ndaRequired: boolean;
  ndaAccepted: boolean;
  ndaTemplate: { id: string; content: string; version: number } | null;
}

export async function listRounds(): Promise<Round[]> {
  const result = await apiFetch<{ data: Round[] }>('/rounds');
  return result.data;
}

export function getRound(slug: string): Promise<RoundDetail> {
  return apiFetch(`/rounds/${encodeURIComponent(slug)}`);
}

export function acceptNda(slug: string): Promise<void> {
  return apiFetch(`/rounds/${encodeURIComponent(slug)}/nda/accept`, {
    method: 'POST',
  });
}

export interface NdaDownload {
  content: string;
  version: number;
  acceptedAt: string;
  investorName: string;
  investorEmail: string;
  ipAddress: string | null;
}

export function downloadNda(slug: string): Promise<NdaDownload> {
  return apiFetch(`/rounds/${encodeURIComponent(slug)}/nda/download`);
}

// ── Documents ──

export interface Document {
  id: string;
  name: string;
  description: string | null;
  category: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  s3Key: string | null;
  sortOrder: number;
  watermarkEnabled: boolean;
  createdAt: string;
}

export interface DocumentUrlResponse {
  url: string | null;
  document: Document;
  accessLogId?: string;
}

export async function listDocuments(
  slug: string,
  category?: string,
): Promise<Document[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  const result = await apiFetch<{ data: Document[] }>(
    `/rounds/${encodeURIComponent(slug)}/documents${params}`,
  );
  return result.data;
}

export async function getDocumentViewUrl(
  slug: string,
  docId: string,
): Promise<DocumentUrlResponse> {
  const res = await apiFetchRaw(
    `/rounds/${encodeURIComponent(slug)}/documents/${encodeURIComponent(docId)}/view`,
  );

  const accessLogId = res.headers.get('X-Access-Log-Id') ?? undefined;
  const body = (await res.json()) as { url: string | null; document: Document };

  return {
    ...body,
    accessLogId,
  };
}

export function getDocumentDownloadUrl(
  slug: string,
  docId: string,
): Promise<DocumentUrlResponse> {
  return apiFetch(
    `/rounds/${encodeURIComponent(slug)}/documents/${encodeURIComponent(docId)}/download`,
  );
}

export function trackView(
  accessLogId: string,
  durationSeconds: number,
): Promise<void> {
  return apiFetch('/tracking', {
    method: 'POST',
    body: JSON.stringify({ accessLogId, durationSeconds }),
  });
}
