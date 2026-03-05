import { getAccessToken } from '@papaya/auth';
import type { PaginatedResponse } from '@papaya/shared-types';
import type {
  AccessLog,
  Document,
  DocumentCategory,
  Investor,
  InvestorEngagement,
  InvestorRound,
  InvestorRoundStatus,
  NdaMode,
  NdaTemplate,
  OverallStats,
  RecentActivity,
  Round,
  RoundAnalytics,
  RoundDashboardStats,
  RoundStatus,
} from './types';

// ── Helpers ──

const BASE = '/auth/ir';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getHeaders(): HeadersInit {
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function irFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw new ApiError('Service unavailable — please try again later', 0);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error;

    if (!message && response.status >= 500) {
      throw new ApiError('Service unavailable — please try again later', response.status);
    }

    throw new ApiError(
      String(message ?? `Request failed (${response.status})`),
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

// ── Rounds ──

export interface ListRoundsParams {
  page?: number;
  limit?: number;
  status?: RoundStatus;
}

export async function listRounds(params?: ListRoundsParams): Promise<PaginatedResponse<Round>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('pageSize', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const url = `${BASE}/rounds?${searchParams.toString()}`;
  const response = await irFetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<Round>>(response);
}

export async function getRound(id: string): Promise<Round> {
  const response = await irFetch(`${BASE}/rounds/${id}`, { headers: getHeaders() });
  return handleResponse<Round>(response);
}

export interface CreateRoundPayload {
  name: string;
  slug: string;
  description?: string;
  targetRaise?: number;
  currency?: string;
  status?: RoundStatus;
}

export async function createRound(payload: CreateRoundPayload): Promise<{ id: string }> {
  const response = await irFetch(`${BASE}/rounds`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ id: string }>(response);
}

export interface UpdateRoundPayload {
  name?: string;
  slug?: string;
  description?: string | null;
  targetRaise?: number | null;
  currency?: string | null;
  status?: RoundStatus;
}

export async function updateRound(id: string, payload: UpdateRoundPayload): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  await handleResponse<void>(response);
}

export async function requestDeleteRoundOtp(id: string): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${id}/delete-otp`, {
    method: 'POST',
    headers: getHeaders(),
  });
  await handleResponse<void>(response);
}

export async function deleteRound(id: string, code: string): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ code }),
  });
  await handleResponse<void>(response);
}

// ── Round Investors ──

export interface ListRoundInvestorsParams {
  page?: number;
  limit?: number;
  status?: InvestorRoundStatus;
}

export async function listRoundInvestors(
  roundId: string,
  params?: ListRoundInvestorsParams
): Promise<PaginatedResponse<InvestorRound>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('pageSize', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const url = `${BASE}/rounds/${roundId}/investors?${searchParams.toString()}`;
  const response = await irFetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<InvestorRound>>(response);
}

export interface AddInvestorPayload {
  email: string;
  name: string;
  firm?: string;
  title?: string;
  ndaMode?: NdaMode;
}

export async function addInvestorToRound(
  roundId: string,
  payload: AddInvestorPayload
): Promise<{ id: string; investorId: string }> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/investors`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ id: string; investorId: string }>(response);
}

export async function updateInvestorStatus(
  roundId: string,
  investorRoundId: string,
  status: InvestorRoundStatus
): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/investors/${investorRoundId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  await handleResponse<void>(response);
}

export async function updateInvestorProfile(
  investorId: string,
  data: { name?: string; firm?: string; title?: string }
): Promise<void> {
  const response = await irFetch(`${BASE}/investors/${investorId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  await handleResponse<void>(response);
}

export async function removeInvestorFromRound(
  roundId: string,
  investorRoundId: string
): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/investors/${investorRoundId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse<void>(response);
}

// ── NDA Mode ──

export async function updateNdaMode(
  roundId: string,
  investorRoundId: string,
  ndaMode: NdaMode
): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/investors/${investorRoundId}/nda-mode`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ ndaMode }),
  });
  await handleResponse<void>(response);
}

// ── Documents ──

export interface ListDocumentsParams {
  page?: number;
  limit?: number;
  category?: DocumentCategory;
}

export async function listDocuments(
  roundId: string,
  params?: ListDocumentsParams
): Promise<PaginatedResponse<Document>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('pageSize', String(params.limit));
  if (params?.category) searchParams.set('category', params.category);

  const url = `${BASE}/rounds/${roundId}/documents?${searchParams.toString()}`;
  const response = await irFetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<Document>>(response);
}

export interface CreateDocumentPayload {
  name: string;
  description?: string;
  category: DocumentCategory;
  mimeType?: string;
  watermarkEnabled?: boolean;
}

