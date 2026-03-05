import { Check, Circle } from 'lucide-react';
import { STATUS_LABELS } from '@/lib/constants';

interface TimelineEvent {
  status: string;
  date: string;
  isCurrent: boolean;
}

interface StatusTimelineProps {
  events: TimelineEvent[];
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export default function StatusTimeline({ events }: StatusTimelineProps) {
  return (
    <div className="space-y-0">
      {events.map((event, index) => {
        const isLast = index === events.length - 1;

        return (
          <div key={index} className="flex gap-3">
            {/* Line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                  event.isCurrent
                    ? 'bg-[#E30613] text-white'
                    : 'bg-green-500 text-white'
                }`}
              >
                {event.isCurrent ? (
                  <Circle className="h-3 w-3 fill-current" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </div>
              {!isLast && (
                <div className="h-8 w-px bg-gray-200" />
              )}
            </div>

            {/* Content */}
            <div className="pb-6">
              <p className="text-sm font-medium text-gray-900">
                {STATUS_LABELS[event.status] ?? event.status}
              </p>
              <p className="text-xs text-gray-500">
                {formatDateTime(event.date)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
