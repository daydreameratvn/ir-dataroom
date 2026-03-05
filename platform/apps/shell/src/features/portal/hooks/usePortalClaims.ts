import { useQuery } from '@tanstack/react-query';
import { listClaims } from '../api';
import type { ListClaimsParams } from '../types';

export function usePortalClaims(params: ListClaimsParams) {
  return useQuery({
    queryKey: ['portal', 'claims', params],
    queryFn: () => listClaims(params),
  });
}
