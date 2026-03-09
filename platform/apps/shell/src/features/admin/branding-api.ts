import { getAccessToken } from '@papaya/auth';

export interface TenantBranding {
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
}

export async function getTenantBranding(): Promise<TenantBranding> {
  const token = getAccessToken();
  const res = await fetch(`/auth/admin/tenant/branding`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    console.warn(`[branding-api] GET /auth/admin/tenant/branding failed: ${res.status} ${res.statusText}`);
    return {
      logoUrl: '',
      faviconUrl: '',
      primaryColor: '#ED1B55',
    };
  }

  return res.json();
}

export async function updateTenantBranding(
  branding: TenantBranding,
): Promise<{ success: boolean }> {
  const token = getAccessToken();
  const res = await fetch(`/auth/admin/tenant/branding`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(branding),
  });

  if (!res.ok) {
    throw new Error('Failed to update branding');
  }

  return res.json();
}
