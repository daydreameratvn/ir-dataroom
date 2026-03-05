import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getClaimDetail } from '@/lib/api';
import StatusTimeline from './components/StatusTimeline';

export default function ClaimHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: claim, isLoading } = useQuery({
    queryKey: ['phoenix', 'claims', id],
    queryFn: () => getClaimDetail(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-gray-500">Đang tải...</p>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-600">Không tìm thấy</p>
        <button onClick={() => navigate('/')} className="text-sm text-[#E30613] underline">
          Quay lại
        </button>
      </div>
    );
  }

  const events = [
    { status: 'submitted', date: claim.createdAt, isCurrent: claim.status === 'submitted' },
    ...(claim.status !== 'submitted'
      ? [{ status: claim.status, date: claim.createdAt, isCurrent: true }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/claims/${id}`)}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              Lịch sử xử lý
            </h1>
            <p className="text-xs text-gray-500">{claim.claimNumber}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        <StatusTimeline events={events} />
      </div>
    </div>
  );
}
