import type {
  PhoenixConfig,
  LoginResult,
  Claim,
  ClaimDetail,
  ClaimDocument,
  CreateClaimInput,
  UploadDocumentInput,
  UploadDocumentResult,
} from './types';

export class PhoenixClient {
  private baseUrl: string;
  private timeout: number;
  private token: string | null = null;
  private tenantId: string | null = null;

  constructor(config: PhoenixConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30_000;
  }

  setToken(token: string): void {
    this.token = token;
  }

  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  async login(policyNumbers: string[]): Promise<LoginResult[]> {
    const res = await this.request<{ results: LoginResult[] }>('/auth/phoenix/login', {
      method: 'POST',
      body: JSON.stringify({ policyNumbers }),
    });
    return res.results;
  }

  async refreshToken(): Promise<{ token: string }> {
    return this.request<{ token: string }>('/auth/phoenix/token/refresh', {
      method: 'POST',
    });
  }

  async listClaims(): Promise<Claim[]> {
    const result = await this.request<{ data: Claim[] }>('/auth/phoenix/claims');
    return result.data;
  }

  async getClaim(claimId: string): Promise<ClaimDetail> {
    return this.request<ClaimDetail>(`/auth/phoenix/claims/${claimId}`);
  }

  async submitClaim(data: CreateClaimInput): Promise<Claim> {
    return this.request<Claim>('/auth/phoenix/claims', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadDocument(claimId: string, data: UploadDocumentInput): Promise<UploadDocumentResult> {
    return this.request<UploadDocumentResult>(`/auth/phoenix/claims/${claimId}/documents`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getClaimDocuments(claimId: string): Promise<ClaimDocument[]> {
    const result = await this.request<{ data: ClaimDocument[] }>(`/auth/phoenix/claims/${claimId}/documents`);
    return result.data;
  }

  async deleteDocument(claimId: string, documentId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/auth/phoenix/claims/${claimId}/documents/${documentId}`, {
      method: 'DELETE',
    });
  }

  async requestOtp(claimId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/auth/phoenix/claims/${claimId}/otp/request`, {
      method: 'POST',
    });
  }

  async verifyOtp(claimId: string, code: string): Promise<{ success: boolean; verified: boolean }> {
    return this.request<{ success: boolean; verified: boolean }>(`/auth/phoenix/claims/${claimId}/otp/verify`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (this.tenantId) {
      headers['x-tenant-id'] = this.tenantId;
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers,
        signal: controller.signal,
        ...options,
      });

      if (!response.ok) {
        throw new Error(`Phoenix API error: ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
