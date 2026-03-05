import { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { useSubmissionStore, type UploadedDoc } from '../SubmissionFlow';
import DocumentCard from '../components/DocumentCard';

interface DocumentUploadStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function DocumentUploadStep({ onNext, onBack }: DocumentUploadStepProps) {
  const { documents, addDocument, removeDocument } = useSubmissionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const doc: UploadedDoc = {
        id: crypto.randomUUID(),
        fileName: file.name,
        fileType: file.type,
        documentType: 'other',
        file,
      };
      addDocument(doc);
    }

    e.target.value = '';
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Tải hồ sơ</h2>
        <p className="mt-1 text-sm text-gray-500">
          Chụp ảnh hoặc tải lên các chứng từ cần thiết
        </p>
      </div>

      {/* Upload buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-[#E30613] hover:bg-red-50"
        >
          <Camera className="h-8 w-8 text-gray-400" />
          <span className="text-xs font-medium text-gray-600">Chụp ảnh</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-[#E30613] hover:bg-red-50"
        >
          <Upload className="h-8 w-8 text-gray-400" />
          <span className="text-xs font-medium text-gray-600">Tải lên</span>
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        multiple
        onChange={handleFileSelect}
      />
      <input
        ref={cameraInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
      />

      {/* Uploaded documents */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-900">
            Hồ sơ đã tải ({documents.length})
          </p>
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              fileName={doc.fileName}
              documentType={doc.documentType}
              onRemove={() => removeDocument(doc.id)}
            />
          ))}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Quay lại
        </button>
        <button
          onClick={onNext}
          disabled={documents.length === 0}
          className="flex-1 rounded-xl bg-[#E30613] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B8050F] disabled:opacity-50"
        >
          Tiếp tục
        </button>
      </div>
    </div>
  );
}
