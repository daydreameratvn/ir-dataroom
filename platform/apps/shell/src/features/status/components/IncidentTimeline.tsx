import { cn } from '@papaya/shared-ui';
import { CheckCircle2, AlertTriangle, Activity, Clock } from 'lucide-react';
import type { IncidentUpdate } from '../types';

const statusConfig: Record<string, { icon: React.ReactNode; color: string; borderColor: string }> = {
  investigating: { icon: <AlertTriangle className="h-3 w-3" />, color: 'text-red-600', borderColor: 'border-red-400' },
  identified: { icon: <Activity className="h-3 w-3" />, color: 'text-amber-600', borderColor: 'border-amber-400' },
  monitoring: { icon: <Clock className="h-3 w-3" />, color: 'text-blue-600', borderColor: 'border-blue-400' },
  resolved: { icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-emerald-600', borderColor: 'border-emerald-400' },
};

interface IncidentTimelineProps {
  updates: IncidentUpdate[];
}

export default function IncidentTimeline({ updates }: IncidentTimelineProps) {
  if (updates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No updates yet.</p>
    );
  }

  return (
    <div className="space-y-0">
      {updates.map((update, i) => {
        const config = statusConfig[update.status] ?? statusConfig.investigating!;
        const isLast = i === updates.length - 1;

        return (
          <div key={update.id} className="relative pl-5 pb-4 last:pb-0">
            {/* Connector line */}
            {!isLast && (
              <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
            )}
            {/* Dot */}
            <div className={cn(
              'absolute left-0 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-background border-2',
              config.borderColor,
            )} />

            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className={cn('inline-flex items-center gap-1 font-medium capitalize', config.color)}>
                  {config.icon}
                  {update.status}
                </span>
                <span className="text-muted-foreground/60">
                  {new Date(update.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{update.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
