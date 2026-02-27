import { useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Badge } from '@papaya/shared-ui';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';
import {
  getDocumentViewUrl,
  getDocumentDownloadUrl,
  trackView,
} from '@/lib/api';

const HEARTBEAT_INTERVAL_SECONDS = 30;

export default function DocumentViewer() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const viewStartRef = useRef<number>(Date.now());
  const lastTrackedRef = useRef<number>(0);
  const accessLogIdRef = useRef<string | undefined>(undefined);

  const { data, isLoading, error } = useQuery({
    queryKey: ['document-view', slug, id],
    queryFn: () => getDocumentViewUrl(slug!, id!),
    enabled: !!slug && !!id,
  });

  // Store access log ID when data loads
  useEffect(() => {
    if (data?.accessLogId) {
      accessLogIdRef.current = data.accessLogId;
    }
  }, [data?.accessLogId]);

  // Track view duration with heartbeat
  const sendHeartbeat = useCallback(() => {
    const logId = accessLogIdRef.current;
    if (!logId) return;

    const now = Date.now();
    const elapsed = Math.round((now - viewStartRef.current) / 1000);

    if (elapsed > lastTrackedRef.current) {
      lastTrackedRef.current = elapsed;
      trackView(logId, elapsed).catch(() => {
        // Silently ignore tracking errors
      });
    }
  }, []);

  useEffect(() => {
    viewStartRef.current = Date.now();
    lastTrackedRef.current = 0;

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_SECONDS * 1000);

    return () => {
      clearInterval(interval);
      // Send final heartbeat on unmount
      const logId = accessLogIdRef.current;
      if (logId) {
        const elapsed = Math.round((Date.now() - viewStartRef.current) / 1000);
        if (elapsed > lastTrackedRef.current) {
          trackView(logId, elapsed).catch(() => {
            // Silently ignore
          });
        }
      }
    };
  }, [slug, id, sendHeartbeat]);

  async function handleDownload() {
    if (!slug || !id) return;
    try {
      const result = await getDocumentDownloadUrl(slug, id);
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch {
      // Download error — could show a toast
    }
  }

  const isPdf = data?.document.mimeType === 'application/pdf';
  const isViewable = isPdf;

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <p className="text-sm text-destructive">
          Failed to load document. It may have been removed or you may not have access.
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(`/rounds/${slug}/documents`)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {data.document.name}
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs capitalize">
                {data.document.category.replace(/_/g, ' ')}
              </Badge>
              {data.document.fileSizeBytes != null && (
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(data.document.fileSizeBytes)}
                </span>
              )}
            </div>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="size-4" />
          Download
        </Button>
      </div>

      {/* Viewer */}
      <div className="flex-1">
        {isViewable && data.url ? (
          <iframe
            src={data.url}
            title={data.document.name}
            className="h-full w-full border-0"
            style={{ minHeight: 'calc(100vh - 200px)' }}
          />
        ) : (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
            <FileText className="size-16 text-muted-foreground/30" />
            <div className="text-center">
              <p className="font-medium text-foreground">{data.document.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This file type cannot be previewed. Please download it to view.
              </p>
            </div>
            <Button onClick={handleDownload}>
              <Download className="size-4" />
              Download File
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]!}`;
}
