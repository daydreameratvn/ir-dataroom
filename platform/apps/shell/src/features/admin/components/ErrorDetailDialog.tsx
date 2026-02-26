import { useState } from 'react';
import { ExternalLink, Wand2 } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@papaya/shared-ui';
import { updateErrorStatus, triggerAutoFix, type ErrorReport } from '../error-api';

// ── Style maps ──

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-600 text-white hover:bg-red-600/90',
  error: 'bg-orange-500 text-white hover:bg-orange-500/90',
  warning: 'bg-yellow-500 text-white hover:bg-yellow-500/90',
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

// ── Props ──

interface ErrorDetailDialogProps {
  report: ErrorReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSuperAdmin: boolean;
  onUpdated: () => void;
}

export default function ErrorDetailDialog({
  report,
  open,
  onOpenChange,
  isSuperAdmin,
  onUpdated,
}: ErrorDetailDialogProps) {
  const [newStatus, setNewStatus] = useState<string | undefined>(undefined);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isAutoFixing, setIsAutoFixing] = useState(false);

  if (!report) return null;

  async function handleStatusChange() {
    if (!report || !newStatus) return;
    setIsUpdating(true);
    try {
      await updateErrorStatus(report.id, newStatus);
      setNewStatus(undefined);
      onUpdated();
    } catch {
      // Could show toast
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleAutoFix() {
    if (!report) return;
    setIsAutoFixing(true);
    try {
      await triggerAutoFix(report.id);
      onUpdated();
    } catch {
      // Could show toast
    } finally {
      setIsAutoFixing(false);
    }
  }

  const canAutoFix = isSuperAdmin && !['resolved', 'ignored', 'wont_fix', 'auto_fix_pending', 'auto_fix_pr_created'].includes(report.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={cn('text-xs', SEVERITY_STYLES[report.severity])}>
              {report.severity}
            </Badge>
            <Badge variant="secondary" className={cn('text-xs', STATUS_STYLES[report.status])}>
              {STATUS_LABELS[report.status] ?? report.status}
            </Badge>
          </div>
          <DialogTitle className="text-base mt-2">{report.message}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {report.occurrenceCount} occurrence{report.occurrenceCount !== 1 ? 's' : ''} &middot; First seen {formatRelativeTime(report.firstSeenAt)} &middot; Last seen {formatRelativeTime(report.lastSeenAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Stack Trace */}
          {report.stackTrace && (
            <div>
              <h4 className="text-sm font-medium mb-1">Stack Trace</h4>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto max-h-48 whitespace-pre">
                {report.stackTrace}
              </pre>
            </div>
          )}

          {/* Component Stack */}
          {report.componentStack && (
            <div>
              <h4 className="text-sm font-medium mb-1">Component Stack</h4>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto max-h-32 whitespace-pre">
                {report.componentStack}
              </pre>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Source</span>
              <p className="font-medium">{report.source}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Fingerprint</span>
              <p className="font-mono text-xs truncate">{report.fingerprint}</p>
            </div>
            {report.url && (
              <div>
                <span className="text-muted-foreground">URL</span>
                <p className="truncate">{report.url}</p>
              </div>
            )}
            {report.endpoint && (
              <div>
                <span className="text-muted-foreground">Endpoint</span>
                <p className="font-mono text-xs">{report.endpoint}</p>
              </div>
            )}
            {report.userId && (
              <div>
                <span className="text-muted-foreground">User ID</span>
                <p className="font-mono text-xs truncate">{report.userId}</p>
              </div>
            )}
            {report.userAgent && (
              <div className="col-span-2">
                <span className="text-muted-foreground">User Agent</span>
                <p className="text-xs truncate">{report.userAgent}</p>
              </div>
            )}
            {report.ipAddress && (
              <div>
                <span className="text-muted-foreground">IP Address</span>
                <p className="font-mono text-xs">{report.ipAddress}</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          {report.metadata && Object.keys(report.metadata).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Metadata</h4>
              <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto max-h-32 whitespace-pre">
                {JSON.stringify(report.metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* Fix PR Link */}
          {report.fixPrUrl && (
            <div>
              <h4 className="text-sm font-medium mb-1">Fix PR</h4>
              <a
                href={report.fixPrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                PR #{report.fixPrNumber ?? ''}
                {report.fixBranch && ` (${report.fixBranch})`}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col">
          {/* Status change */}
          <div className="flex items-center gap-2 w-full">
            <Select value={newStatus ?? '__none__'} onValueChange={(val) => setNewStatus(val === '__none__' ? undefined : val)}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Change status..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Change status...</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
                <SelectItem value="wont_fix">Won't Fix</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleStatusChange}
              disabled={!newStatus || isUpdating}
              size="sm"
            >
              {isUpdating ? 'Updating...' : 'Update'}
            </Button>
          </div>

          {/* Auto-fix */}
          {canAutoFix && (
            <Button
              variant="outline"
              onClick={handleAutoFix}
              disabled={isAutoFixing}
              className="w-full"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {isAutoFixing ? 'Triggering...' : 'Trigger Auto-fix'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
