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
  NdaTemplate,
  OverallStats,
  Round,
  RoundAnalytics,
  RoundStatus,
} from './types';

// ── Helpers ──

const BASE = '/auth/ir';

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

// ── Rounds ──

export interface ListRoundsParams {
  page?: number;
  limit?: number;
  status?: RoundStatus;
}

export async function listRounds(params?: ListRoundsParams): Promise<PaginatedResponse<Round>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const url = `${BASE}/rounds?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<Round>>(response);
}

export async function getRound(id: string): Promise<Round> {
  const response = await fetch(`${BASE}/rounds/${id}`, { headers: getHeaders() });
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
  const response = await fetch(`${BASE}/rounds`, {
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
  const response = await fetch(`${BASE}/rounds/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function deleteRound(id: string): Promise<void> {
  const response = await fetch(`${BASE}/rounds/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
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
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const url = `${BASE}/rounds/${roundId}/investors?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<InvestorRound>>(response);
}

export interface AddInvestorPayload {
  email: string;
  name: string;
  firm?: string;
  title?: string;
  skipNda?: boolean;
}

export async function addInvestorToRound(
  roundId: string,
  payload: AddInvestorPayload
): Promise<{ id: string; investorId: string }> {
  const response = await fetch(`${BASE}/rounds/${roundId}/investors`, {
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
  const response = await fetch(`${BASE}/rounds/${roundId}/investors/${investorRoundId}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function removeInvestorFromRound(
  roundId: string,
  investorRoundId: string
): Promise<void> {
  const response = await fetch(`${BASE}/rounds/${roundId}/investors/${investorRoundId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
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
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.category) searchParams.set('category', params.category);

  const url = `${BASE}/rounds/${roundId}/documents?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
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
  const response = await fetch(`${BASE}/rounds/${roundId}/documents`, {
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
  const response = await fetch(`${BASE}/documents/${docId}/upload-url`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ fileName, mimeType }),
  });
  return handleResponse<{ uploadUrl: string; s3Key: string }>(response);
}

/**
 * Upload a file directly to S3 using a presigned URL.
 */
export async function uploadFileToS3(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) {
    throw new Error('Failed to upload file to S3');
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
  const response = await fetch(`${BASE}/documents/${docId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

export async function deleteDocument(docId: string): Promise<void> {
  const response = await fetch(`${BASE}/documents/${docId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}

// ── NDA ──

export async function getActiveNda(roundId: string): Promise<NdaTemplate | null> {
  const response = await fetch(`${BASE}/rounds/${roundId}/nda`, { headers: getHeaders() });
  if (response.status === 404) return null;
  return handleResponse<NdaTemplate>(response);
}

export async function createNda(roundId: string, content: string): Promise<NdaTemplate> {
  const response = await fetch(`${BASE}/rounds/${roundId}/nda`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content }),
  });
  return handleResponse<NdaTemplate>(response);
}

// ── Analytics ──

export async function getRoundAnalytics(roundId: string): Promise<RoundAnalytics> {
  const response = await fetch(`${BASE}/rounds/${roundId}/analytics`, { headers: getHeaders() });
  return handleResponse<RoundAnalytics>(response);
}

// ── Engagement ──

export async function getRoundEngagement(roundId: string): Promise<InvestorEngagement[]> {
  const response = await fetch(`${BASE}/rounds/${roundId}/engagement`, { headers: getHeaders() });
  const result = await handleResponse<{ data: InvestorEngagement[] }>(response);
  return result.data;
}

// ── Access Logs ──

export interface ListAccessLogsParams {
  page?: number;
  limit?: number;
}

export async function getAccessLogs(
  roundId: string,
  params?: ListAccessLogsParams
): Promise<PaginatedResponse<AccessLog>> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const url = `${BASE}/rounds/${roundId}/access-logs?${searchParams.toString()}`;
  const response = await fetch(url, { headers: getHeaders() });
  return handleResponse<PaginatedResponse<AccessLog>>(response);
}

export async function exportAccessLogsCSV(roundId: string): Promise<void> {
  const response = await fetch(`${BASE}/rounds/${roundId}/access-logs/export`, {
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
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
  const response = await fetch(`${BASE}/stats`, { headers: getHeaders() });
  return handleResponse<OverallStats>(response);
}

// ── All Investors ──

export async function listAllInvestors(): Promise<Investor[]> {
  const response = await fetch(`${BASE}/investors`, { headers: getHeaders() });
  const result = await handleResponse<{ data: Investor[] }>(response);
  return result.data;
}

// ── Invitations ──

export async function sendInvitation(investorId: string): Promise<void> {
  const response = await fetch(`${BASE}/investors/${investorId}/invite`, {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as Record<string, unknown>).error ?? response.statusText;
    throw new Error(String(message));
  }
}
