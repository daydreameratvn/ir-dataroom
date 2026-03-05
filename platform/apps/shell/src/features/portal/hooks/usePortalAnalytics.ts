import { useQuery } from '@tanstack/react-query';
import { getAnalytics, getFWAAnalytics } from '../api';
import type { FWAGroupBy } from '../types';

export function usePortalAnalytics() {
  return useQuery({
    queryKey: ['portal', 'analytics'],
    queryFn: getAnalytics,
  });
}

export function useFWAAnalytics(params?: { from?: string; to?: string; groupBy?: FWAGroupBy }) {
  return useQuery({
    queryKey: ['portal', 'fwa-analytics', params],
    queryFn: () => getFWAAnalytics(params),
  });
}
