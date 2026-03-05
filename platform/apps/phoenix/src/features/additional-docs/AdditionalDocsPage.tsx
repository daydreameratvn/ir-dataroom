import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import DocumentUploader from './components/DocumentUploader';
import AIChatInterface from './components/AIChatInterface';

export default function AdditionalDocsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
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
              Nộp hồ sơ bổ sung
            </h1>
            <p className="text-xs text-gray-500">
              Tải lên hồ sơ được yêu cầu bổ sung
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Document uploader */}
        <DocumentUploader claimId={id!} />

        {/* AI Chat */}
        <AIChatInterface claimId={id!} />
      </div>
    </div>
  );
}
