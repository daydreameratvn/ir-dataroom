import type { User } from '@papaya/shared-types';

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
export function getSSOUrl(provider: string, tenantId: string, returnUrl = '/'): string {
  return `${_authBaseUrl}/sso/${provider}?tenant_id=${encodeURIComponent(tenantId)}&return_url=${encodeURIComponent(returnUrl)}`;
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
): Promise<{ challengeKey: string; [key: string]: unknown }> {
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
): Promise<Record<string, unknown>> {
  return authRequest('/passkey/register/options', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function verifyPasskeyRegister(
  response: unknown,
  accessToken: string,
): Promise<{ success: boolean }> {
  return authRequest('/passkey/register/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(response),
  });
}

// Token
export async function refreshAccessToken(): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/token/refresh', {
    method: 'POST',
  });
}

export async function revokeToken(accessToken: string): Promise<void> {
  await authRequest('/token/revoke', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
