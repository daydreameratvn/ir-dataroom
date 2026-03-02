import { useCallback, useEffect, useState } from 'react';
import {
  Briefcase,
  ArrowLeft,
  Plus,
  RefreshCw,
  Search,
  CircleDot,
  FileText,
  Users,
  Eye,
  Trash2,
  Clock,
  Activity,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  PageHeader,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@papaya/shared-ui';
import type { Investor, OverallStats, RecentActivity, Round } from './types';
import { getStats, listRounds, getRound, listAllInvestors, deleteRound, getRecentActivity } from './api';
import RoundStatusBadge from './components/RoundStatusBadge';
import RoundCreateDialog from './components/RoundCreateDialog';
import InvestorTable from './components/InvestorTable';
import DocumentManager from './components/DocumentManager';
import NDAEditor from './components/NDAEditor';
import AccessLogTable from './components/AccessLogTable';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import RoundConfiguration from './components/RoundConfiguration';

// ── Formatting helpers ──

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount === null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

// ── Main Page ──

export default function IRPage() {
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<Round | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [statsResult, activityResult] = await Promise.all([
        getStats(),
        getRecentActivity(15).catch(() => [] as RecentActivity[]),
      ]);
      setStats(statsResult);
      setRecentActivity(activityResult);
    } catch {
      // Stats are non-critical, silently fail
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh stats every 30s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [statsResult, activityResult] = await Promise.all([
          getStats(),
          getRecentActivity(15).catch(() => [] as RecentActivity[]),
        ]);
        setStats(statsResult);
        setRecentActivity(activityResult);
      } catch {
        // Silent
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch selected round details
  useEffect(() => {
    if (!selectedRoundId) {
      setSelectedRound(null);
      return;
    }

    getRound(selectedRoundId)
      .then(setSelectedRound)
      .catch(() => setSelectedRound(null));
  }, [selectedRoundId]);

  function handleBackToList() {
    setSelectedRoundId(null);
    setSelectedRound(null);
  }

  function handleRoundCreated() {
    fetchStats();
  }

  function handleRoundSaved() {
    if (selectedRoundId) {
      getRound(selectedRoundId)
        .then(setSelectedRound)
        .catch(() => {
          // Silent
        });
    }
  }

  function handleRoundDeleted() {
    setSelectedRoundId(null);
    setSelectedRound(null);
    fetchStats();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investor Relations"
        subtitle="Manage fundraising rounds, data rooms, and investor access"
        action={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
            <Briefcase className="h-5 w-5" />
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Rounds"
          value={statsLoading ? '-' : (stats?.totalRounds ?? 0)}
          icon={<CircleDot className="h-4 w-4" />}
        />
        <StatCard
          label="Active Rounds"
          value={statsLoading ? '-' : (stats?.activeRounds ?? 0)}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          label="Total Investors"
          value={statsLoading ? '-' : (stats?.totalInvestors ?? 0)}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Total Documents"
          value={statsLoading ? '-' : (stats?.totalDocuments ?? 0)}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Total Views"
          value={statsLoading ? '-' : (stats?.totalViews ?? 0).toLocaleString()}
          icon={<Eye className="h-4 w-4" />}
        />
        <StatCard
          label="Unique Viewers"
          value={statsLoading ? '-' : (stats?.uniqueViewers ?? 0).toLocaleString()}
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      {/* Recent Activity - only show on dashboard (no round selected) */}
      {!selectedRoundId && recentActivity.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Recent Activity</h4>
            </div>
            <div className="space-y-2">
              {recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Badge
                      className={`shrink-0 text-[10px] ${
                        entry.action === 'view'
                          ? 'bg-blue-100 text-blue-700'
                          : entry.action === 'download'
                            ? 'bg-emerald-100 text-emerald-700'
                            : entry.action === 'nda_accept'
                              ? 'bg-teal-100 text-teal-700'
                              : entry.action === 'login'
                                ? 'bg-violet-100 text-violet-700'
                                : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {entry.action}
                    </Badge>
                    <span className="truncate">
                      <span className="font-medium">{entry.investorName}</span>
                      {entry.documentName && (
                        <span className="text-muted-foreground">
                          {' — '}
                          {entry.documentName}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground">{entry.roundName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(entry.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content area */}
      {selectedRoundId && selectedRound ? (
        <RoundDetailView
          round={selectedRound}
          onBack={handleBackToList}
          onSaved={handleRoundSaved}
          onDeleted={handleRoundDeleted}
        />
      ) : (
        <Tabs defaultValue="rounds" className="space-y-4">
          <TabsList>
            <TabsTrigger value="rounds">Rounds</TabsTrigger>
            <TabsTrigger value="investors">All Investors</TabsTrigger>
          </TabsList>

          <TabsContent value="rounds">
            <RoundsTab
              onSelectRound={setSelectedRoundId}
              onCreateRound={() => setCreateDialogOpen(true)}
              onRoundCreated={handleRoundCreated}
            />
          </TabsContent>

          <TabsContent value="investors">
            <AllInvestorsTab />
          </TabsContent>
        </Tabs>
      )}

      <RoundCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={handleRoundCreated}
      />
    </div>
  );
}

// ── Rounds Tab ──

interface RoundsTabProps {
  onSelectRound: (id: string) => void;
  onCreateRound: () => void;
  onRoundCreated: () => void;
}

function RoundsTab({ onSelectRound, onCreateRound }: RoundsTabProps) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 12;

  const fetchRounds = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listRounds({ page, limit });
      setRounds(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rounds');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {total} round{total !== 1 ? 's' : ''}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchRounds} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={onCreateRound} className="gap-2">
            <Plus className="h-4 w-4" />
            New Round
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading rounds...
        </div>
      ) : rounds.length === 0 ? (
        <Card>
          <CardContent className="flex h-32 items-center justify-center pt-6 text-sm text-muted-foreground">
            No rounds yet. Create your first fundraising round to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rounds.map((round) => (
            <Card
              key={round.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => onSelectRound(round.id)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate font-medium">{round.name}</h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {round.slug}
                    </p>
                  </div>
                  <RoundStatusBadge status={round.status} />
                </div>

                {round.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {round.description}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                  {round.targetRaise !== null && (
                    <span>{formatCurrency(round.targetRaise, round.currency)}</span>
                  )}
                  <span>Created {formatDate(round.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Round Detail View ──

interface RoundDetailViewProps {
  round: Round;
  onBack: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function RoundDetailView({ round, onBack, onSaved, onDeleted }: RoundDetailViewProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteRound() {
    setIsDeleting(true);
    try {
      await deleteRound(round.id);
      setDeleteDialogOpen(false);
      onDeleted();
    } catch {
      // Failed to delete
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Back button and round header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Rounds
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">{round.name}</h2>
            <RoundStatusBadge status={round.status} />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Round
        </Button>
      </div>

      {round.description && (
        <p className="text-sm text-muted-foreground">{round.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {round.targetRaise !== null && (
          <span>Target: {formatCurrency(round.targetRaise, round.currency)}</span>
        )}
        <span>Created {formatDate(round.createdAt)}</span>
        {round.startedAt && <span>Started {formatDate(round.startedAt)}</span>}
        {round.closedAt && <span>Closed {formatDate(round.closedAt)}</span>}
      </div>

      {/* Round sub-tabs */}
      <Tabs defaultValue="investors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="investors">Investors</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="nda">NDA</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="access-logs">Access Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="investors">
          <InvestorTable roundId={round.id} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentManager roundId={round.id} />
        </TabsContent>

        <TabsContent value="nda">
          <NDAEditor roundId={round.id} />
        </TabsContent>

        <TabsContent value="analytics">
          <AnalyticsDashboard roundId={round.id} />
        </TabsContent>

        <TabsContent value="access-logs">
          <AccessLogTable roundId={round.id} />
        </TabsContent>

        <TabsContent value="settings">
          <RoundConfiguration round={round} onSaved={onSaved} />
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Round</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{round.name}</strong>? This will remove all
              associated investors, documents, NDA templates, and access logs. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRound}
              disabled={isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Round'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── All Investors Tab ──

function AllInvestorsTab() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchInvestors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listAllInvestors();
      setInvestors(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch investors');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  const filteredInvestors = searchQuery
    ? investors.filter(
        (inv) =>
          inv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          inv.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (inv.firm?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    : investors;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {investors.length} investor{investors.length !== 1 ? 's' : ''}
        </h3>
        <Button variant="outline" size="sm" onClick={fetchInvestors} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or firm..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading investors...
        </div>
      ) : filteredInvestors.length === 0 ? (
        <Card>
          <CardContent className="flex h-32 items-center justify-center pt-6 text-sm text-muted-foreground">
            {searchQuery ? 'No investors match your search.' : 'No investors found.'}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Firm</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvestors.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.email}
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.firm ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.title ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(inv.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
