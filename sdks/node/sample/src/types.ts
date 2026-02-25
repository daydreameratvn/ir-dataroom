export interface PapayaConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface ClaimData {
  id: string;
  claimId: string;
  status: string;
  amount: number;
  currency: string;
  submittedAt: string;
}

export interface FWAAlertData {
  id: string;
  alertId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  description: string;
  detectedAt: string;
}
