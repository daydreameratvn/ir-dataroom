import type { Investor, File, AccessLog, NdaTemplate } from "@/generated/prisma/client";

export type InvestorWithLogs = Investor & {
  accessLogs: AccessLog[];
};

export type FileWithLogs = File & {
  accessLogs: AccessLog[];
};

export type InvestorAnalytics = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  ndaAcceptedAt: string | null;
  totalFilesViewed: number;
  totalTimeSpent: number; // seconds
  totalDownloads: number;
  lastActive: string | null;
};

export type FileAnalytics = {
  id: string;
  name: string;
  category: string;
  uniqueViewers: number;
  totalViews: number;
  avgViewDuration: number; // seconds
  totalDownloads: number;
};

export type DailyActivity = {
  date: string;
  views: number;
  downloads: number;
};

export type SessionWithRole = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  isAdmin: boolean;
  investor: Investor | null;
};

export { Investor, File, AccessLog, NdaTemplate };
