let _baseUrl = '/api';
let _tokenAccessor: (() => string | null) | null = null;

export function configureApiClient(baseUrl: string) {
  _baseUrl = baseUrl;
}

export function setTokenAccessor(accessor: () => string | null) {
  _tokenAccessor = accessor;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = _tokenAccessor?.();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const response = await fetch(`${_baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
