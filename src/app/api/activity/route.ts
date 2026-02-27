import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
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

  const url = req.nextUrl;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));
  const actionFilter = url.searchParams.get("action");

  const where: Record<string, string> = {};
  if (actionFilter === "view" || actionFilter === "download") {
    where.action = actionFilter;
  }

  const [total, logs] = await Promise.all([
    prisma.accessLog.count({ where }),
    prisma.accessLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startedAt: "desc" },
      include: {
        investor: { select: { email: true } },
        file: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    logs: logs.map((log) => ({
      id: log.id,
      investorEmail: log.investor.email,
      fileName: log.file.name,
      action: log.action,
      startedAt: log.startedAt.toISOString(),
      duration: log.duration,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
