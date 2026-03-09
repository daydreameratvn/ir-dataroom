import { getAccessToken } from '@papaya/auth';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export interface TenantBranding {
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
}

export async function getTenantBranding(): Promise<TenantBranding> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/api/tenant/branding`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    console.warn(`[branding-api] GET /api/tenant/branding failed: ${res.status} ${res.statusText}`);
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
  const res = await fetch(`${API_BASE}/api/tenant/branding`, {
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
