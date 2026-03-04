import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Badge, Skeleton, cn } from '@papaya/shared-ui';
import { ArrowLeft, Download, Loader2, AlertTriangle } from 'lucide-react';
import {
  getDocumentViewUrl,
  getDocumentDownloadUrl,
  trackView,
} from '@/lib/api';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';
import {
  getFileTypeInfo,
  getCategoryStyle,
  formatFileSize,
} from '@/lib/file-utils';

const HEARTBEAT_INTERVAL_SECONDS = 30;

/** Watermark overlay — 3 diagonal labels matching the embedded watermark size (~5% of container). */
function WatermarkOverlay({ email, variant }: { email: string; variant: 'light' | 'dark' }) {
  const color = variant === 'light' ? 'text-white/[0.12]' : 'text-black/[0.10]';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[
        { top: '15%', left: '5%' },
        { top: '45%', left: '30%' },
        { top: '75%', left: '55%' },
      ].map((pos, i) => (
        <p
          key={i}
          className={`absolute select-none whitespace-nowrap font-normal ${color}`}
          style={{
            transform: 'rotate(-45deg)',
            top: pos.top,
            left: pos.left,
            fontSize: 'clamp(16px, 4vw, 30px)',
          }}
        >
          {email}
        </p>
      ))}
    </div>
  );
}

export default function DocumentViewer() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const { investor } = useInvestorAuth();
  const viewStartRef = useRef<number>(Date.now());
  const lastTrackedRef = useRef<number>(0);
  const accessLogIdRef = useRef<string | undefined>(undefined);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

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
      trackView(logId, elapsed).catch(() => {});
    }
  }, []);

  useEffect(() => {
    viewStartRef.current = Date.now();
    lastTrackedRef.current = 0;

    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_SECONDS * 1000);

    return () => {
      clearInterval(interval);
      const logId = accessLogIdRef.current;
      if (logId) {
        const elapsed = Math.round((Date.now() - viewStartRef.current) / 1000);
        if (elapsed > lastTrackedRef.current) {
          trackView(logId, elapsed).catch(() => {});
        }
      }
    };
  }, [slug, id, sendHeartbeat]);

  async function handleDownload() {
    if (!slug || !id) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const result = await getDocumentDownloadUrl(slug, id);

      // If the server returned a watermarked blob directly
      if ('blob' in result && result.blob) {
        const blobUrl = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = result.document.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return;
      }

      // Otherwise open the presigned URL
      if (result.url) {
        window.open(result.url, '_blank');
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to download file');
    } finally {
      setIsDownloading(false);
    }
  }

  const isPdf = data?.document.mimeType === 'application/pdf';
  const isVideo = data?.document.mimeType?.startsWith('video/') ?? false;
  const viewUrl = data?.url ?? data?.blobUrl ?? null;

  // ─── Loading skeleton ───
  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="flex flex-1 items-center justify-center bg-muted/30">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-primary/40" />
            <p className="text-sm text-muted-foreground">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───
  if (error || !data) {
    const errorMsg = error instanceof Error ? error.message : '';
    const isNdaError = errorMsg.toLowerCase().includes('nda');

    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
        <AlertTriangle className="size-10 text-amber-500/60" />
        <p className="text-center text-sm text-destructive">
          {isNdaError
            ? 'You need to accept the NDA before viewing documents.'
            : 'Failed to load document. It may have been removed or you may not have access.'}
        </p>
        <div className="flex gap-2">
          {isNdaError && (
            <Button onClick={() => navigate(`/rounds/${slug}/nda`)}>
              Review &amp; Sign NDA
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => navigate(`/rounds/${slug}/documents`)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          {(() => {
            const fi = getFileTypeInfo(data.document.mimeType);
            const cs = getCategoryStyle(data.document.category);
            return (
              <>
                <div className={cn('hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg', fi.bgClass)}>
                  <fi.Icon className={cn('size-4', fi.iconColorClass)} />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {data.document.name}
                  </h2>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn('rounded-full px-2 py-0 text-[11px] capitalize', cs.bgClass, cs.textClass)}
                    >
                      {data.document.category.replace(/_/g, ' ')}
                    </Badge>
                    {data.document.fileSizeBytes != null && (
                      <span className="hidden sm:inline text-xs text-muted-foreground">
                        {formatFileSize(data.document.fileSizeBytes)}
                      </span>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {downloadError && (
            <span className="hidden sm:inline text-xs text-destructive">{downloadError}</span>
          )}
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download'}</span>
          </Button>
        </div>
      </div>

      {/* ─── Viewer ─── */}
      <div className="flex-1">
        {isVideo && viewUrl ? (
          <div
            className="relative flex items-center justify-center bg-black"
            style={{ minHeight: 'calc(100vh - 140px)' }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <video
              src={viewUrl}
              controls
              controlsList="nodownload"
              preload="auto"
              className="max-h-[calc(100vh-140px)] max-w-full"
            />
            {investor?.email && <WatermarkOverlay email={investor.email} variant="light" />}
          </div>
        ) : isPdf && viewUrl ? (
          <div
            className="relative"
            style={{ minHeight: 'calc(100vh - 140px)' }}
          >
            <iframe
              src={viewUrl}
              title={data.document.name}
              className="h-full w-full border-0"
              style={{ minHeight: 'calc(100vh - 140px)' }}
            />
            {investor?.email && <WatermarkOverlay email={investor.email} variant="dark" />}
          </div>
        ) : isPdf && !viewUrl ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
            <AlertTriangle className="size-10 text-amber-500/60" />
            <div className="text-center">
              <p className="font-medium text-foreground">Unable to preview this PDF</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The file could not be loaded for preview. Please download it to view.
              </p>
            </div>
            <Button onClick={handleDownload} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {isDownloading ? 'Downloading...' : 'Download File'}
            </Button>
            {downloadError && (
              <p className="text-sm text-destructive">{downloadError}</p>
            )}
          </div>
        ) : (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
            {(() => {
              const fi = getFileTypeInfo(data.document.mimeType);
              return (
                <div className={cn('flex size-16 items-center justify-center rounded-2xl', fi.bgClass)}>
                  <fi.Icon className={cn('size-8', fi.iconColorClass)} />
                </div>
              );
            })()}
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
