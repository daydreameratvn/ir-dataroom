import { useCallback, useEffect, useState } from 'react';
import type { PendingAssessment } from '../types';
import { listPendingAssessments } from '../api';
import useBackgroundPoll from '../../../hooks/useBackgroundPoll';

interface UsePendingAssessmentsReturn {
  pending: PendingAssessment[];
  isLoading: boolean;
  error: string | null;
  hasNewData: boolean;
  refetch: () => void;
}

export default function usePendingAssessments(): UsePendingAssessmentsReturn {
  const [pending, setPending] = useState<PendingAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const pollFingerprint = useCallback(
    (data: PendingAssessment[]) =>
      data.map((p) => p.chatId).join(','),
    [],
  );

  const { hasNewData, setSnapshot, clearNewData } = useBackgroundPoll({
    fetchFn: listPendingAssessments,
    fingerprint: pollFingerprint,
  });

  const refetch = useCallback(() => {
    clearNewData();
    setFetchKey((prev) => prev + 1);
  }, [clearNewData]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPending() {
      setIsLoading(true);
      try {
        const data = await listPendingAssessments();
        if (!cancelled) {
          setPending(data);
          setSnapshot(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch pending assessments');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchPending();

    return () => {
      cancelled = true;
    };
  }, [fetchKey, setSnapshot]);

  return { pending, isLoading, error, hasNewData, refetch };
}
