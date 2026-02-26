import { getAccessToken } from './token-store';

interface ErrorPayload {
  source: 'frontend_boundary' | 'frontend_unhandled';
  message: string;
  stackTrace?: string;
  componentStack?: string;
  url: string;
  severity?: 'critical' | 'error' | 'warning';
  metadata?: Record<string, unknown>;
}

const queue: ErrorPayload[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function reportError(payload: ErrorPayload): void {
  queue.push(payload);
  if (queue.length >= 5) {
    flush();
  } else if (!timer) {
    timer = setTimeout(flush, 2000);
  }
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = queue.splice(0);
  for (const item of batch) {
    try {
      const token = getAccessToken();
      await fetch('/auth/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(item),
      });
    } catch {
      /* silent — error reporting must never crash the app */
    }
  }
}
