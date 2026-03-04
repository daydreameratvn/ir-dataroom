import { useNavigate } from 'react-router-dom';
import { Card, CardContent, Badge, Button, cn } from '@papaya/shared-ui';
import { Download, Eye } from 'lucide-react';
import { getDocumentDownloadUrl, type Document } from '@/lib/api';
import {
  getFileTypeInfo,
  getCategoryStyle,
  formatFileSize,
  formatRelativeDate,
} from '@/lib/file-utils';

interface DocumentCardProps {
  document: Document;
  slug: string;
}

export default function DocumentCard({ document, slug }: DocumentCardProps) {
  const navigate = useNavigate();

  const fileInfo = getFileTypeInfo(document.mimeType);
  const categoryStyle = getCategoryStyle(document.category);
  const isViewable =
    document.mimeType === 'application/pdf' ||
    (document.mimeType?.startsWith('video/') ?? false) ||
    (document.mimeType?.startsWith('image/') ?? false);
  const isNew =
    Date.now() - new Date(document.createdAt).getTime() < 7 * 86_400_000;

  function handleView() {
    navigate(`/rounds/${slug}/documents/${document.id}`);
  }

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await getDocumentDownloadUrl(slug, document.id);
      if ('blob' in result && result.blob) {
        const blobUrl = URL.createObjectURL(result.blob);
        const a = window.document.createElement('a');
        a.href = blobUrl;
        a.download = result.document.name;
        window.document.body.appendChild(a);
        a.click();
        window.document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return;
      }
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch {
      // Download error
    }
  }

  return (
    <Card
      className="group cursor-pointer border-border/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-lg !gap-0 !py-0"
      onClick={handleView}
    >
      <CardContent className="flex gap-4 p-4">
        {/* Color-coded file type icon */}
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            fileInfo.bgClass,
          )}
        >
          <fileInfo.Icon className={cn('size-5', fileInfo.iconColorClass)} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {document.name}
            </p>
            {isNew && (
              <Badge className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary hover:bg-primary/10">
                New
              </Badge>
            )}
          </div>

          {document.description && (
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {document.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge
              variant="secondary"
              className={cn(
                'rounded-full px-2 py-0 text-[11px] capitalize',
                categoryStyle.bgClass,
                categoryStyle.textClass,
              )}
            >
              {document.category.replace(/_/g, ' ')}
            </Badge>
            <span className="text-muted-foreground/40">·</span>
            {document.fileSizeBytes != null && (
              <>
                <span>{formatFileSize(document.fileSizeBytes)}</span>
                <span className="text-muted-foreground/40">·</span>
              </>
            )}
            <span>{fileInfo.label}</span>
          </div>

          <p className="text-[11px] text-muted-foreground/60">
            {formatRelativeDate(document.createdAt)}
          </p>
        </div>

        {/* Action buttons — fade in on hover, always visible on mobile */}
        <div className="flex shrink-0 items-start gap-0.5 pt-0.5">
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
