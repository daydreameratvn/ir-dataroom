import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, FileText, X, PanelLeft } from 'lucide-react';
import { Document, Page, Thumbnail, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { cn, Badge, Button, ScrollArea } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { PortalClaimDocument, ExtractionSourceRef, DocumentClassification } from '../types';
import { getDocumentFileUrl } from '../api';
import { getDocTypeStyle, READABILITY_DOT_STYLES, getReadabilityDotLevel } from '../utils/docStyles';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface ViewerNavigation {
  page: number;
  sourceRef?: ExtractionSourceRef;
  ts: number;
}

interface DocumentViewerProps {
  documents: PortalClaimDocument[];
  viewerNav?: ViewerNavigation | null;
  classifiedDocuments?: DocumentClassification[];
}

function isPdf(doc: PortalClaimDocument): boolean {
  const name = doc.file?.name?.toLowerCase() ?? '';
  return name.endsWith('.pdf');
}

// ─── Thumbnail Grouping ─────────────────────────────────────────────────────

interface ThumbnailGroup {
  type: string;
  pages: number[];
  readabilityScore?: number;
  readabilityIssues?: string[];
}

function buildThumbnailGroups(
  numPages: number,
  classifiedDocuments?: DocumentClassification[],
): ThumbnailGroup[] | null {
  if (!classifiedDocuments || classifiedDocuments.length === 0) return null;

  const covered = new Set<number>();
  const groups: ThumbnailGroup[] = [];

  for (const doc of classifiedDocuments) {
    const pages = (doc.pageNumbers ?? []).filter((p) => p >= 1 && p <= numPages);
    if (pages.length === 0) continue;
    pages.forEach((p) => covered.add(p));
    groups.push({
      type: doc.type,
      pages,
      readabilityScore: doc.readabilityScore,
      readabilityIssues: doc.readabilityIssues ?? undefined,
    });
  }

  // Collect uncovered pages into "Other"
  const other: number[] = [];
  for (let i = 1; i <= numPages; i++) {
    if (!covered.has(i)) other.push(i);
  }
  if (other.length > 0) {
    groups.push({ type: 'Other', pages: other });
  }

  return groups;
}

// ─── Thumbnail Sidebar ──────────────────────────────────────────────────────

interface ThumbnailSidebarProps {
  numPages: number;
  currentPage: number;
  classifiedDocuments?: DocumentClassification[];
  onPageSelect: (page: number) => void;
}

function ThumbnailSidebar({
  numPages,
  currentPage,
  classifiedDocuments,
  onPageSelect,
}: ThumbnailSidebarProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active thumbnail into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  const groups = useMemo(
    () => buildThumbnailGroups(numPages, classifiedDocuments),
    [numPages, classifiedDocuments],
  );

  function renderThumbnailButton(page: number) {
    const isActive = page === currentPage;
    return (
      <button
        key={page}
        ref={isActive ? activeRef : undefined}
        onClick={() => onPageSelect(page)}
        className="w-full cursor-pointer"
      >
        <div
          className={cn(
            'overflow-hidden rounded border bg-white transition-all hover:border-primary/50',
            isActive ? 'ring-2 ring-primary border-primary' : 'border-border/50',
          )}
        >
          <Thumbnail
            pageNumber={page}
            width={80}
          />
        </div>
        <span
          className={cn(
            'mt-0.5 block text-center text-[10px] tabular-nums',
            isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
        >
          p.{page}
        </span>
      </button>
    );
  }

  return (
    <div className="w-[100px] shrink-0 border-r bg-muted/20 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-2 p-2">
          {groups ? (
            // Grouped mode — classified documents
            groups.map((group) => (
              <div key={group.type}>
                <div className="mb-1 flex items-center gap-1">
                  <Badge
                    variant="secondary"
                    className={cn('text-[10px] px-1 py-0 leading-tight', getDocTypeStyle(group.type))}
                  >
                    {group.type}
                  </Badge>
                  {group.readabilityScore != null && (
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                        READABILITY_DOT_STYLES[getReadabilityDotLevel(group.readabilityScore)],
                      )}
                      title={
                        group.readabilityIssues && group.readabilityIssues.length > 0
                          ? `${group.readabilityScore}/5 — ${group.readabilityIssues.join(', ')}`
                          : `${group.readabilityScore}/5`
                      }
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {group.pages.map(renderThumbnailButton)}
                </div>
              </div>
            ))
          ) : (
            // Flat mode — no classification data
            Array.from({ length: numPages }, (_, i) => i + 1).map(renderThumbnailButton)
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Document Viewer ────────────────────────────────────────────────────────

export default function DocumentViewer({ documents, viewerNav, classifiedDocuments }: DocumentViewerProps) {
  const { t } = useTranslation();
  const [selectedDoc, setSelectedDoc] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSourceRef, setActiveSourceRef] = useState<ExtractionSourceRef | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null); // null = auto-detect
  const containerRef = useRef<HTMLDivElement>(null);

  // React to navigation requests from citation badges
  useEffect(() => {
    if (!viewerNav) return;
    setCurrentPage(viewerNav.page);
    setActiveSourceRef(viewerNav.sourceRef);
  }, [viewerNav]);

  // Clear highlight when user manually changes page
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    setActiveSourceRef(undefined);
  }, []);

  if (documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('portal.documents.noDocuments')}
      </div>
    );
  }

  const currentDoc = documents[selectedDoc];
  const fileUrl = currentDoc ? getDocumentFileUrl(currentDoc.id) : '';
  const docIsPdf = currentDoc ? isPdf(currentDoc) : false;
  const bbox = activeSourceRef?.bbox;
  const showSidebarToggle = docIsPdf && numPages != null && numPages >= 2;
  const isSidebarVisible = sidebarOpen === true && numPages != null;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-1">
          {showSidebarToggle && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen((prev) => !prev)}
              title={sidebarOpen ? t('portal.documents.hideThumbnails') : t('portal.documents.showThumbnails')}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          {docIsPdf && numPages != null && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('portal.documents.pageIndicator', { current: currentPage, total: numPages })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePageChange(Math.min(numPages, currentPage + 1))}
                disabled={currentPage >= numPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(3, s + 0.25))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Document tabs */}
      {documents.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b px-3 py-2">
          {documents.map((doc, i) => (
            <button
              key={doc.id}
              onClick={() => {
                setSelectedDoc(i);
                setCurrentPage(1);
                setNumPages(null);
                setActiveSourceRef(undefined);
                setSidebarOpen(null); // reset to auto-detect on doc switch
              }}
              className={cn(
                'flex-shrink-0 rounded border px-2 py-1 text-xs transition-colors',
                i === selectedDoc
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent text-muted-foreground hover:bg-muted'
              )}
            >
              {doc.type || t('portal.documents.docTab', { number: i + 1 })}
            </button>
          ))}
        </div>
      )}

      {/* Source text callout */}
      {activeSourceRef?.text && (
        <div className="flex items-center gap-2 border-b bg-blue-50 px-3 py-2">
          <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="text-xs text-blue-800 line-clamp-2 flex-1">
            &ldquo;{activeSourceRef.text}&rdquo;
          </span>
          <button
            onClick={() => setActiveSourceRef(undefined)}
            className="shrink-0 rounded p-0.5 hover:bg-blue-100 transition-colors"
          >
            <X className="h-3 w-3 text-blue-600" />
          </button>
        </div>
      )}

      {/* Document display */}
      <div ref={containerRef} className="flex-1 overflow-hidden">
        {docIsPdf ? (
          <Document
            className="h-full"
            file={fileUrl}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              if (currentPage > n) setCurrentPage(n);
              // Auto-open sidebar for 4+ pages, auto-close otherwise
              if (sidebarOpen === null) setSidebarOpen(n >= 4);
            }}
            loading={
              <div className="flex h-full items-center justify-center">
                <span className="text-sm text-muted-foreground">{t('portal.documents.loadingPdf')}</span>
              </div>
            }
            error={
              <div className="flex h-full items-center justify-center">
                <span className="text-sm text-red-500">{t('portal.documents.failedToLoadPdf')}</span>
              </div>
            }
          >
            <div className="flex h-full overflow-hidden">
              {isSidebarVisible && (
                <ThumbnailSidebar
                  numPages={numPages!}
                  currentPage={currentPage}
                  classifiedDocuments={classifiedDocuments}
                  onPageSelect={handlePageChange}
                />
              )}
              <div className="flex-1 overflow-auto bg-muted/30 p-4">
                <div
                  className="mx-auto"
                  style={{
                    transform: `scale(${scale}) rotate(${rotation}deg)`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.2s',
                  }}
                >
                  <div className="relative inline-block">
                    <Page
                      pageNumber={currentPage}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="rounded border bg-white"
                    />
                    {/* Highlight overlay */}
                    {bbox && (
                      <svg
                        className="absolute inset-0 pointer-events-none"
                        viewBox="0 0 1 1"
                        preserveAspectRatio="none"
                        style={{ width: '100%', height: '100%' }}
                      >
                        <rect
                          x={bbox.x}
                          y={bbox.y}
                          width={bbox.w}
                          height={bbox.h}
                          fill="rgba(59,130,246,0.15)"
                          stroke="rgba(59,130,246,0.6)"
                          strokeWidth="0.003"
                          rx="0.003"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Document>
        ) : (
          /* Fallback for image documents */
          <div className="flex-1 overflow-auto bg-muted/30 p-4">
            <div
              className="mx-auto"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: 'top center',
                transition: 'transform 0.2s',
              }}
            >
              <div className="relative inline-block">
                <img
                  src={fileUrl}
                  alt={currentDoc?.file?.name ?? 'Document'}
                  className="max-w-full rounded border bg-white"
                />
                {/* Highlight overlay for images */}
                {bbox && (
                  <svg
                    className="absolute inset-0 pointer-events-none"
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <rect
                      x={bbox.x}
                      y={bbox.y}
                      width={bbox.w}
                      height={bbox.h}
                      fill="rgba(59,130,246,0.15)"
                      stroke="rgba(59,130,246,0.6)"
                      strokeWidth="0.003"
                      rx="0.003"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
