import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['portal', 'dashboard-stats'],
    queryFn: getDashboardStats,
  });
}
