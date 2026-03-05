import { FileText, X } from 'lucide-react';
import { DOCUMENT_TYPE_LABELS } from '@/lib/constants';

interface DocumentCardProps {
  fileName: string;
  documentType: string;
  onRemove?: () => void;
}

export default function DocumentCard({
  fileName,
  documentType,
  onRemove,
}: DocumentCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <FileText className="h-5 w-5 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{fileName}</p>
        <p className="text-xs text-gray-500">
          {DOCUMENT_TYPE_LABELS[documentType] ?? documentType}
        </p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-500"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
