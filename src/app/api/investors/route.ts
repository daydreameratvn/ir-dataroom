import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const addInvestorSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  firm: z.string().optional(),
  skipNda: z.boolean().optional(),
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

  const investorsWithLogs = await prisma.investor.findMany({
    include: {
      accessLogs: true,
    },
    orderBy: { invitedAt: "desc" },
  });

  const enriched = investorsWithLogs.map((inv) => {
    const views = inv.accessLogs.filter((l) => l.action === "view");
    const downloads = inv.accessLogs.filter((l) => l.action === "download");
    const uniqueFiles = new Set(views.map((l) => l.fileId));
    const totalTime = views.reduce((sum, l) => sum + (l.duration || 0), 0);
    const lastLog = [...inv.accessLogs].sort(
      (a, b) => b.startedAt.getTime() - a.startedAt.getTime()
    )[0];

    const { accessLogs: _logs, ...rest } = inv;
    return {
      ...rest,
      lastActiveAt: lastLog?.startedAt.toISOString() || null,
      totalViews: views.length,
      totalDownloads: downloads.length,
      uniqueFilesViewed: uniqueFiles.size,
      totalTimeSpent: totalTime,
    };
  });

  return NextResponse.json(enriched);
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

  const skipNda = parsed.data.skipNda === true;

  const investor = await prisma.investor.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name || null,
      firm: parsed.data.firm || null,
      ...(skipNda
        ? { ndaRequired: false, status: "nda_accepted" }
        : {}),
    },
  });

  // Send welcome email (non-blocking — don't fail the request if email fails)
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const investorName = investor.name || "there";
  sendEmail({
    to: investor.email,
    subject: "Welcome to the Papaya Investor Dataroom",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <img src="${baseUrl}/papaya-logo.png" alt="Papaya" style="height: 32px; margin-bottom: 24px;" />
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">Welcome to the Dataroom</h2>
        <p style="color: #444; line-height: 1.6;">
          Hi ${investorName},
        </p>
        <p style="color: #444; line-height: 1.6;">
          You have been invited to access the Papaya investor dataroom. Here you can review our key documents, financials, and other materials.
        </p>
        <div style="margin: 32px 0;">
          <a href="${baseUrl}" style="display: inline-block; background: #e91e63; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Access Dataroom
          </a>
        </div>
        <p style="color: #666; font-size: 13px; line-height: 1.5;">
          Simply click the button above and enter your email to receive a one-time login code. No password needed.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
        <p style="color: #999; font-size: 12px;">
          This email was sent by Papaya. If you received this in error, please disregard.
        </p>
      </div>
    `,
  }).catch((err) => {
    console.error("Failed to send welcome email:", err);
  });

  return NextResponse.json(investor, { status: 201 });
}
