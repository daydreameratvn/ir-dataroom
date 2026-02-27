import { useState, useEffect, useCallback, useRef } from 'react';
import type { PaginatedResponse } from '@papaya/shared-types';
import type { DroneRun, DroneTier } from '../types';
import { listRuns } from '../api';

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
  const [hasNewData, setHasNewData] = useState(false);

  // Track current snapshot for background comparison
  const snapshotRef = useRef<{ total: number; latestId: string | null }>({
    total: 0,
    latestId: null,
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [params?.status, params?.tier]);

  const refetch = useCallback(() => {
    setHasNewData(false);
    setFetchKey((prev) => prev + 1);
  }, []);

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
          setHasNewData(false);
          snapshotRef.current = {
            total: result.total,
            latestId: result.data[0]?.id ?? null,
          };
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
  }, [params?.status, params?.tier, params?.limit, page, fetchKey]);

  // Background poll — checks for new data without updating visible state
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await listRuns({
          page: 1,
          limit: 1,
          status: params?.status,
          tier: params?.tier,
        });

        const newTotal = result.total;
        const newLatestId = result.data[0]?.id ?? null;
        const snap = snapshotRef.current;

        if (newTotal !== snap.total || newLatestId !== snap.latestId) {
          setHasNewData(true);
        }
      } catch {
        // Silent — don't disrupt the user for poll failures
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [params?.status, params?.tier]);

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
