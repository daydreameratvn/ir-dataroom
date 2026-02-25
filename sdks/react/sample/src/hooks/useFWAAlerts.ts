import { useCallback, useEffect, useState } from 'react';
import { usePapaya } from '../provider';
import type { FWAAlertData } from '@papaya/sample';

export function useFWAAlerts(page = 1, pageSize = 20) {
  const client = usePapaya();
  const [data, setData] = useState<FWAAlertData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listFWAAlerts(page, pageSize);
      setData(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, page, pageSize]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, total, loading, error, refetch };
}

export function useFWAAlert(alertId: string) {
  const client = usePapaya();
  const [data, setData] = useState<FWAAlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.getFWAAlert(alertId)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err : new Error(String(err))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, alertId]);

  return { data, loading, error };
}
