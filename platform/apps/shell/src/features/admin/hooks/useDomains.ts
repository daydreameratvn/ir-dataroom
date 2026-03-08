import { useState, useEffect, useCallback } from 'react';
import { listDomains, type TenantDomain } from '../domains-api';

interface UseDomainsReturn {
  domains: TenantDomain[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export default function useDomains(): UseDomainsReturn {
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchDomains() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await listDomains();
        if (!cancelled) {
          setDomains(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch domains');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDomains();

    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  return { domains, isLoading, error, refetch };
}
