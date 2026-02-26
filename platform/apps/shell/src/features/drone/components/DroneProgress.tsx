import { useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, SkipForward, Loader2 } from 'lucide-react';
import { Badge, Progress } from '@papaya/shared-ui';
import type { DroneSSEEvent, DroneClaimStatus } from '../types';
import useDroneRunStream from '../hooks/useDroneRunStream';

interface DroneProgressProps {
  runId: string | null;
  onComplete?: () => void;
}

function formatClaimStatus(status: DroneClaimStatus) {
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

function getStatusIcon(status: DroneClaimStatus) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case 'denied':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'skipped':
      return <SkipForward className="h-4 w-4 text-gray-400" />;
    default:
      return null;
  }
}

export default function DroneProgress({ runId, onComplete }: DroneProgressProps) {
  const { events, isStreaming, latestEvent } = useDroneRunStream(runId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Notify parent when run completes
  useEffect(() => {
    if (latestEvent?.type === 'run_completed') {
      onComplete?.();
    }
  }, [latestEvent, onComplete]);

  if (!runId) return null;

  const processed = latestEvent?.processed ?? 0;
  const total = latestEvent?.total ?? 0;
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0;

  const claimEvents = events.filter(
    (e) => e.type === 'claim_completed' && e.claimCode && e.claimStatus
  );

  return (
    <div className="space-y-4 rounded-xl border bg-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          <span className="text-sm font-medium">
            {isStreaming ? 'Processing claims...' : 'Run complete'}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {processed} / {total} claims
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={percent} className="h-2" />

      {/* Percentage label */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{percent}% complete</span>
        {isStreaming && latestEvent?.type === 'claim_started' && latestEvent.claimCode && (
          <span>Processing: {latestEvent.claimCode}</span>
        )}
      </div>

      {/* Claim results feed */}
      {claimEvents.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-64 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-3"
        >
          {claimEvents.map((event, idx) => (
            <div
              key={`${event.claimCode}-${idx}`}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              {event.claimStatus && getStatusIcon(event.claimStatus)}
              <span className="font-mono text-xs">{event.claimCode}</span>
              {event.claimStatus && formatClaimStatus(event.claimStatus)}
              {event.message && (
                <span className="truncate text-xs text-muted-foreground">
                  {event.message}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error message */}
      {latestEvent?.type === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {latestEvent.message ?? 'An error occurred during the run.'}
        </div>
      )}
    </div>
  );
}
