import { useQuery } from '@tanstack/react-query';
import { getClaim } from '../api';

const POLLING_STATUSES = new Set(['SUBMITTED', 'PROCESSING', 'PENDING', 'submitted', 'ai_processing']);

export function usePortalClaim(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['portal', 'claim', id],
    queryFn: () => getClaim(id),
    enabled: options?.enabled ?? true,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && POLLING_STATUSES.has(status)) return 5000;
      return false;
    },
  });
}
