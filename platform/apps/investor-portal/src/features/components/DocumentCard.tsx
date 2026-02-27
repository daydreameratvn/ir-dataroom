import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Badge, Button } from '@papaya/shared-ui';
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  Eye,
} from 'lucide-react';
import { getDocumentDownloadUrl, type Document } from '@/lib/api';

interface DocumentCardProps {
  document: Document;
  slug: string;
}

export default function DocumentCard({ document, slug }: DocumentCardProps) {
  const navigate = useNavigate();

  const isPdf = document.mimeType === 'application/pdf';
  const isViewable = isPdf;

  function handleView() {
    navigate(`/rounds/${slug}/documents/${document.id}`);
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await getDocumentDownloadUrl(slug, document.id);
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch {
      // Download error
    }
  }

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={handleView}
    >
      <CardContent className="flex gap-4">
        {/* Icon */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <MimeIcon mimeType={document.mimeType ?? 'application/octet-stream'} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-foreground">
            {document.name}
          </p>
          {document.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {document.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs capitalize">
              {document.category.replace(/_/g, ' ')}
            </Badge>
            {document.fileSizeBytes != null && (
              <span className="text-xs text-muted-foreground">
                {formatFileSize(document.fileSizeBytes)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-1">
          {isViewable && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                handleView();
              }}
              title="View"
            >
              <Eye className="size-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleDownload}
            title="Download"
          >
            <Download className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface MimeIconProps {
  mimeType: string;
}

function MimeIcon({ mimeType }: MimeIconProps) {
  if (mimeType === 'application/pdf') {
    return <FileText className="size-5 text-red-500" />;
  }
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv'
  ) {
    return <FileSpreadsheet className="size-5 text-green-600" />;
  }
  if (mimeType.startsWith('image/')) {
    return <FileImage className="size-5 text-blue-500" />;
  }
  return <File className="size-5 text-muted-foreground" />;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
