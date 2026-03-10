'use client';

import { PhoenixProvider } from '@papaya/phoenix-react';
import { PHOENIX_ENVIRONMENT, GRAPHQL_URL_OVERRIDE, POLICY_NUMBERS, TENANT_ID } from '@/lib/config';

export function PhoenixSetup({ children }: { children: React.ReactNode }) {
  return (
    <PhoenixProvider
      config={{ environment: PHOENIX_ENVIRONMENT, graphqlUrl: GRAPHQL_URL_OVERRIDE }}
      tenantId={TENANT_ID}
      policyNumbers={POLICY_NUMBERS}
      locale="en"
    >
      {children as any}
    </PhoenixProvider>
  );
}
