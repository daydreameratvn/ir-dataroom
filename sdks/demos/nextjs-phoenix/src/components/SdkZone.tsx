'use client';

import type { ReactNode } from 'react';

interface SdkZoneProps {
  label: string;
  children: ReactNode;
}

export function SdkZone({ label, children }: SdkZoneProps) {
  return (
    <div className="relative rounded-xl border-2 border-dashed border-rose-300 bg-rose-50/50 p-4">
      <span className="absolute -top-3 left-3 rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-semibold text-white">
        {label}
      </span>
      <div className="pt-2">{children}</div>
    </div>
  );
}
