import { useMemo } from 'react';
import {
  Badge,
  Button,
  Card,
  DataTable,
  type ColumnDef,
} from '@papaya/shared-ui';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSyncLogs } from '../hooks/useIdentityProviders';
import type { SyncLog } from '../directory-api';

interface SyncHistoryProps {
  providerId: string;
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
  auto_join: 'Auto-Join',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function SyncHistory({ providerId, onClose }: SyncHistoryProps) {
  const { logs, total, page, pageSize, hasMore, isLoading, setPage } =
    useSyncLogs(providerId);

  const columns = useMemo<ColumnDef<SyncLog, unknown>[]>(
    () => [
      {
        accessorKey: 'started_at',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-sm">
            {formatDate(row.original.started_at)}
          </span>
        ),
      },
      {
        accessorKey: 'trigger_type',
        header: 'Trigger',
        cell: ({ row }) => (
          <span className="text-sm">
            {TRIGGER_LABELS[row.original.trigger_type] ?? row.original.trigger_type}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge
            className={
              STATUS_STYLES[row.original.status] ?? 'bg-gray-100 text-gray-600'
            }
          >
            {row.original.status}
          </Badge>
        ),
      },
      {
        id: 'counts',
        header: 'Results',
        cell: ({ row }) => {
          const r = row.original;
          const parts: string[] = [];
          if (r.users_created > 0) parts.push(`+${r.users_created} created`);
          if (r.users_updated > 0) parts.push(`${r.users_updated} updated`);
          if (r.users_deactivated > 0) parts.push(`-${r.users_deactivated} removed`);
          if (r.errors_count > 0) parts.push(`${r.errors_count} errors`);
          if (parts.length === 0) parts.push(`${r.users_fetched} checked`);
          return <span className="text-sm">{parts.join(', ')}</span>;
        },
      },
      {
        accessorKey: 'duration_ms',
        header: 'Duration',
        cell: ({ row }) => (
          <span className="text-sm text-papaya-muted">
            {formatDuration(row.original.duration_ms)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-3xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Sync History</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-papaya-muted">
              Loading...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-papaya-muted">
              No sync history yet
            </div>
          ) : (
            <DataTable columns={columns} data={logs} />
          )}
        </div>

        {total > pageSize && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-papaya-muted">
              Showing {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}
