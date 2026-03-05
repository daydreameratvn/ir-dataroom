import { useRef, useState } from 'react';
import { Upload, Check } from 'lucide-react';
import { getUploadUrl } from '@/lib/api';
import DocumentCard from '@/features/submission/components/DocumentCard';

interface UploadedDoc {
  id: string;
  fileName: string;
  documentType: string;
  uploaded: boolean;
}

interface DocumentUploaderProps {
  claimId: string;
}

export default function DocumentUploader({ claimId }: DocumentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    setIsUploading(true);

    for (const file of Array.from(files)) {
      try {
        const { uploadUrl, document: docRecord } = await getUploadUrl(claimId, {
          fileName: file.name,
          fileType: file.type,
          documentType: 'other',
        });

        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });

        setDocs((prev) => [
          ...prev,
          {
            id: docRecord.id,
            fileName: file.name,
            documentType: 'other',
            uploaded: true,
          },
        ]);
      } catch {
        setDocs((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            fileName: file.name,
            documentType: 'other',
            uploaded: false,
          },
        ]);
      }
    }

    setIsUploading(false);
    e.target.value = '';
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Tải lên hồ sơ</h3>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-[#E30613] hover:bg-red-50 disabled:opacity-50"
      >
        <Upload className="h-8 w-8 text-gray-400" />
        <span className="text-xs font-medium text-gray-600">
          {isUploading ? 'Đang tải lên...' : 'Nhấn để chọn tệp'}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf"
        multiple
        onChange={handleFileSelect}
      />

      {docs.length > 0 && (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="relative">
              <DocumentCard
                fileName={doc.fileName}
                documentType={doc.documentType}
              />
              {doc.uploaded && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Check className="h-4 w-4 text-green-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
