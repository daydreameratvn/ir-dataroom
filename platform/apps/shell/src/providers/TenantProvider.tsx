import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Tenant } from '@papaya/shared-types';
import { i18n } from '@papaya/i18n';

interface TenantContextValue {
  tenant: Tenant;
  setTenant: (tenant: Tenant) => void;
}

const defaultTenant: Tenant = {
  id: 'papaya-demo',
  slug: 'papaya-demo',
  name: 'Papaya',
  logoUrl: undefined,
  faviconUrl: undefined,
  primaryColor: undefined,
  defaultLocale: 'en',
  availableLocales: ['en', 'th', 'zh', 'vi'],
  country: 'TH',
  timezone: 'Asia/Bangkok',
  currency: 'THB',
  features: {
    claims: true,
    policies: true,
    underwriting: true,
    fwa: true,
    providers: true,
    reporting: true,
    aiAgents: true,
    ir: true,
  },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}

export interface TenantProviderProps {
  children: ReactNode;
}

/**
 * Updates the document favicon with the tenant's custom favicon URL.
 */
function applyFavicon(faviconUrl: string | undefined) {
  const defaultFavicon = '/favicon.ico';
  const url = faviconUrl || defaultFavicon;

  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

/**
 * Updates the document title with the tenant name.
 */
function applyDocumentTitle(tenantName: string) {
  document.title = `${tenantName} | Oasis`;
}

export default function TenantProvider({ children }: TenantProviderProps) {
  const [tenant, setTenant] = useState<Tenant>(defaultTenant);

  // Sync tenant's default locale to i18n when tenant changes,
  // but only if the user hasn't already chosen a language (stored in localStorage).
  useEffect(() => {
    try {
      const userChose = localStorage.getItem('i18nextLng');
      if (!userChose && tenant.defaultLocale && i18n.language !== tenant.defaultLocale) {
        i18n.changeLanguage(tenant.defaultLocale);
      }
    } catch { /* localStorage unavailable */ }
  }, [tenant.defaultLocale]);

  // Apply tenant branding when tenant changes
  useEffect(() => {
    applyFavicon(tenant.faviconUrl);
    applyDocumentTitle(tenant.name);
  }, [tenant.faviconUrl, tenant.name]);

  return (
    <TenantContext.Provider value={{ tenant, setTenant }}>
      {children}
    </TenantContext.Provider>
  );
}
