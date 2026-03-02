// ── Round ──

export type RoundStatus = 'draft' | 'active' | 'paused' | 'closed' | 'archived';

export type InvestorRoundStatus =
  | 'invited'
  | 'nda_pending'
  | 'nda_accepted'
  | 'active'
  | 'termsheet_sent'
  | 'termsheet_signed'
  | 'docs_out'
  | 'dropped';

export type DocumentCategory =
  | 'financials'
  | 'strategy'
  | 'product'
  | 'legal'
  | 'team'
  | 'other';

export interface RoundConfiguration {
  categories: string[];
  watermarkEnabled: boolean;
  ndaRequired: boolean;
  allowDownload: boolean;
  expiresAt: string | null;
  customBranding: {
    logoUrl: string | null;
    primaryColor: string | null;
  };
}

export interface Round {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: RoundStatus;
  description: string | null;
  configuration: RoundConfiguration;
  targetRaise: number | null;
  currency: string | null;
  startedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Investor ──

export interface Investor {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  firm: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: string;
}

// ── Investor Round ──

export interface InvestorRound {
  id: string;
  investorId: string;
  roundId: string;
  status: InvestorRoundStatus;
  ndaRequired: boolean;
  ndaTemplateId: string | null;
  invitedAt: string | null;
  ndaAcceptedAt: string | null;
  lastAccessAt: string | null;
  accessCount: number;
  investorName: string;
  investorEmail: string;
  investorFirm: string | null;
}

// ── Document ──

export interface Document {
  id: string;
  roundId: string;
  name: string;
  description: string | null;
  category: DocumentCategory;
  mimeType: string | null;
  fileSizeBytes: number | null;
  s3Key: string | null;
  s3Bucket: string | null;
  sortOrder: number;
  watermarkEnabled: boolean;
  createdAt: string;
}

// ── NDA Template ──

export interface NdaTemplate {
  id: string;
  roundId: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string;
}

// ── Access Log ──

export interface AccessLog {
  id: string;
  investorId: string;
  roundId: string;
  documentId: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  durationSeconds: number | null;
  createdAt: string;
  investorName: string;
  investorEmail: string;
}

// ── Analytics ──

export interface RoundAnalytics {
  totalViews: number;
  uniqueViewers: number;
  viewsPerDocument: { documentId: string; documentName: string; views: number }[];
  viewsOverTime: { date: string; views: number }[];
  topInvestors: { investorId: string; investorName: string; actions: number; totalDuration: number }[];
}

// ── Overall Stats ──

export interface OverallStats {
  totalRounds: number;
  activeRounds: number;
  totalInvestors: number;
  totalDocuments: number;
  totalViews: number;
  uniqueViewers: number;
}

// ── Engagement Signals ──

export interface InvestorEngagement {
  investorId: string;
  investorEmail: string;
  investorName: string;
  investorFirm: string | null;
  roundId: string;
  status: string;
  ndaAcceptedAt: string | null;
  ndaRequired: boolean;
  invitedAt: string | null;
  lastActiveAt: string | null;
  totalViews: number;
  totalDownloads: number;
  uniqueFilesViewed: number;
  totalTimeSpent: number;
}

export interface EngagementSignal {
  label: string;
  color: string;
  tip: string;
  rec: string;
}
