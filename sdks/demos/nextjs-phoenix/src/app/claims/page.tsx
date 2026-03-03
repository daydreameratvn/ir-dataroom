'use client';

import { useRouter } from 'next/navigation';
import { ClaimsList } from '@papaya/phoenix-react';
import { PhoenixSetup } from '@/providers/PhoenixSetup';
import { SdkZone } from '@/components/SdkZone';
import { EventLog } from '@/components/EventLog';
import type { Claim } from '@papaya/phoenix';

export default function ClaimsPage() {
  const router = useRouter();

  return (
    <PhoenixSetup>
      <div className="flex gap-6">
        <div className="flex-1">
          <h1 className="mb-4 text-lg font-bold text-gray-900">Claims</h1>
          <SdkZone label="ClaimsList">
            <ClaimsList
              onClaimSelect={(claim: Claim) => router.push(`/claims/${claim.id}`)}
              onSubmitNew={() => router.push('/submit')}
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
