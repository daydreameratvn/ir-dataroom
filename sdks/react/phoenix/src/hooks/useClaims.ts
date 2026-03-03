import { useCallback, useEffect, useState } from 'react';
import { usePhoenix } from '../provider';
import type { Claim } from '@papaya/phoenix';

export function useClaims() {
  const { client, isAuthenticated } = usePhoenix();
  const [data, setData] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const claims = await client.listClaims();
      setData(claims);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, isAuthenticated]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, loading, error, refetch };
}
