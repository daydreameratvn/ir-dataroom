import { useQuery } from '@tanstack/react-query';
import { Plus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listClaims } from '@/lib/api';
import ClaimBanner from './components/ClaimBanner';
import ClaimCard from './components/ClaimCard';
import EmptyState from './components/EmptyState';

export default function ClaimListPage() {
  const navigate = useNavigate();

  const { data: claims, isLoading, error, refetch } = useQuery({
    queryKey: ['phoenix', 'claims'],
    queryFn: listClaims,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <ClaimBanner />

      {/* Content */}
      <div className="-mt-2 rounded-t-2xl bg-gray-50 px-4 pt-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Yêu cầu bồi thường
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate('/submit')}
              className="flex items-center gap-1.5 rounded-lg bg-[#E30613] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B8050F]"
            >
              <Plus className="h-3.5 w-3.5" />
              Nộp mới
            </button>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="py-12 text-center text-sm text-gray-500">
            Đang tải...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            Đã xảy ra lỗi. Vui lòng thử lại.
          </div>
        )}

        {/* Claims list */}
        {claims && claims.length > 0 && (
          <div className="space-y-3 pb-8">
            {claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {claims && claims.length === 0 && <EmptyState />}
      </div>
    </div>
  );
}
