import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import type { Claim } from '@/lib/api';

interface ClaimCardProps {
  claim: Claim;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: currency || 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export default function ClaimCard({ claim }: ClaimCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/claims/${claim.id}`)}
      className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500">
            {claim.claimNumber}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {formatCurrency(claim.amountClaimed, claim.currency)}
          </p>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-1 text-xs text-gray-500">
          {claim.providerName && (
            <p>{claim.providerName}</p>
          )}
          <p>Ngày nộp: {formatDate(claim.createdAt)}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
      </div>
    </button>
  );
}
