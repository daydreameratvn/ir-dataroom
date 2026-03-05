import { useSubmissionStore } from '../SubmissionFlow';
import DocumentCard from '../components/DocumentCard';

interface DocumentSummaryStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function DocumentSummaryStep({ onNext, onBack }: DocumentSummaryStepProps) {
  const { documents, removeDocument } = useSubmissionStore();

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Xác nhận hồ sơ</h2>
        <p className="mt-1 text-sm text-gray-500">
          Kiểm tra lại các hồ sơ đã tải lên
        </p>
      </div>

      <div className="space-y-2">
        {documents.map((doc) => (
          <DocumentCard
            key={doc.id}
            fileName={doc.fileName}
            documentType={doc.documentType}
            onRemove={() => removeDocument(doc.id)}
          />
        ))}
      </div>

      <div className="rounded-xl bg-blue-50 p-4">
        <p className="text-xs text-blue-700">
          Vui lòng đảm bảo các hồ sơ rõ ràng, đầy đủ thông tin. Hồ sơ không
          hợp lệ có thể làm chậm quá trình xử lý.
        </p>
      </div>

      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Quay lại
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F]"
        >
          Tiếp tục
        </button>
      </div>
    </div>
  );
}
