// Access token is stored in memory only — never in localStorage or sessionStorage.
// Refresh token is managed as an httpOnly cookie by the auth service.

let accessToken: string | null = null;
let expiresAt: number | null = null;
let tokenChangeListeners: Array<(token: string | null) => void> = [];

export function getAccessToken(): string | null {
  if (accessToken && expiresAt && Date.now() < expiresAt) {
    return accessToken;
  }
  // Token expired
  if (accessToken) {
    clearAccessToken();
  }
  return null;
}

export function setAccessToken(token: string, expiresAtIso: string): void {
  accessToken = token;
  expiresAt = new Date(expiresAtIso).getTime();
  notifyListeners(token);
}

export function clearAccessToken(): void {
  accessToken = null;
  expiresAt = null;
  notifyListeners(null);
}

export function isTokenValid(): boolean {
  return accessToken !== null && expiresAt !== null && Date.now() < expiresAt;
}

export function getTimeUntilExpiry(): number {
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - Date.now());
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  tokenChangeListeners.push(listener);
  return () => {
    tokenChangeListeners = tokenChangeListeners.filter((l) => l !== listener);
  };
}

function notifyListeners(token: string | null) {
  for (const listener of tokenChangeListeners) {
    listener(token);
  }
}

// Extract access token from URL fragment (used after SSO redirect)
export function extractTokenFromHash(): { token: string } | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.slice(1));
  const token = params.get('access_token');

  if (token) {
    // Clean the hash from URL
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return { token };
  }

  return null;
}
