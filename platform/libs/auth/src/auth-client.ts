import type { User } from '@papaya/shared-types';
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
  const response = await fetch(`${_authBaseUrl}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new AuthError(
      (body as Record<string, string>).error || `Auth error: ${response.status}`,
      response.status,
    );
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
  const res = await fetch(`${_authBaseUrl}/admin/impersonate/${userId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as Record<string, string>).error || 'Impersonation failed');
  }
  return res.json();
}

export async function endImpersonation(token: string): Promise<void> {
  await fetch(`${_authBaseUrl}/admin/impersonate/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
}
