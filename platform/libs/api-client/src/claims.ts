import type { Claim, ApiResponse, PaginatedResponse } from '@papaya/shared-types';
import { apiClient } from './client';

export const claimsApi = {
  list: (page = 1, pageSize = 20) =>
    apiClient.get<PaginatedResponse<Claim>>(`/claims?page=${page}&pageSize=${pageSize}`),

  get: (id: string) => apiClient.get<ApiResponse<Claim>>(`/claims/${id}`),

  submit: (data: Partial<Claim>) =>
    apiClient.post<ApiResponse<Claim>>('/claims', data),
};
