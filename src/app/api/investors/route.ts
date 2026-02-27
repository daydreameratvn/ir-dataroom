import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const addInvestorSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  firm: z.string().optional(),
});

// GET /api/investors - List all investors
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

  const investors = await prisma.investor.findMany({
    include: {
      accessLogs: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { invitedAt: "desc" },
  });

  return NextResponse.json(investors);
}

// POST /api/investors - Add a new investor
export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const parsed = addInvestorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Check if investor already exists
  const existing = await prisma.investor.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Investor with this email already exists" },
      { status: 409 }
    );
  }

  const investor = await prisma.investor.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name || null,
      firm: parsed.data.firm || null,
    },
  });

  return NextResponse.json(investor, { status: 201 });
}
