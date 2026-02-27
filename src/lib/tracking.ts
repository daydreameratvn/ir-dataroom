import { prisma } from "@/lib/prisma";

export async function logAccess({
  investorId,
  fileId,
  action,
  ipAddress,
  userAgent,
}: {
  investorId: string;
  fileId: string;
  action: "view" | "download";
  ipAddress?: string;
  userAgent?: string;
}) {
  const log = await prisma.accessLog.create({
    data: {
      investorId,
      fileId,
      action,
      ipAddress,
      userAgent,
      duration: 0,
    },
  });

  // Auto-promote to "active" on first file access
  const investor = await prisma.investor.findUnique({
    where: { id: investorId },
  });
  if (investor?.status === "nda_accepted") {
    await prisma.investor.update({
      where: { id: investorId },
      data: { status: "active" },
    });
  }

  return log;
}

export async function updateDuration(accessLogId: string, duration: number) {
  return prisma.accessLog.update({
    where: { id: accessLogId },
    data: { duration },
  });
}

export async function getInvestorAnalytics() {
  const investors = await prisma.investor.findMany({
    include: {
      accessLogs: true,
    },
  });

  return investors.map((investor) => {
    const views = investor.accessLogs.filter((l) => l.action === "view");
    const downloads = investor.accessLogs.filter(
      (l) => l.action === "download"
    );
    const uniqueFiles = new Set(views.map((l) => l.fileId));
    const totalTime = views.reduce((sum, l) => sum + (l.duration || 0), 0);
    const lastLog = investor.accessLogs.sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
    )[0];

    return {
      id: investor.id,
      email: investor.email,
      name: investor.name,
      status: investor.status,
      ndaAcceptedAt: investor.ndaAcceptedAt?.toISOString() || null,
      totalFilesViewed: uniqueFiles.size,
      totalTimeSpent: totalTime,
      totalDownloads: downloads.length,
      lastActive: lastLog?.startedAt.toISOString() || null,
    };
  });
}

export async function getFileAnalytics() {
  const files = await prisma.file.findMany({
    include: {
      accessLogs: true,
    },
  });

  return files.map((file) => {
    const views = file.accessLogs.filter((l) => l.action === "view");
    const downloads = file.accessLogs.filter((l) => l.action === "download");
    const uniqueViewers = new Set(views.map((l) => l.investorId));
    const avgDuration =
      views.length > 0
        ? views.reduce((sum, l) => sum + (l.duration || 0), 0) / views.length
        : 0;

    return {
      id: file.id,
      name: file.name,
      category: file.category,
      uniqueViewers: uniqueViewers.size,
      totalViews: views.length,
      avgViewDuration: Math.round(avgDuration),
      totalDownloads: downloads.length,
    };
  });
}

export async function getDailyActivity(days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.accessLog.findMany({
    where: {
      startedAt: { gte: since },
    },
    orderBy: { startedAt: "asc" },
  });

  const dailyMap = new Map<string, { views: number; downloads: number }>();

  for (const log of logs) {
    const date = log.startedAt.toISOString().split("T")[0];
    const existing = dailyMap.get(date) || { views: 0, downloads: 0 };
    if (log.action === "view") existing.views++;
    if (log.action === "download") existing.downloads++;
    dailyMap.set(date, existing);
  }

  return Array.from(dailyMap.entries()).map(([date, data]) => ({
    date,
    ...data,
  }));
}

export async function exportAccessLogsCSV(): Promise<string> {
  const logs = await prisma.accessLog.findMany({
    include: {
      investor: true,
      file: true,
    },
    orderBy: { startedAt: "desc" },
  });

  const headers = [
    "Date",
    "Investor Email",
    "Investor Name",
    "File Name",
    "Category",
    "Action",
    "Duration (seconds)",
    "IP Address",
  ];

  const rows = logs.map((log) => [
    log.startedAt.toISOString(),
    log.investor.email,
    log.investor.name || "",
    log.file.name,
    log.file.category,
    log.action,
    (log.duration || 0).toString(),
    log.ipAddress || "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
