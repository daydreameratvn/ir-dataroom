import { useState, useEffect, useCallback } from 'react';
import type { PaginatedResponse } from '@papaya/shared-types';
import { listMembers, type TenantMember, type MemberStatus, type MemberSource } from '../members-api';

interface UseMembersParams {
  search?: string;
  status?: MemberStatus;
  source?: MemberSource;
  limit?: number;
}

interface UseMembersReturn {
  members: TenantMember[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setPage: (page: number) => void;
}

export default function useMembers(params: UseMembersParams): UseMembersReturn {
  const [data, setData] = useState<PaginatedResponse<TenantMember> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [params.search, params.status, params.source]);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchMembers() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await listMembers({
          search: params.search,
          status: params.status,
          source: params.source,
          page,
          limit: params.limit ?? 20,
        });

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch members');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchMembers();

    return () => {
      cancelled = true;
    };
  }, [params.search, params.status, params.source, params.limit, page, fetchKey]);

  return {
    members: data?.data ?? [],
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
