'use client';

import { PhoenixPortal } from '@papaya/phoenix-react';
import { PhoenixSetup } from '@/providers/PhoenixSetup';
import { SdkZone } from '@/components/SdkZone';
import { EventLog } from '@/components/EventLog';
import { PHOENIX_ENVIRONMENT, POLICY_NUMBERS, TENANT_ID } from '@/lib/config';

export default function PortalPage() {
  return (
    <PhoenixSetup>
      <div className="flex gap-6">
        <div className="flex-1">
          <h1 className="mb-4 text-lg font-bold text-gray-900">Full Portal</h1>
          <p className="mb-4 text-sm text-gray-500">
            The PhoenixPortal component is self-contained — it includes its own
            PhoenixProvider, authentication, and internal navigation.
          </p>
          <SdkZone label="PhoenixPortal">
            <PhoenixPortal
              environment={PHOENIX_ENVIRONMENT}
              policyNumbers={POLICY_NUMBERS}
              tenantId={TENANT_ID}
              onClaimSubmitted={(claim) =>
                console.log('Claim submitted:', claim)
              }
            />
          </SdkZone>
        </div>
        <div className="hidden w-80 shrink-0 lg:block">
          <div className="sticky top-6 h-[calc(100vh-120px)]">
            <EventLog />
          </div>
        </div>
      </div>
    </PhoenixSetup>
  );
}
