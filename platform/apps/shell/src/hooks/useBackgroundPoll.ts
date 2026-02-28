import { useState, useEffect, useRef, useCallback } from 'react';

interface UseBackgroundPollOptions<T> {
  fetchFn: () => Promise<T>;
  fingerprint: (data: T) => string;
  interval?: number;
  enabled?: boolean;
}

interface UseBackgroundPollReturn<T> {
  hasNewData: boolean;
  setSnapshot: (data: T) => void;
  clearNewData: () => void;
}

export default function useBackgroundPoll<T>({
  fetchFn,
  fingerprint,
  interval = 30_000,
  enabled = true,
}: UseBackgroundPollOptions<T>): UseBackgroundPollReturn<T> {
  const [hasNewData, setHasNewData] = useState(false);
  const snapshotRef = useRef<string | null>(null);

  // Use refs to avoid stale closures in the interval callback
  const fetchFnRef = useRef(fetchFn);
  const fingerprintRef = useRef(fingerprint);
  fetchFnRef.current = fetchFn;
  fingerprintRef.current = fingerprint;

  const setSnapshot = useCallback((data: T) => {
    snapshotRef.current = fingerprintRef.current(data);
    setHasNewData(false);
  }, []);

  const clearNewData = useCallback(() => {
    setHasNewData(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(async () => {
      try {
        const data = await fetchFnRef.current();
        const fp = fingerprintRef.current(data);
        if (snapshotRef.current !== null && fp !== snapshotRef.current) {
          setHasNewData(true);
        }
      } catch {
        // Silent — don't disrupt the user for poll failures
      }
    }, interval);

    return () => clearInterval(timer);
  }, [interval, enabled]);

  return { hasNewData, setSnapshot, clearNewData };
}
