import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getInvestorAnalytics,
  getFileAnalytics,
  getDailyActivity,
} from "@/lib/tracking";

// GET /api/analytics - Get aggregated analytics
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    investorAnalytics,
    fileAnalytics,
    dailyActivity,
    totalInvestors,
    activeInvestors,
    totalFiles,
    totalViews,
    totalDownloads,
    recentActivity,
  ] = await Promise.all([
    getInvestorAnalytics(),
    getFileAnalytics(),
    getDailyActivity(30),
    prisma.investor.count(),
    prisma.investor.count({ where: { status: "nda_accepted" } }),
    prisma.file.count(),
    prisma.accessLog.count({ where: { action: "view" } }),
    prisma.accessLog.count({ where: { action: "download" } }),
    prisma.accessLog.findMany({
      take: 100,
      orderBy: { startedAt: "desc" },
      include: {
        investor: { select: { email: true, name: true } },
        file: { select: { name: true, category: true } },
      },
    }),
  ]);

  return NextResponse.json({
    summary: {
      totalInvestors,
      activeInvestors,
      totalFiles,
      totalViews,
      totalDownloads,
    },
    investors: investorAnalytics,
    files: fileAnalytics,
    dailyActivity,
    recentActivity,
  });
}
