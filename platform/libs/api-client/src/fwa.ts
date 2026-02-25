import type { FWAAlert, ApiResponse, PaginatedResponse } from '@papaya/shared-types';
import { apiClient } from './client';

export const fwaApi = {
  list: (page = 1, pageSize = 20) =>
    apiClient.get<PaginatedResponse<FWAAlert>>(`/fwa/alerts?page=${page}&pageSize=${pageSize}`),

  get: (id: string) => apiClient.get<ApiResponse<FWAAlert>>(`/fwa/alerts/${id}`),
};
