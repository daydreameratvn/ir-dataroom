'use client';

import { useRouter } from 'next/navigation';
import { ClaimSubmission } from '@papaya/phoenix-react';
import { PhoenixSetup } from '@/providers/PhoenixSetup';
import { SdkZone } from '@/components/SdkZone';
import { EventLog } from '@/components/EventLog';

export default function SubmitPage() {
  const router = useRouter();

  return (
    <PhoenixSetup>
      <div className="flex gap-6">
        <div className="flex-1">
          <h1 className="mb-4 text-lg font-bold text-gray-900">Submit a Claim</h1>
          <SdkZone label="ClaimSubmission">
            <ClaimSubmission
              onComplete={(claim) => router.push(`/claims/${claim.id}`)}
              onCancel={() => router.push('/claims')}
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
