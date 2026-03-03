'use client';

import { useParams, useRouter } from 'next/navigation';
import { ClaimDetail } from '@papaya/phoenix-react';
import { PhoenixSetup } from '@/providers/PhoenixSetup';
import { SdkZone } from '@/components/SdkZone';
import { EventLog } from '@/components/EventLog';

export default function ClaimDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <PhoenixSetup>
      <div className="flex gap-6">
        <div className="flex-1">
          <SdkZone label="ClaimDetail">
            <ClaimDetail
              claimId={params.id}
              onBack={() => router.push('/claims')}
              onAdditionalDocs={(claimId) => router.push(`/claims/${claimId}`)}
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
