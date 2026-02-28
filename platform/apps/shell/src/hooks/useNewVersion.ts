import { useEffect, useState } from 'react';

const POLL_INTERVAL = 60_000; // 1 minute

/**
 * Polls /build-id.txt to detect new deployments.
 * Returns true when the remote build ID differs from the embedded one.
 */
export function useNewVersion(): boolean {
  const [hasNewVersion, setHasNewVersion] = useState(false);

  useEffect(() => {
    // Skip in dev (no build-id.txt exists)
    if (import.meta.env.DEV) return;

    let timer: ReturnType<typeof setInterval>;

    async function check() {
      try {
        const res = await fetch('/build-id.txt', { cache: 'no-store' });
        if (!res.ok) return;
        const remote = (await res.text()).trim();
        if (remote && remote !== __BUILD_ID__) {
          setHasNewVersion(true);
          clearInterval(timer);
        }
      } catch {
        // Network error — ignore, will retry next interval
      }
    }

    timer = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  return hasNewVersion;
}
