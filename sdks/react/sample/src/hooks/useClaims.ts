import { useCallback, useEffect, useState } from 'react';
import { usePapaya } from '../provider';
import type { ClaimData } from '@papaya/sample';

export function useClaims(page = 1, pageSize = 20) {
  const client = usePapaya();
  const [data, setData] = useState<ClaimData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listClaims(page, pageSize);
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

export function useClaim(claimId: string) {
  const client = usePapaya();
  const [data, setData] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.getClaim(claimId)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err : new Error(String(err))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, claimId]);

  return { data, loading, error };
}
