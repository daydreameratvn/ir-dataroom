export type FWASeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FWAAlert {
  id: string;
  alertId: string;
  severity: FWASeverity;
  ruleId: string;
  ruleName: string;
  description: string;
  claimId?: string;
  providerId?: string;
  score: number;
  aiAnalysis?: string;
  detectedAt: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
