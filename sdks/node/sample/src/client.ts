import type { PapayaConfig, ClaimData, FWAAlertData } from './types';

const DEFAULT_BASE_URL = 'https://api.papaya.ai/v1';

export class PapayaClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: PapayaConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeout = config.timeout ?? 30_000;
  }

  async getClaim(claimId: string): Promise<ClaimData> {
    return this.request<ClaimData>(`/claims/${claimId}`);
  }

  async listClaims(page = 1, pageSize = 20): Promise<{ data: ClaimData[]; total: number }> {
    return this.request(`/claims?page=${page}&pageSize=${pageSize}`);
  }

  async getFWAAlert(alertId: string): Promise<FWAAlertData> {
    return this.request<FWAAlertData>(`/fwa/alerts/${alertId}`);
  }

  async listFWAAlerts(page = 1, pageSize = 20): Promise<{ data: FWAAlertData[]; total: number }> {
    return this.request(`/fwa/alerts?page=${page}&pageSize=${pageSize}`);
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        ...options,
      });

      if (!response.ok) {
        throw new Error(`Papaya API error: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
