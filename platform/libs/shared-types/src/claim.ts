export type ClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'ai_processing'
  | 'adjudicated'
  | 'approved'
  | 'denied'
  | 'appealed';

export interface Claim {
  id: string;
  claimId: string;
  status: ClaimStatus;
  claimantName: string;
  providerName: string;
  amount: number;
  currency: string;
  submittedAt: string;
  reviewedAt?: string;
  icdCodes: string[];
  cptCodes: string[];
  aiSummary?: string;
  createdAt: string;
  updatedAt: string;
}
