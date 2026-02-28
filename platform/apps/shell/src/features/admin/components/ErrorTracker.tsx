import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  CheckCircle,
  EyeOff,
  Wand2,
  Eye,
} from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  DataTable,
  type ColumnDef,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  cn,
} from '@papaya/shared-ui';
import { useAuth } from '@papaya/auth';
import useErrors from '../hooks/useErrors';
import { updateErrorStatus, triggerAutoFix, type ErrorReport } from '../error-api';
import NewDataBanner from '../../../components/NewDataBanner';
import ErrorDetailDialog from './ErrorDetailDialog';

// ── Style maps ──

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-600 text-white hover:bg-red-600/90',
  error: 'bg-orange-500 text-white hover:bg-orange-500/90',
  warning: 'bg-yellow-500 text-white hover:bg-yellow-500/90',
};

const SOURCE_STYLES: Record<string, string> = {
  frontend_boundary: 'bg-blue-500 text-white hover:bg-blue-500/90',
  frontend_unhandled: 'bg-indigo-500 text-white hover:bg-indigo-500/90',
  backend_unhandled: 'bg-red-500 text-white hover:bg-red-500/90',
  backend_api: 'bg-orange-500 text-white hover:bg-orange-500/90',
  agent: 'bg-purple-600 text-white hover:bg-purple-600/90',
};

const SOURCE_LABELS: Record<string, string> = {
  frontend_boundary: 'Boundary',
  frontend_unhandled: 'Unhandled',
  backend_unhandled: 'Backend',
  backend_api: 'API',
  agent: 'Agent',
};

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-red-600 text-white hover:bg-red-600/90',
  acknowledged: 'bg-yellow-500 text-white hover:bg-yellow-500/90',
  auto_fix_pending: 'bg-blue-500 text-white hover:bg-blue-500/90',
  auto_fix_pr_created: 'bg-purple-600 text-white hover:bg-purple-600/90',
  resolved: 'bg-green-600 text-white hover:bg-green-600/90',
  ignored: 'bg-gray-400 text-white hover:bg-gray-400/90',
  wont_fix: 'bg-gray-400 text-white hover:bg-gray-400/90',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  auto_fix_pending: 'Auto-fix Pending',
  auto_fix_pr_created: 'PR Created',
  resolved: 'Resolved',
  ignored: 'Ignored',
  wont_fix: "Won't Fix",
};

// ── Helpers ──

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

// ── Component ──

export default function ErrorTracker() {
  const { user: currentUser } = useAuth();

  const isSuperAdmin =
    currentUser?.userType === 'papaya' && currentUser?.userLevel === 'admin';

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [severityFilter, setSeverityFilter] = useState<string | undefined>(undefined);

  // ── Detail dialog state ──
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Debounced search ──
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }

  // ── Data fetching ──
  const {
    errors: errorList,
    total,
    page,
    pageSize,
    hasMore,
    isLoading,
    error,
    hasNewData,
    refetch,
    setPage,
  } = useErrors({
    source: sourceFilter,
    status: statusFilter,
    severity: severityFilter,
    search: debouncedSearch || undefined,
  });

  // ── Actions ──

  async function handleQuickAction(report: ErrorReport, action: string) {
    try {
      if (action === 'auto_fix') {
        await triggerAutoFix(report.id);
      } else {
        await updateErrorStatus(report.id, action);
      }
      refetch();
    } catch {
      // Could show toast
    }
  }

  function handleRowClick(report: ErrorReport) {
    setSelectedError(report);
    setDetailOpen(true);
  }

  // ── Table columns ──

  const columns = useMemo<ColumnDef<ErrorReport, unknown>[]>(
    () => [
      {
        accessorKey: 'severity',
        header: 'Severity',
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={cn('text-xs capitalize', SEVERITY_STYLES[row.original.severity])}
          >
            {row.original.severity}
          </Badge>
        ),
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={cn('text-xs', SOURCE_STYLES[row.original.source])}
          >
            {SOURCE_LABELS[row.original.source] ?? row.original.source}
          </Badge>
        ),
      },
      {
        accessorKey: 'message',
        header: 'Message',
        cell: ({ row }) => (
          <button
            className="text-left text-sm hover:underline cursor-pointer max-w-[300px] truncate block"
            onClick={() => handleRowClick(row.original)}
          >
            {truncate(row.original.message, 60)}
          </button>
        ),
      },
      {
        accessorKey: 'occurrenceCount',
        header: 'Count',
        cell: ({ row }) => (
          <span className="text-sm font-medium tabular-nums">
            {row.original.occurrenceCount}
          </span>
        ),
      },
      {
        accessorKey: 'lastSeenAt',
        header: 'Last Seen',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.lastSeenAt)}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={cn('text-xs', STATUS_STYLES[row.original.status])}
          >
            {STATUS_LABELS[row.original.status] ?? row.original.status}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const report = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleRowClick(report)}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleQuickAction(report, 'acknowledged')}>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Acknowledge
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleQuickAction(report, 'resolved')}>
                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                  Mark Resolved
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleQuickAction(report, 'ignored')}>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Ignore
                </DropdownMenuItem>
                {isSuperAdmin && (
                  <DropdownMenuItem onClick={() => handleQuickAction(report, 'auto_fix')}>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Trigger Auto-fix
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [isSuperAdmin],
  );

  // ── Pagination info ──
  const totalPages = Math.ceil(total / pageSize);
  const startItem = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {hasNewData && (
        <NewDataBanner message="New error reports are available." onRefresh={refetch} />
      )}

      {/* Toolbar: Search + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          {/* Search */}
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search error messages..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Source filter */}
          <Select
            value={sourceFilter ?? '__all__'}
            onValueChange={(val) => setSourceFilter(val === '__all__' ? undefined : val)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sources</SelectItem>
              <SelectItem value="frontend_boundary">Boundary</SelectItem>
              <SelectItem value="frontend_unhandled">Unhandled</SelectItem>
              <SelectItem value="backend_unhandled">Backend</SelectItem>
              <SelectItem value="backend_api">API</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusFilter ?? '__all__'}
            onValueChange={(val) => setStatusFilter(val === '__all__' ? undefined : val)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="auto_fix_pending">Auto-fix Pending</SelectItem>
              <SelectItem value="auto_fix_pr_created">PR Created</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="ignored">Ignored</SelectItem>
              <SelectItem value="wont_fix">Won't Fix</SelectItem>
            </SelectContent>
          </Select>

          {/* Severity filter */}
          <Select
            value={severityFilter ?? '__all__'}
            onValueChange={(val) => setSeverityFilter(val === '__all__' ? undefined : val)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All severities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            size="sm"
            className="ml-2 text-destructive underline"
            onClick={refetch}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && errorList.length === 0 && (
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="No errors found"
          description={
            debouncedSearch || sourceFilter || statusFilter || severityFilter
              ? 'Try adjusting your search or filters.'
              : 'No errors have been reported yet.'
          }
        />
      )}

      {/* Data table */}
      {!isLoading && !error && errorList.length > 0 && (
        <>
          <DataTable columns={columns} data={errorList} />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {startItem}--{endItem} of {total} errors
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Error detail dialog */}
      <ErrorDetailDialog
        report={selectedError}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        isSuperAdmin={isSuperAdmin}
        onUpdated={() => {
          setDetailOpen(false);
          refetch();
        }}
      />
    </div>
  );
}
