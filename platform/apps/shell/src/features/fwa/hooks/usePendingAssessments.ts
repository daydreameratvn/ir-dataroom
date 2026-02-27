import { useCallback, useEffect, useState } from 'react';
import type { PendingAssessment } from '../types';
import { listPendingAssessments } from '../api';

interface UsePendingAssessmentsReturn {
  pending: PendingAssessment[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export default function usePendingAssessments(): UsePendingAssessmentsReturn {
  const [pending, setPending] = useState<PendingAssessment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const data = await listPendingAssessments();
      setPending(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch pending assessments');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(fetch_, 30_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { pending, isLoading, error, refetch: fetch_ };
}
