export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  defaultLocale: string;
  availableLocales: string[];
  country: string;
  timezone: string;
  currency: string;
  features: TenantFeatures;
  createdAt: string;
  updatedAt: string;
}

export interface TenantFeatures {
  claims: boolean;
  policies: boolean;
  underwriting: boolean;
  fwa: boolean;
  providers: boolean;
  reporting: boolean;
  aiAgents: boolean;
}