export async function createDocument(
  roundId: string,
  payload: CreateDocumentPayload
): Promise<{ id: string; uploadUrl?: string }> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/documents`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<{ id: string; uploadUrl?: string }>(response);
}

export async function getDocumentUploadUrl(
  docId: string,
  fileName: string,
  mimeType: string
): Promise<{ uploadUrl: string; s3Key: string }> {
  const response = await irFetch(`${BASE}/documents/${docId}/upload-url`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ fileName, mimeType }),
  });
  return handleResponse<{ uploadUrl: string; s3Key: string }>(response);
}

/**
 * Upload a file via the auth server proxy (avoids S3 CORS issues).
 */
export async function uploadDocumentFile(docId: string, file: File): Promise<void> {
  const token = getAccessToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await irFetch(`${BASE}/documents/${docId}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  await handleResponse<void>(response);
}

/**
 * @deprecated Use uploadDocumentFile instead (proxied, avoids CORS).
 */
export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await irFetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) {
    throw new ApiError('Failed to upload file to S3', response.status);
  }
}

export interface UpdateDocumentPayload {
  name?: string;
  description?: string | null;
  category?: DocumentCategory;
  watermarkEnabled?: boolean;
  sortOrder?: number;
}

export async function updateDocument(
  docId: string,
  payload: UpdateDocumentPayload
): Promise<void> {
  const response = await irFetch(`${BASE}/documents/${docId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  await handleResponse<void>(response);
}

export async function deleteDocument(docId: string): Promise<void> {
  const response = await irFetch(`${BASE}/documents/${docId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse<void>(response);
}

// ── NDA ──

export async function getActiveNda(roundId: string): Promise<NdaTemplate | null> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/nda`, { headers: getHeaders() });
  if (response.status === 404) return null;
  return handleResponse<NdaTemplate>(response);
}

export async function createNda(roundId: string, content: string): Promise<NdaTemplate> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/nda`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content }),
  });
  return handleResponse<NdaTemplate>(response);
}

// ── Dashboard Stats ──

export async function getRoundDashboardStats(roundId: string): Promise<RoundDashboardStats> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/dashboard-stats`, { headers: getHeaders() });
  return handleResponse<RoundDashboardStats>(response);
}

// ── Analytics ──

export async function getRoundAnalytics(roundId: string): Promise<RoundAnalytics> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/analytics`, { headers: getHeaders() });
  return handleResponse<RoundAnalytics>(response);
}

// ── Engagement ──

export async function getRoundEngagement(roundId: string): Promise<InvestorEngagement[]> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/engagement`, { headers: getHeaders() });
  const result = await handleResponse<{ data: InvestorEngagement[] }>(response);
  return result.data;
}

// ── Access Logs ──

export interface ListAccessLogsParams {
  page?: number;
  limit?: number;
  action?: string;
}

export async function getAccessLogs(
  roundId: string,
  params?: ListAccessLogsParams
): Promise<PaginatedResponse<AccessLog>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('pageSize', String(params.limit));
  if (params?.action) searchParams.set('action', params.action);

  const url = `${BASE}/rounds/${roundId}/access-logs?${searchParams.toString()}`;
  const response = await irFetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<AccessLog>>(response);
}

export async function exportAccessLogsCSV(roundId: string): Promise<void> {
  const response = await irFetch(`${BASE}/rounds/${roundId}/access-logs/export`, {
    headers: getHeaders(),
  });
  if (!response.ok) {
    await handleResponse<void>(response);
    return;
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `access-logs-${roundId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ── Stats ──

export async function getStats(): Promise<OverallStats> {
  const response = await irFetch(`${BASE}/stats`, { headers: getHeaders() });
  return handleResponse<OverallStats>(response);
}

// ── All Investors ──

export async function listAllInvestors(): Promise<Investor[]> {
  const response = await irFetch(`${BASE}/investors`, { headers: getHeaders() });
  const result = await handleResponse<{ data: Investor[] }>(response);
  return result.data;
}

// ── Invitations ──

export async function sendInvitation(investorId: string): Promise<void> {
  const response = await irFetch(`${BASE}/investors/${investorId}/invite`, {
    method: 'POST',
    headers: getHeaders(),
  });
  await handleResponse<void>(response);
}

// ── Recent Activity ──

export async function getRecentActivity(limit = 20): Promise<RecentActivity[]> {
  const response = await irFetch(`${BASE}/recent-activity?limit=${limit}`, {
    headers: getHeaders(),
  });
  const result = await handleResponse<{ data: RecentActivity[] }>(response);
  return result.data;
}
