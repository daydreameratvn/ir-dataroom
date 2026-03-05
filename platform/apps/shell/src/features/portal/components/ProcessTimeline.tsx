import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import { cn } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { formatDateTime } from '../utils/format';
import type { PortalClaimProcess } from '../types';

interface ProcessTimelineProps {
  processes: PortalClaimProcess[];
}

export default function ProcessTimeline({ processes }: ProcessTimelineProps) {
  const { t } = useTranslation();

  if (processes.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('portal.timeline.noProcesses')}</p>;
  }

  return (
    <div className="space-y-0">
      {processes.map((process, index) => {
        const isLast = index === processes.length - 1;
        const isRunning = process.status === 'RUNNING' || process.status === 'PROCESSING';
        const isComplete = process.status === 'SUCCESS' || process.status === 'COMPLETED';

        return (
          <div key={process.id} className="relative flex gap-3 pb-6">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-[11px] top-6 h-full w-px bg-border" />
            )}
            {/* Icon */}
            <div className="relative z-10 flex-shrink-0">
              {isRunning ? (
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              ) : isComplete ? (
                <CheckCircle className="h-6 w-6 text-emerald-500" />
              ) : (
                <Circle className={cn('h-6 w-6', process.status === 'ERROR' ? 'text-red-500' : 'text-muted-foreground')} />
              )}
            </div>
            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{process.id}</p>
              <p className="text-xs text-muted-foreground">
                {process.status} {process.startedAt && `· Started ${formatDateTime(process.startedAt)}`}
                {process.endedAt && ` · Ended ${formatDateTime(process.endedAt)}`}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
