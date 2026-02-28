import { useState, useEffect, useCallback } from 'react';
import {
  listProviders,
  updateProvider,
  deleteProvider,
  triggerSync,
  listSyncLogs,
  type IdentityProvider,
  type UpdateProviderPayload,
  type SyncLog,
  type SyncResult,
} from '../directory-api';
import type { PaginatedResponse } from '@papaya/shared-types';

// ── useIdentityProviders ──

interface UseIdentityProvidersReturn {
  providers: IdentityProvider[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useIdentityProviders(): UseIdentityProvidersReturn {
  const [providers, setProviders] = useState<IdentityProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchProviders() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await listProviders();
        if (!cancelled) setProviders(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch providers');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchProviders();
    return () => { cancelled = true; };
  }, [fetchKey]);

  return { providers, isLoading, error, refetch };
}

// ── useTriggerSync ──

interface UseTriggerSyncReturn {
  sync: (providerId: string) => Promise<SyncResult>;
  isSyncing: boolean;
  error: string | null;
}

export function useTriggerSync(onSuccess?: () => void): UseTriggerSyncReturn {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(
    async (providerId: string) => {
      setIsSyncing(true);
      setError(null);
      try {
        const result = await triggerSync(providerId);
        onSuccess?.();
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        setError(msg);
        throw err;
      } finally {
        setIsSyncing(false);
      }
    },
    [onSuccess],
  );

  return { sync, isSyncing, error };
}

// ── useUpdateProvider ──

interface UseUpdateProviderReturn {
  update: (id: string, payload: UpdateProviderPayload) => Promise<IdentityProvider>;
  isUpdating: boolean;
  error: string | null;
}

export function useUpdateProvider(onSuccess?: () => void): UseUpdateProviderReturn {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    async (id: string, payload: UpdateProviderPayload) => {
      setIsUpdating(true);
      setError(null);
      try {
        const result = await updateProvider(id, payload);
        onSuccess?.();
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed';
        setError(msg);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },
    [onSuccess],
  );

  return { update, isUpdating, error };
}

// ── useDeleteProvider ──

interface UseDeleteProviderReturn {
  remove: (id: string) => Promise<void>;
  isDeleting: boolean;
  error: string | null;
}

export function useDeleteProvider(onSuccess?: () => void): UseDeleteProviderReturn {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(
    async (id: string) => {
      setIsDeleting(true);
      setError(null);
      try {
        await deleteProvider(id);
        onSuccess?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delete failed';
        setError(msg);
        throw err;
      } finally {
        setIsDeleting(false);
      }
    },
    [onSuccess],
  );

  return { remove, isDeleting, error };
}

// ── useSyncLogs ──

interface UseSyncLogsReturn {
  logs: SyncLog[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  refetch: () => void;
}

export function useSyncLogs(providerId: string | null, initialPage = 1): UseSyncLogsReturn {
  const [data, setData] = useState<PaginatedResponse<SyncLog> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!providerId) return;

    let cancelled = false;

    async function fetchLogs() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listSyncLogs(providerId!, page);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchLogs();
    return () => { cancelled = true; };
  }, [providerId, page, fetchKey]);

  return {
    logs: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    pageSize: data?.pageSize ?? 20,
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
    setPage,
    refetch,
  };
}
