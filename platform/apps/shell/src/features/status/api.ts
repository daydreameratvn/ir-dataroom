import type {
  StatusResponse,
  StatusIncident,
  StatusIncidentWithUpdates,
  IncidentUpdate,
  ServiceOverride,
} from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('accessToken');
  return token ? { Authorization: `Bearer ${token}`, ...JSON_HEADERS } : JSON_HEADERS;
}

// ── Public ──

export async function fetchStatus(): Promise<StatusResponse> {
  const resp = await fetch('/auth/status');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json() as Promise<StatusResponse>;
}

// ── Admin: Incidents ──

export async function listIncidents(params?: {
  status?: string;
  severity?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: StatusIncident[]; total: number; hasMore: boolean }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.severity) qs.set('severity', params.severity);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));

  const resp = await fetch(`/auth/incidents?${qs}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function createIncident(input: {
  title: string;
  description?: string;
  severity: string;
  affectedServices: string[];
  startedAt?: string;
}): Promise<StatusIncident> {
  const resp = await fetch('/auth/incidents', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function getIncident(id: string): Promise<StatusIncidentWithUpdates> {
  const resp = await fetch(`/auth/incidents/${id}`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function updateIncident(
  id: string,
  input: {
    title?: string;
    description?: string;
    severity?: string;
    affectedServices?: string[];
    status?: string;
  }
): Promise<StatusIncident> {
  const resp = await fetch(`/auth/incidents/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function postIncidentUpdate(
  id: string,
  input: { status: string; message: string }
): Promise<IncidentUpdate> {
  const resp = await fetch(`/auth/incidents/${id}/updates`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function resolveIncident(id: string): Promise<StatusIncident> {
  const resp = await fetch(`/auth/incidents/${id}/resolve`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function deleteIncident(id: string): Promise<void> {
  const resp = await fetch(`/auth/incidents/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

// ── Admin: Overrides ──

export async function listOverrides(): Promise<{ overrides: ServiceOverride[] }> {
  const resp = await fetch('/auth/incidents/overrides', { headers: authHeaders() });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function setOverride(input: {
  serviceName: string;
  status: string;
  reason?: string;
  startsAt?: string;
  endsAt?: string;
}): Promise<ServiceOverride> {
  const resp = await fetch('/auth/incidents/overrides', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

export async function clearOverride(serviceName: string): Promise<void> {
  const resp = await fetch(`/auth/incidents/overrides/${encodeURIComponent(serviceName)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}
