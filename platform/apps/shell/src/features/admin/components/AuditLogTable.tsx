import { useState } from 'react';
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  EmptyState,
} from '@papaya/shared-ui';
import { ChevronLeft, ChevronRight, Loader2, ScrollText } from 'lucide-react';
import useActivityLogs from '../hooks/useActivityLogs';

const ACTION_STYLES: Record<string, string> = {
  'member.invited': 'bg-blue-100 text-blue-800',
  'member.suspended': 'bg-yellow-100 text-yellow-800',
  'member.reactivated': 'bg-green-100 text-green-800',
  'member.removed': 'bg-red-100 text-red-800',
  'domain.added': 'bg-purple-100 text-purple-800',
  'domain.verified': 'bg-green-100 text-green-800',
  'domain.deleted': 'bg-red-100 text-red-800',
  'sync.started': 'bg-blue-100 text-blue-800',
  'sync.completed': 'bg-green-100 text-green-800',
  'sync.failed': 'bg-red-100 text-red-800',
  'csv.imported': 'bg-indigo-100 text-indigo-800',
  'screen.visit': 'bg-gray-100 text-gray-600',
  'data.access': 'bg-gray-100 text-gray-600',
};

function getActionStyle(action: string): string {
  return ACTION_STYLES[action] ?? 'bg-gray-100 text-gray-600';
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString();
}

export default function AuditLogTable() {
  const [actionFilter, setActionFilter] = useState<string | undefined>(undefined);
  const [resourceFilter, setResourceFilter] = useState<string | undefined>(undefined);

  const {
    logs,
    total,
    page,
    pageSize,
    hasMore,
    isLoading,
    error,
    refetch,
    setPage,
  } = useActivityLogs({
    action: actionFilter,
    resource_type: resourceFilter,
  });

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select
          value={resourceFilter ?? '__all__'}
          onValueChange={(val) => setResourceFilter(val === '__all__' ? undefined : val)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Resources</SelectItem>
            <SelectItem value="member">Members</SelectItem>
            <SelectItem value="domain">Domains</SelectItem>
            <SelectItem value="sync">Directory Sync</SelectItem>
            <SelectItem value="screen">Screen Visits</SelectItem>
            <SelectItem value="data">Data Access</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : `${total} total events`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <Button variant="link" size="sm" className="ml-2 text-destructive underline" onClick={refetch}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && logs.length === 0 && (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="No activity logs"
          description="Activity will appear here as actions are performed."
        />
      )}

      {/* Table */}
      {!isLoading && !error && logs.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Badge className={getActionStyle(log.action)}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm">
                    {log.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.actor_email ?? log.actor_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {log.resource_type
                      ? `${log.resource_type}${log.resource_id ? `:${log.resource_id.slice(0, 8)}` : ''}`
                      : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatTime(log.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
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
          )}
        </>
      )}
    </div>
  );
}
