import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '@papaya/auth';
import type { DroneSSEEvent } from '../types';

interface UseDroneRunStreamReturn {
  events: DroneSSEEvent[];
  isStreaming: boolean;
  latestEvent: DroneSSEEvent | null;
}

export default function useDroneRunStream(runId: string | null): UseDroneRunStreamReturn {
  const [events, setEvents] = useState<DroneSSEEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [latestEvent, setLatestEvent] = useState<DroneSSEEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (!runId) {
      setEvents([]);
      setLatestEvent(null);
      setIsStreaming(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setEvents([]);
    setLatestEvent(null);
    setIsStreaming(true);

    const token = getAccessToken();
    const url = `/auth/drone/runs/${runId}/stream`;

    fetch(url, {
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function pump(): Promise<void> {
          return reader.read().then(({ done, value }) => {
            if (done || controller.signal.aborted) {
              setIsStreaming(false);
              return;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const json = line.slice(6);
              if (!json) continue;

              try {
                const event = JSON.parse(json) as DroneSSEEvent;
                setEvents((prev) => [...prev, event]);
                setLatestEvent(event);

                if (event.type === 'run_completed' || event.type === 'error') {
                  setIsStreaming(false);
                  reader.cancel();
                  return;
                }
              } catch {
                // Skip malformed JSON
              }
            }

            return pump();
          });
        }

        return pump();
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[Drone] Stream error:', err.message);
        setIsStreaming(false);
      });

    return () => {
      cleanup();
    };
  }, [runId, cleanup]);

  return { events, isStreaming, latestEvent };
}
