import { useEffect, useState } from 'react';
import { usePhoenix } from '../provider';
import type { ClaimDetail } from '@papaya/phoenix';

export function useClaim(claimId: string) {
  const { client, isAuthenticated } = usePhoenix();
  const [data, setData] = useState<ClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    client.getClaim(claimId)
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err : new Error(String(err))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, claimId, isAuthenticated]);

  return { data, loading, error };
}
