'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePhoenixEvent, type PhoenixEventType } from '@papaya/phoenix-react';

const ALL_EVENTS: PhoenixEventType[] = [
  'claim:creating',
  'claim:created',
  'claim:creation_failed',
  'claim:cancelled',
  'claim:document_uploaded',
  'claim:document_upload_failed',
  'claim:otp_requested',
  'claim:otp_verified',
  'claim:otp_failed',
];

interface LogEntry {
  id: number;
  timestamp: string;
  event: string;
  payload: unknown;
}

let nextId = 0;

export function EventLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addEntry = useCallback((event: string, payload: unknown) => {
    setEntries((prev) => [
      ...prev,
      {
        id: nextId++,
        timestamp: new Date().toLocaleTimeString(),
        event,
        payload,
      },
    ]);
  }, []);

  // Subscribe to all events
  for (const event of ALL_EVENTS) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    usePhoenixEvent(event, useCallback((payload: unknown) => {
      addEntry(event, payload);
    }, [addEntry, event]));
  }

  // Auto-scroll on new entry
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Event Log</h3>
        <button
          onClick={() => setEntries([])}
          className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
        >
          Clear
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">
            Events will appear here...
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-gray-100 bg-gray-50 p-2.5"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs text-gray-400">{entry.timestamp}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getEventColor(entry.event)}`}>
                    {entry.event}
                  </span>
                </div>
                <pre className="overflow-x-auto text-xs text-gray-600">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getEventColor(event: string): string {
  if (event.includes('failed') || event.includes('cancelled')) {
    return 'bg-red-100 text-red-700';
  }
  if (event.includes('created') || event.includes('verified') || event.includes('uploaded')) {
    return 'bg-green-100 text-green-700';
  }
  return 'bg-blue-100 text-blue-700';
}
