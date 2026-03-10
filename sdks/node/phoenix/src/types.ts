export type PhoenixEnvironment = 'production' | 'staging' | 'uat' | 'development';

export interface PhoenixConfig {
  /** Environment to connect to. Determines the GraphQL endpoint automatically. */
  environment: PhoenixEnvironment;
  /** Override the GraphQL endpoint URL. Takes precedence over environment resolution. */
  graphqlUrl?: string;
  /** Request timeout in milliseconds. Default: 30000. */
  timeout?: number;
}

export interface LoginResult {
  policyNumber: string;
  success: boolean;
  message?: string;
  token?: string;
  policy?: PolicyInfo;
}

export interface PolicyInfo {
  id: string;
  policyNumber: string;
  insuredName: string;
  status: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  status: string;
  claimantName: string;
  providerName: string | null;
  amountClaimed: number;
  amountApproved: number | null;
  amountPaid: number | null;
  currency: string;
  dateOfLoss: string | null;
  dateOfService: string | null;
  createdAt: string;
}

export interface ClaimDocument {
  id: string;
  fileName: string;
  fileType: string | null;
  fileUrl: string;
  fileSizeBytes: number | null;
  documentType: string | null;
  createdAt: string;
}

export interface ClaimNote {
  id: string;
  content: string;
  noteType: string;
  agentName: string | null;
  createdAt: string;
}

export interface ClaimDetail extends Claim {
  documents: ClaimDocument[];
  notes: ClaimNote[];
  aiSummary: string | null;
  aiRecommendation: string | null;
}

export interface CreateClaimInput {
  claimantName: string;
  amountClaimed: number;
  currency?: string;
  dateOfLoss?: string;
  dateOfService?: string;
  providerName?: string;
}

export interface UploadDocumentInput {
  fileName: string;
  fileType: string;
  documentType?: string;
}

export interface UploadDocumentResult {
  uploadUrl: string;
  document: ClaimDocument;
}
