import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Clock, Upload } from 'lucide-react';
import { getClaimDetail } from '@/lib/api';
import StatusBadge from './components/StatusBadge';
import ExpandableSection from './components/ExpandableSection';
import StatusTimeline from './components/StatusTimeline';

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

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: claim, isLoading, error } = useQuery({
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

  if (error || !claim) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-600">Không tìm thấy yêu cầu bồi thường</p>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-[#E30613] underline"
        >
          Quay lại
        </button>
      </div>
    );
  }

  const timelineEvents = [
    { status: 'submitted', date: claim.createdAt, isCurrent: claim.status === 'submitted' },
    ...(claim.status !== 'submitted'
      ? [{ status: claim.status, date: claim.createdAt, isCurrent: true }]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-gray-900">
              Chi tiết yêu cầu
            </h1>
            <p className="text-xs text-gray-500">{claim.claimNumber}</p>
          </div>
          <StatusBadge status={claim.status} />
        </div>
      </div>

      <div className="space-y-3 px-4 py-4">
        {/* Amount summary card */}
        <div className="rounded-xl bg-white p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Số tiền yêu cầu</p>
              <p className="mt-1 text-lg font-bold text-gray-900">
                {formatCurrency(claim.amountClaimed, claim.currency)}
              </p>
            </div>
            {claim.amountApproved !== null && (
              <div>
                <p className="text-xs text-gray-500">Số tiền được duyệt</p>
                <p className="mt-1 text-lg font-bold text-green-600">
                  {formatCurrency(claim.amountApproved, claim.currency)}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
            <div>
              <p className="text-xs text-gray-500">Ngày sự kiện</p>
              <p className="mt-0.5 text-sm text-gray-900">
                {formatDate(claim.dateOfLoss)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Ngày khám/điều trị</p>
              <p className="mt-0.5 text-sm text-gray-900">
                {formatDate(claim.dateOfService)}
              </p>
            </div>
            {claim.providerName && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Cơ sở y tế</p>
                <p className="mt-0.5 text-sm text-gray-900">
                  {claim.providerName}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <ExpandableSection title="Lịch sử xử lý" defaultOpen>
          <StatusTimeline events={timelineEvents} />
        </ExpandableSection>

        {/* Documents */}
        <ExpandableSection
          title="Hồ sơ đính kèm"
          count={claim.documents.length}
          defaultOpen
        >
          {claim.documents.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có hồ sơ đính kèm</p>
          ) : (
            <div className="space-y-2">
              {claim.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg bg-gray-50 p-3"
                >
                  <FileText className="h-5 w-5 shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {doc.documentType ?? doc.fileType ?? 'Tài liệu'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ExpandableSection>

        {/* Notes */}
        {claim.notes.length > 0 && (
          <ExpandableSection title="Ghi chú" count={claim.notes.length}>
            <div className="space-y-3">
              {claim.notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-gray-50 p-3">
                  <p className="text-sm text-gray-900">{note.content}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {note.agentName ?? 'Hệ thống'} &middot;{' '}
                    {formatDate(note.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </ExpandableSection>
        )}

        {/* Additional docs button */}
        {claim.status === 'additional_docs_required' && (
          <button
            onClick={() => navigate(`/claims/${claim.id}/additional-docs`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F]"
          >
            <Upload className="h-4 w-4" />
            Nộp hồ sơ bổ sung
          </button>
        )}

        {/* History link */}
        <button
          onClick={() => navigate(`/claims/${claim.id}/history`)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Clock className="h-4 w-4" />
          Xem lịch sử đầy đủ
        </button>
      </div>
    </div>
  );
}
