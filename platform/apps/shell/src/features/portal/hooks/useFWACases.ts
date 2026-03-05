import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listFWACases, getFWACase, createFWACase, deleteFWACase, getClaimFWACaseLink, flagClaimForReview } from '../api';

export function useFWACases() {
  return useQuery({
    queryKey: ['portal', 'fwa-cases'],
    queryFn: listFWACases,
  });
}

export function useFWACase(id: string) {
  return useQuery({
    queryKey: ['portal', 'fwa-case', id],
    queryFn: () => getFWACase(id),
  });
}

export function useCreateFWACase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFWACase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'fwa-cases'] });
    },
  });
}

export function useDeleteFWACase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFWACase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'fwa-cases'] });
    },
  });
}

export function useClaimFWACaseLink(claimId: string | undefined) {
  return useQuery({
    queryKey: ['portal', 'claim-fwa-link', claimId],
    queryFn: () => getClaimFWACaseLink(claimId!),
    enabled: !!claimId,
  });
}

export function useFlagClaimForReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: flagClaimForReview,
    onSuccess: (_data, claimId) => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'fwa-cases'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'claim-fwa-link', claimId] });
    },
  });
}
