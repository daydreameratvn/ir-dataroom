import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { initI18n } from '@papaya/i18n';
import TenantProvider from '@/providers/TenantProvider';
import AuthProvider from '@/providers/AuthProvider';

// Initialize i18n synchronously for tests
let i18nReady = false;
export async function ensureI18n() {
  if (!i18nReady) {
    await initI18n();
    i18nReady = true;
  }
}

interface TestWrapperProps {
  children: ReactNode;
  initialEntries?: string[];
}

export default function TestWrapper({ children, initialEntries = ['/'] }: TestWrapperProps) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <TenantProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </TenantProvider>
    </MemoryRouter>
  );
}
