import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  cn,
} from '@papaya/shared-ui';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileWarning,
  Globe,
  Layers,
  Loader2,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  listDocuments,
  getRound,
  downloadNda,
  downloadNdaPdf,
  type Document,
} from '@/lib/api';
import { formatRelativeDate, getCategoryStyle } from '@/lib/file-utils';
import CategoryNav from '../components/CategoryNav';
import DocumentCard from '../components/DocumentCard';

export default function DataroomPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'documents' | 'nda'>('documents');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isDownloadingNda, setIsDownloadingNda] = useState(false);
  const [ndaDownloadError, setNdaDownloadError] = useState<string | null>(null);

  const isNdaTab = activeTab === 'nda';

  const { data: roundData } = useQuery({
    queryKey: ['round', slug],
    queryFn: () => getRound(slug!),
    enabled: !!slug,
    staleTime: 0,
  });

  const { data: documents, isLoading, error } = useQuery({
    queryKey: ['documents', slug, activeCategory],
    queryFn: () =>
      listDocuments(slug!, activeCategory ?? undefined),
    enabled: !!slug && !isNdaTab,
  });

  // Extract unique categories + counts from all documents
  const { data: allDocuments } = useQuery({
    queryKey: ['documents', slug, null],
    queryFn: () => listDocuments(slug!),
    enabled: !!slug,
  });

  // Fetch NDA details when NDA tab is active
  const { data: ndaDetails, isLoading: ndaLoading } = useQuery({
    queryKey: ['nda-details', slug],
    queryFn: () => downloadNda(slug!),
    enabled: !!slug && isNdaTab && !!roundData?.ndaAccepted,
  });

  const categories = allDocuments
    ? [...new Set(allDocuments.map((d) => d.category))]
    : [];

  const categoryCounts = allDocuments
    ? allDocuments.reduce<Record<string, number>>((acc, d) => {
        acc[d.category] = (acc[d.category] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  // Client-side search filter
  const filteredDocuments = documents?.filter(
    (doc) =>
      search.trim() === '' ||
      doc.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Most recently uploaded document date
  const latestDate = allDocuments?.reduce<string | null>((latest, d) => {
    if (!latest || d.createdAt > latest) return d.createdAt;
    return latest;
  }, null);

  async function handleDownloadNda() {
    if (!slug) return;
    setIsDownloadingNda(true);
    setNdaDownloadError(null);
    try {
      const blob = await downloadNdaPdf(slug);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NDA-${roundData?.round.name ?? slug}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setNdaDownloadError(err instanceof Error ? err.message : 'Failed to download NDA');
    } finally {
      setIsDownloadingNda(false);
    }
  }

  // Group documents by category for the All sub-tab
  function renderGroupedDocuments(docs: Document[]) {
    const grouped = docs.reduce<Record<string, Document[]>>((acc, doc) => {
      (acc[doc.category] ??= []).push(doc);
      return acc;
    }, {});

    return (
      <div className="space-y-8">
        {Object.entries(grouped).map(([category, categoryDocs]) => {
          const style = getCategoryStyle(category);
          return (
            <section key={category}>
              <div className="mb-3 flex items-center gap-2">
                <span className={`size-2 rounded-full ${style.dotColor}`} />
                <h3 className="text-sm font-semibold capitalize text-foreground">
                  {category.replace(/_/g, ' ')}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {categoryDocs.length}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categoryDocs.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} slug={slug!} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Rich header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {roundData?.round.name ?? 'Data Room'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse and access confidential documents for this round.
          </p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Layers className="size-4" />
            <span>{allDocuments?.length ?? 0} documents</span>
          </div>
          {latestDate && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-4" />
              <span>Updated {formatRelativeDate(latestDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Top-level tabs: Documents | Signed NDA */}
      <CategoryNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'documents') {
            setActiveCategory(null);
          }
        }}
        ndaAccepted={roundData?.ndaAccepted}
        ndaMode={roundData?.investorRound?.ndaMode}
      />

      {/* ─── Documents tab ─── */}
      {!isNdaTab && (
        <>
          {/* Search + category subtabs */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearch(e.target.value)
                }
                className="pl-9"
              />
            </div>
          </div>

          {/* Category sub-tabs as pills */}
          {categories.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  !activeCategory
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                All
                <span className="text-[10px] opacity-70">
                  {allDocuments?.length ?? 0}
                </span>
              </button>
              {categories.map((cat) => {
                const style = getCategoryStyle(cat);
                const isActive = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                      isActive
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <span
                      className={cn('size-1.5 rounded-full', style.dotColor)}
                    />
                    {cat.replace(/_/g, ' ')}
                    <span className="text-[10px] opacity-70">
                      {categoryCounts[cat] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Documents Grid */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="!gap-0 !py-0">
                  <CardContent className="flex gap-4 p-4">
                    <Skeleton className="size-11 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <p className="text-sm text-destructive">
                Failed to load documents. Please try again later.
              </p>
            </div>
          ) : !filteredDocuments || filteredDocuments.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
              <Layers className="size-10 text-muted-foreground/30" />
              <div className="text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {search.trim()
                    ? 'No matching documents'
                    : 'No documents available'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  {search.trim()
                    ? `No results for "${search}". Try a different search term.`
                    : activeCategory
                      ? 'No documents in this category yet.'
                      : 'Documents will appear here once uploaded.'}
                </p>
              </div>
            </div>
          ) : /* All sub-tab with no search: group by category */
          !activeCategory && !search.trim() ? (
            renderGroupedDocuments(filteredDocuments)
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDocuments.map((doc) => (
                <DocumentCard key={doc.id} document={doc} slug={slug!} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── NDA tab ─── */}
      {isNdaTab && (() => {
        const ndaAccepted = roundData?.ndaAccepted;
        const ndaMode = roundData?.investorRound?.ndaMode;

        // State 1: NDA accepted — show sign-off record
        if (ndaAccepted) {
          if (ndaLoading) {
            return (
              <div className="flex min-h-[300px] items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            );
          }
          if (!ndaDetails) {
            return (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
                <ShieldCheck className="size-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Unable to load NDA details.</p>
              </div>
            );
          }
          return (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-green-600" />
                <p className="text-sm text-muted-foreground">
                  You signed the NDA for this round. Here is your sign-off record.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sign-Off Record</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">NDA Version</dt>
                        <dd className="text-sm text-foreground">v{ndaDetails.version}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <User className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Signed By</dt>
                        <dd className="text-sm text-foreground">
                          {ndaDetails.investorName || ndaDetails.investorEmail}
                          {ndaDetails.investorName && (
                            <span className="text-muted-foreground"> ({ndaDetails.investorEmail})</span>
                          )}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">Date &amp; Time</dt>
                        <dd className="text-sm text-foreground">
                          {new Date(ndaDetails.acceptedAt).toLocaleString(undefined, {
                            dateStyle: 'long',
                            timeStyle: 'medium',
                          })}
                        </dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Globe className="mt-0.5 size-4 text-muted-foreground" />
                      <div>
                        <dt className="text-xs font-medium text-muted-foreground">IP Address</dt>
                        <dd className="text-sm text-foreground">{ndaDetails.ipAddress ?? 'N/A'}</dd>
                      </div>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              {ndaDetails.content && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {roundData?.round.name} — Confidentiality Agreement (v{ndaDetails.version})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] overflow-y-auto rounded-lg border bg-muted/30 p-6">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {ndaDetails.content}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Button variant="outline" onClick={handleDownloadNda} disabled={isDownloadingNda}>
                  <Download className="size-4" />
                  {isDownloadingNda ? 'Downloading...' : 'Download Signed NDA'}
                </Button>
                {ndaDownloadError && (
                  <p className="text-sm text-destructive">{ndaDownloadError}</p>
                )}
              </div>
            </div>
          );
        }

        // State 2: Offline NDA — handled outside platform
        if (ndaMode === 'offline') {
          return (
            <div className="flex min-h-[300px] flex-col items-center justify-center gap-4">
              <ShieldCheck className="size-10 text-muted-foreground/30" />
              <div className="text-center space-y-1.5">
                <p className="text-sm font-medium text-foreground">NDA Handled Offline</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  The NDA for this round was handled outside the platform. Please contact your fund
                  representative if you need a copy of the signed agreement.
                </p>
              </div>
            </div>
          );
        }

        // State 3: Digital NDA not yet accepted
        return (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-4">
            <FileWarning className="size-10 text-amber-500/60" />
            <div className="text-center space-y-1.5">
              <p className="text-sm font-medium text-foreground">NDA Not Yet Signed</p>
              <p className="text-sm text-muted-foreground max-w-md">
                You need to review and accept the Non-Disclosure Agreement before accessing this information.
              </p>
            </div>
            <Button onClick={() => navigate(`/rounds/${slug}/nda`)}>
              <ShieldCheck className="size-4" />
              Review &amp; Sign NDA
            </Button>
          </div>
        );
      })()}
    </div>
  );
}
