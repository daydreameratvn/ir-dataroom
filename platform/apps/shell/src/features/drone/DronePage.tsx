import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Play,
  Square,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  Trash2,
  ChevronDown,
  ChevronRight,
  Activity,
  Zap,
  BarChart3,
  Timer,
  RefreshCw,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import type {
  DroneClaimStatus,
  DroneRun,
  DroneRunResult,
  DroneRunStatus,
  DroneSchedule,
  DroneStats,
  DroneTier,
  EligibleClaim,
} from './types';
import {
  cancelRun,
  deleteSchedule,
  getEligible,
  getRunResults,
  getStats,
  listSchedules,
  startRun,
  updateSchedule,
} from './api';
import useDroneRuns from './hooks/useDroneRuns';
import DroneProgress from './components/DroneProgress';
import ScheduleDialog from './components/ScheduleDialog';

// ── Formatting helpers ──

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

function formatSuccessRate(stats: DroneStats): string {
  if (stats.totalProcessed === 0) return '0%';
  return `${Math.round((stats.totalSuccess / stats.totalProcessed) * 100)}%`;
}

// ── Status badges ──

function RunStatusBadge({ status }: { status: DroneRunStatus }) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    case 'running':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          <Activity className="mr-1 h-3 w-3" />
          Running
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          <Square className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ClaimStatusBadge({ status }: { status: DroneClaimStatus }) {
  switch (status) {
    case 'success':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          Success
        </Badge>
      );
    case 'denied':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          Denied
        </Badge>
      );
    case 'error':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          Error
        </Badge>
      );
    case 'skipped':
      return (
        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
          Skipped
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ── Main Page ──

export default function DronePage() {
  const [stats, setStats] = useState<DroneStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const result = await getStats();
      setStats(result);
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
        const result = await getStats();
        setStats(result);
      } catch {
        // Silent
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drone"
        subtitle="Automated claims adjudication agent"
        action={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Runs"
          value={statsLoading ? '-' : (stats?.totalRuns ?? 0)}
          icon={<Zap className="h-4 w-4" />}
        />
        <StatCard
          label="Success Rate"
          value={statsLoading || !stats ? '-' : formatSuccessRate(stats)}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Total Processed"
          value={statsLoading ? '-' : (stats?.totalProcessed ?? 0).toLocaleString()}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          label="Avg Duration"
          value={statsLoading ? '-' : formatDuration(stats?.avgDurationMs ?? null)}
          icon={<Timer className="h-4 w-4" />}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="run" className="space-y-4">
        <TabsList>
          <TabsTrigger value="run">Pick & Run</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>

        <TabsContent value="run">
          <PickAndRunTab onRunComplete={fetchStats} />
        </TabsContent>

        <TabsContent value="results">
          <ResultsTab />
        </TabsContent>

        <TabsContent value="schedules">
          <SchedulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Pick & Run Tab ──

interface PickAndRunTabProps {
  onRunComplete: () => void;
}

function PickAndRunTab({ onRunComplete }: PickAndRunTabProps) {
  const [tier, setTier] = useState<DroneTier>(1);
  const [batchSize, setBatchSize] = useState(10);
  const [eligible, setEligible] = useState<EligibleClaim[]>([]);
  const [isLoadingEligible, setIsLoadingEligible] = useState(false);
  const [eligibleError, setEligibleError] = useState<string | null>(null);
  const [hasPreviewed, setHasPreviewed] = useState(false);

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  async function handlePreview() {
    setIsLoadingEligible(true);
    setEligibleError(null);
    setEligible([]);

    try {
      const claims = await getEligible(tier, batchSize * 2);
      setEligible(claims);
      setHasPreviewed(true);
    } catch (err) {
      setEligibleError(err instanceof Error ? err.message : 'Failed to fetch eligible claims');
    } finally {
      setIsLoadingEligible(false);
    }
  }

  async function handleStartRun() {
    setIsStarting(true);
    setRunError(null);

    try {
      const result = await startRun({
        tier,
        batchSize,
        claimCaseIds: eligible.slice(0, batchSize).map((c) => c.claimCaseId),
      });
      setActiveRunId(result.id);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setIsStarting(false);
    }
  }

  function handleRunComplete() {
    setActiveRunId(null);
    setHasPreviewed(false);
    setEligible([]);
    onRunComplete();
  }

  async function handleCancelRun() {
    if (!activeRunId) return;
    try {
      await cancelRun(activeRunId);
    } catch {
      // Best effort
    }
    setActiveRunId(null);
  }

  const claimsToProcess = eligible.slice(0, batchSize);

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Tier selector */}
            <div className="w-56 space-y-1.5">
              <label className="text-sm font-medium">Tier</label>
              <Select
                value={String(tier)}
                onValueChange={(v) => {
                  setTier(Number(v) as DroneTier);
                  setHasPreviewed(false);
                  setEligible([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Tier 1 - Auto-adjudication</SelectItem>
                  <SelectItem value="2">Tier 2 - Assisted review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Batch size */}
            <div className="w-40 space-y-1.5">
              <label className="text-sm font-medium">Batch Size</label>
              <Input
                type="number"
                min={1}
                max={500}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value) || 1)}
              />
            </div>

            {/* Preview button */}
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={isLoadingEligible || Boolean(activeRunId)}
              className="gap-2"
            >
              <Search className="h-4 w-4" />
              {isLoadingEligible ? 'Loading...' : 'Preview Eligible'}
            </Button>

            {/* Run button */}
            {hasPreviewed && eligible.length > 0 && !activeRunId && (
              <Button
                onClick={handleStartRun}
                disabled={isStarting}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {isStarting ? 'Starting...' : `Run Drone (${claimsToProcess.length} claims)`}
              </Button>
            )}

            {/* Cancel button */}
            {activeRunId && (
              <Button
                variant="destructive"
                onClick={handleCancelRun}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Cancel Run
              </Button>
            )}
          </div>

          {eligibleError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {eligibleError}
            </div>
          )}

          {runError && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {runError}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active run progress */}
      {activeRunId && (
        <DroneProgress runId={activeRunId} onComplete={handleRunComplete} />
      )}

      {/* Eligible claims preview table */}
      {hasPreviewed && !activeRunId && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                Eligible Claims ({eligible.length} total, {claimsToProcess.length} selected)
              </h3>
            </div>

            {eligible.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
                No eligible claims found for Tier {tier}.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim Code</TableHead>
                      <TableHead>Benefit Type</TableHead>
                      <TableHead>ICD Codes</TableHead>
                      <TableHead>Selected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligible.slice(0, 50).map((claim, idx) => (
                      <TableRow key={claim.claimCaseId}>
                        <TableCell className="font-mono text-xs">
                          {claim.claimCode}
                        </TableCell>
                        <TableCell>{claim.benefitType}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {claim.icdCodes.map((code) => (
                              <Badge key={code} variant="outline" className="text-xs">
                                {code}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {idx < batchSize ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {eligible.length > 50 && (
                  <div className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
                    Showing 50 of {eligible.length} eligible claims
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Results Tab ──

function ResultsTab() {
  const { runs, total, page, isLoading, error, hasNewData, refetch, setPage } = useDroneRuns({ limit: 15 });
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runResults, setRunResults] = useState<DroneRunResult[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  function toggleExpand(runId: string) {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      setRunResults([]);
      return;
    }

    setExpandedRunId(runId);
    setResultsLoading(true);
    getRunResults(runId, { limit: 100 })
      .then((res) => setRunResults(res.data))
      .catch(() => setRunResults([]))
      .finally(() => setResultsLoading(false));
  }

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      {/* New data banner */}
      {hasNewData && (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
          <span>New run data is available.</span>
          <Button variant="outline" size="sm" onClick={refetch} className="ml-4 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {total} run{total !== 1 ? 's' : ''} total
        </h3>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading runs...
        </div>
      ) : runs.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No runs found. Start one from the Pick & Run tab.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Type</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Claims</TableHead>
                <TableHead>
                  <span className="text-emerald-600">OK</span>
                  {' / '}
                  <span className="text-red-600">Err</span>
                </TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  isExpanded={expandedRunId === run.id}
                  onToggle={() => toggleExpand(run.id)}
                  results={expandedRunId === run.id ? runResults : []}
                  resultsLoading={expandedRunId === run.id && resultsLoading}
                />
              ))}
            </TableBody>
          </Table>
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

interface RunRowProps {
  run: DroneRun;
  isExpanded: boolean;
  onToggle: () => void;
  results: DroneRunResult[];
  resultsLoading: boolean;
}

function RunRow({ run, isExpanded, onToggle, results, resultsLoading }: RunRowProps) {
  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={onToggle}
      >
        <TableCell>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs capitalize">
            {run.runType}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            Tier {run.tier}
          </Badge>
        </TableCell>
        <TableCell>
          <RunStatusBadge status={run.status} />
        </TableCell>
        <TableCell className="text-sm">
          {run.processedCount} / {run.totalClaims}
        </TableCell>
        <TableCell className="text-sm">
          <span className="text-emerald-600">{run.successCount}</span>
          {' / '}
          <span className="text-red-600">{run.errorCount}</span>
          {run.deniedCount > 0 && (
            <>
              {' / '}
              <span className="text-amber-600">{run.deniedCount}d</span>
            </>
          )}
          {run.skippedCount > 0 && (
            <>
              {' / '}
              <span className="text-gray-500">{run.skippedCount}s</span>
            </>
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {formatDuration(run.durationMs)}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {formatDate(run.createdAt)}
        </TableCell>
      </TableRow>

      {/* Expanded results */}
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={8} className="bg-muted/30 p-0">
            <div className="px-8 py-4">
              {resultsLoading ? (
                <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
                  Loading results...
                </div>
              ) : results.length === 0 ? (
                <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
                  No results yet.
                </div>
              ) : (
                <div className="rounded-md border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead className="text-right">Requested</TableHead>
                        <TableHead className="text-right">Paid</TableHead>
                        <TableHead className="text-right">Not Paid</TableHead>
                        <TableHead>Tools</TableHead>
                        <TableHead>Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((result) => (
                        <TableRow key={result.id}>
                          <TableCell className="font-mono text-xs">
                            {result.claimCode}
                          </TableCell>
                          <TableCell>
                            <ClaimStatusBadge status={result.status} />
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                            {result.message}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatVND(result.requestAmount)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatVND(result.paidAmount)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {formatVND(result.nonPaidAmount)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {result.toolCallCount} call{result.toolCallCount !== 1 ? 's' : ''}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDuration(result.durationMs)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Schedules Tab ──

function SchedulesTab() {
  const [schedules, setSchedules] = useState<DroneSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<DroneSchedule | null>(null);
  const [hasNewData, setHasNewData] = useState(false);
  const snapshotRef = useRef<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listSchedules();
      setSchedules(result);
      setHasNewData(false);
      snapshotRef.current = JSON.stringify(result.map((s) => `${s.id}:${s.enabled}:${s.lastRunAt}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schedules');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // Background poll for schedule changes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await listSchedules();
        const fingerprint = JSON.stringify(result.map((s) => `${s.id}:${s.enabled}:${s.lastRunAt}`));
        if (snapshotRef.current && fingerprint !== snapshotRef.current) {
          setHasNewData(true);
        }
      } catch {
        // Silent
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleToggleEnabled(schedule: DroneSchedule) {
    try {
      await updateSchedule(schedule.id, { enabled: !schedule.enabled });
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === schedule.id ? { ...s, enabled: !s.enabled } : s
        )
      );
    } catch {
      // Revert optimistic update by refetching
      fetchSchedules();
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch {
      fetchSchedules();
    }
  }

  function handleEdit(schedule: DroneSchedule) {
    setEditingSchedule(schedule);
    setDialogOpen(true);
  }

  function handleNewSchedule() {
    setEditingSchedule(null);
    setDialogOpen(true);
  }

  function describeCron(cron: string): string {
    switch (cron) {
      case '0 * * * *':
        return 'Every hour';
      case '0 */4 * * *':
        return 'Every 4 hours';
      case '0 9 * * *':
        return 'Daily 9am';
      case '0 9 * * 1-5':
        return 'Weekdays 9am';
      default:
        return cron;
    }
  }

  return (
    <div className="space-y-4">
      {/* New data banner */}
      {hasNewData && (
        <div className="flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
          <span>Schedule data has been updated.</span>
          <Button variant="outline" size="sm" onClick={fetchSchedules} className="ml-4 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {schedules.length} schedule{schedules.length !== 1 ? 's' : ''}
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSchedules} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleNewSchedule} className="gap-2">
            <Plus className="h-4 w-4" />
            New Schedule
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
          Loading schedules...
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No schedules configured. Create one to automate drone runs.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Slack</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow key={schedule.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{schedule.name}</span>
                      {schedule.description && (
                        <p className="text-xs text-muted-foreground">
                          {schedule.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      Tier {schedule.tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{schedule.batchSize}</TableCell>
                  <TableCell className="text-sm">
                    {describeCron(schedule.cronExpression)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {schedule.slackChannel ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(schedule.lastRunAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(schedule.nextRunAt)}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(schedule)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                        schedule.enabled
                          ? 'bg-emerald-500'
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                          schedule.enabled
                            ? 'translate-x-4.5'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(schedule)}
                        className="h-7 px-2 text-xs"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(schedule.id)}
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        schedule={editingSchedule}
        onSaved={fetchSchedules}
      />
    </div>
  );
}
