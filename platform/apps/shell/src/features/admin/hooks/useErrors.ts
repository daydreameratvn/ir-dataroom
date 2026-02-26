import { useState, useEffect, useCallback } from 'react';
import { listErrors, type ErrorReport, type ListErrorsParams } from '../error-api';

interface UseErrorsParams {
  tenantId?: string;
  source?: string;
  status?: string;
  severity?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface UseErrorsReturn {
  errors: ErrorReport[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setPage: (page: number) => void;
}

export default function useErrors(params: UseErrorsParams): UseErrorsReturn {
  const [data, setData] = useState<{ errors: ErrorReport[]; total: number; page: number; limit: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(params.page ?? 1);
  const [fetchKey, setFetchKey] = useState(0);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [params.tenantId, params.source, params.status, params.severity, params.search]);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchErrors() {
      setIsLoading(true);
      setError(null);

      try {
        const fetchParams: ListErrorsParams = {
          tenantId: params.tenantId,
          source: params.source,
          status: params.status,
          severity: params.severity,
          search: params.search,
          page,
          limit: params.limit ?? 20,
        };

        const result = await listErrors(fetchParams);

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch errors');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchErrors();

    return () => {
      cancelled = true;
    };
  }, [
    params.tenantId,
    params.source,
    params.status,
    params.severity,
    params.search,
    params.limit,
    page,
    fetchKey,
  ]);

  const pageSize = params.limit ?? 20;

  return {
    errors: data?.errors ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize,
    hasMore: data ? (data.page * data.limit) < data.total : false,
    isLoading,
    error,
    refetch,
    setPage,
  };
}
