import { useState, useEffect, useCallback } from 'react';
import type { PaginatedResponse } from '@papaya/shared-types';
import { listActivityLogs, type ActivityLog } from '../audit-api';

interface UseActivityLogsParams {
  action?: string;
  resource_type?: string;
  limit?: number;
}

interface UseActivityLogsReturn {
  logs: ActivityLog[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setPage: (page: number) => void;
}

export default function useActivityLogs(params: UseActivityLogsParams): UseActivityLogsReturn {
  const [data, setData] = useState<PaginatedResponse<ActivityLog> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [params.action, params.resource_type]);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await listActivityLogs({
          action: params.action,
          resource_type: params.resource_type,
          page,
          limit: params.limit ?? 20,
        });

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch activity logs');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchLogs();

    return () => {
      cancelled = true;
    };
  }, [params.action, params.resource_type, params.limit, page, fetchKey]);

  return {
    logs: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize: data?.pageSize ?? (params.limit ?? 20),
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
    refetch,
    setPage,
  };
}
