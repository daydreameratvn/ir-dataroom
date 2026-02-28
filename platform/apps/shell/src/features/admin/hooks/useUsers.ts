import { useState, useEffect, useCallback } from 'react';
import type { UserType, UserLevel, PaginatedResponse } from '@papaya/shared-types';
import { listUsers, type AdminUser } from '../api';
import useBackgroundPoll from '../../../hooks/useBackgroundPoll';

interface UseUsersParams {
  tenantId?: string;
  search?: string;
  userType?: UserType;
  userLevel?: UserLevel;
  page?: number;
  limit?: number;
}

interface UseUsersReturn {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  hasNewData: boolean;
  refetch: () => void;
  setPage: (page: number) => void;
}

export default function useUsers(params: UseUsersParams): UseUsersReturn {
  const [data, setData] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(params.page ?? 1);
  const [fetchKey, setFetchKey] = useState(0);

  // Background poll for new data
  const pollFetchFn = useCallback(
    () => listUsers({
      tenantId: params.tenantId,
      search: params.search,
      userType: params.userType,
      userLevel: params.userLevel,
      page: 1,
      limit: 1,
    }),
    [params.tenantId, params.search, params.userType, params.userLevel],
  );

  const pollFingerprint = useCallback(
    (result: PaginatedResponse<AdminUser>) =>
      `${result.total}:${result.data[0]?.id ?? ''}`,
    [],
  );

  const { hasNewData, setSnapshot, clearNewData } = useBackgroundPoll({
    fetchFn: pollFetchFn,
    fingerprint: pollFingerprint,
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [params.tenantId, params.search, params.userType, params.userLevel]);

  const refetch = useCallback(() => {
    clearNewData();
    setFetchKey((prev) => prev + 1);
  }, [clearNewData]);

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await listUsers({
          tenantId: params.tenantId,
          search: params.search,
          userType: params.userType,
          userLevel: params.userLevel,
          page,
          limit: params.limit ?? 20,
        });

        if (!cancelled) {
          setData(result);
          setSnapshot(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch users');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [
    params.tenantId,
    params.search,
    params.userType,
    params.userLevel,
    params.limit,
    page,
    fetchKey,
    setSnapshot,
  ]);

  return {
    users: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize: data?.pageSize ?? (params.limit ?? 20),
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
    hasNewData,
    refetch,
    setPage,
  };
}
