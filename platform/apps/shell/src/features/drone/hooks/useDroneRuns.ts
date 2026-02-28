import { useState, useEffect, useCallback } from 'react';
import type { PaginatedResponse } from '@papaya/shared-types';
import type { DroneRun, DroneTier } from '../types';
import { listRuns } from '../api';
import useBackgroundPoll from '../../../hooks/useBackgroundPoll';

const POLL_INTERVAL = 15_000; // 15 seconds

interface UseDroneRunsParams {
  status?: string;
  tier?: DroneTier;
  limit?: number;
}

interface UseDroneRunsReturn {
  runs: DroneRun[];
  total: number;
  page: number;
  isLoading: boolean;
  error: string | null;
  hasNewData: boolean;
  refetch: () => void;
  setPage: (page: number) => void;
}

export default function useDroneRuns(params?: UseDroneRunsParams): UseDroneRunsReturn {
  const [data, setData] = useState<PaginatedResponse<DroneRun> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [fetchKey, setFetchKey] = useState(0);

  // Background poll for new data
  const pollFetchFn = useCallback(
    () => listRuns({ page: 1, limit: 1, status: params?.status, tier: params?.tier }),
    [params?.status, params?.tier],
  );

  const pollFingerprint = useCallback(
    (result: PaginatedResponse<DroneRun>) =>
      `${result.total}:${result.data[0]?.id ?? ''}`,
    [],
  );

  const { hasNewData, setSnapshot, clearNewData } = useBackgroundPoll({
    fetchFn: pollFetchFn,
    fingerprint: pollFingerprint,
    interval: POLL_INTERVAL,
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [params?.status, params?.tier]);

  const refetch = useCallback(() => {
    clearNewData();
    setFetchKey((prev) => prev + 1);
  }, [clearNewData]);

  // Primary fetch — updates visible data
  useEffect(() => {
    let cancelled = false;

    async function fetchRuns() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await listRuns({
          page,
          limit: params?.limit ?? 20,
          status: params?.status,
          tier: params?.tier,
        });

        if (!cancelled) {
          setData(result);
          setSnapshot(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch drone runs');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchRuns();

    return () => {
      cancelled = true;
    };
  }, [params?.status, params?.tier, params?.limit, page, fetchKey, setSnapshot]);

  return {
    runs: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    isLoading,
    error,
    hasNewData,
    refetch,
    setPage,
  };
}
