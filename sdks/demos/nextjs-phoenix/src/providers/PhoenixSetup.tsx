'use client';

import { PhoenixProvider } from '@papaya/phoenix-react';
import { PHOENIX_URL, GRAPHQL_URL, POLICY_NUMBERS, TENANT_ID } from '@/lib/config';

export function PhoenixSetup({ children }: { children: React.ReactNode }) {
  return (
    <PhoenixProvider
      config={{ baseUrl: PHOENIX_URL, graphqlUrl: GRAPHQL_URL }}
      tenantId={TENANT_ID}
      policyNumbers={POLICY_NUMBERS}
      locale="en"
    >
      {children as any}
    </PhoenixProvider>
  );
}
