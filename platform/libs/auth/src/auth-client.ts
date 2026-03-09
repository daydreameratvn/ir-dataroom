import type { User, UserPreferences } from '@papaya/shared-types';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

let _authBaseUrl = '/auth';

export function configureAuthClient(baseUrl: string) {
  _authBaseUrl = baseUrl;
}

interface AuthResponse {
  accessToken: string;
  expiresAt: string;
  user: User;
}

async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optionHeaders, ...restOptions } = options ?? {};

  let response: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(`${_authBaseUrl}${path}`, {
        credentials: 'include',
        ...restOptions,
        headers: {
          'Content-Type': 'application/json',
          ...(optionHeaders as Record<string, string>),
        },
      });
      // Retry once on 503 (transient server issue / ECS rollout)
      if (response.status === 503 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      // CloudFront can convert API 403/404 into 200+HTML — retry once
      const ct = response.headers.get('content-type') ?? '';
      if (response.ok && !ct.includes('application/json') && ct.includes('text/html') && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      break;
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      // Network error — server is completely unreachable
      throw new AuthError('Service unavailable — please try again later', 0);
    }
  }
  if (!response) {
    throw new AuthError('Service unavailable — please try again later', 0);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const serverMessage = (body as Record<string, string>).error;

    // If no server message and 5xx, the response isn't from our auth server
    // (likely proxy error when auth server is down)
    if (!serverMessage && response.status >= 500) {
      throw new AuthError('Service unavailable — please try again later', response.status);
    }

    throw new AuthError(
      serverMessage || `Request failed (${response.status})`,
      response.status,
    );
  }

  // Guard against non-JSON responses (e.g., CloudFront returning HTML for 403/404)
  const resCt = response.headers.get('content-type') ?? '';
  if (!resCt.includes('application/json')) {
    throw new AuthError('Service unavailable — please try again later', 0);
  }

  return response.json() as Promise<T>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// SSO
export function getSSOUrl(provider: string, tenantId: string, returnUrl?: string): string {
  const url = returnUrl ?? `${window.location.origin}/`;
  return `${_authBaseUrl}/sso/${provider}?tenant_id=${encodeURIComponent(tenantId)}&return_url=${encodeURIComponent(url)}`;
}

// OTP
export async function requestEmailOtp(
  email: string,
  tenantId: string,
): Promise<{ success: boolean; message: string }> {
  return authRequest('/otp/email', {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify({ email }),
  });
}

export async function requestPhoneOtp(
  phone: string,
  tenantId: string,
): Promise<{ success: boolean; message: string }> {
  return authRequest('/otp/phone', {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOtp(
  destination: string,
  code: string,
  tenantId: string,
): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/otp/verify', {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify({ destination, code }),
  });
}

// Passkey
export async function getPasskeyLoginOptions(
  tenantId: string,
): Promise<PublicKeyCredentialRequestOptionsJSON & { challengeKey: string }> {
  return authRequest('/passkey/login/options', {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify({}),
  });
}

export async function verifyPasskeyLogin(
  challengeKey: string,
  response: unknown,
  tenantId: string,
): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/passkey/login/verify', {
    method: 'POST',
    headers: { 'x-tenant-id': tenantId },
    body: JSON.stringify({ challengeKey, response }),
  });
}

export async function getPasskeyRegisterOptions(
  accessToken: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return authRequest('/passkey/register/options', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function verifyPasskeyRegister(
  response: unknown,
  accessToken: string,
  deviceName?: string,
): Promise<{ success: boolean }> {
  return authRequest('/passkey/register/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ...response as Record<string, unknown>, deviceName }),
  });
}

export interface PasskeyInfo {
  id: string;
  credentialId: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export async function listPasskeys(
  accessToken: string,
): Promise<{ passkeys: PasskeyInfo[] }> {
  return authRequest('/passkey/list', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function deletePasskey(
  passkeyId: string,
  accessToken: string,
): Promise<{ success: boolean }> {
  return authRequest(`/passkey/${passkeyId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function renamePasskey(
  passkeyId: string,
  deviceName: string,
  accessToken: string,
): Promise<{ success: boolean }> {
  return authRequest(`/passkey/${passkeyId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ deviceName }),
  });
}

// Preferences
export async function getPreferences(accessToken: string): Promise<UserPreferences> {
  return authRequest<UserPreferences>('/me/preferences', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function updatePreferences(
  patch: Partial<UserPreferences>,
  accessToken: string,
): Promise<UserPreferences> {
  return authRequest<UserPreferences>('/me/preferences', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(patch),
  });
}

// Token
interface RefreshResponse extends AuthResponse {
  impersonation?: { impersonatorId: string; impersonatorName: string };
}

export async function refreshAccessToken(): Promise<RefreshResponse> {
  return authRequest<RefreshResponse>('/token/refresh', {
    method: 'POST',
  });
}

export async function revokeToken(accessToken: string): Promise<void> {
  await authRequest('/token/revoke', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// Impersonation
export async function startImpersonation(
  userId: string,
  token: string,
): Promise<{
  accessToken: string;
  expiresAt: string;
  user: User;
  impersonation: { impersonatorId: string; impersonatorName: string };
}> {
  return authRequest(`/admin/impersonate/${userId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function endImpersonation(token: string): Promise<void> {
  await authRequest<Record<string, never>>('/admin/impersonate/end', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}
