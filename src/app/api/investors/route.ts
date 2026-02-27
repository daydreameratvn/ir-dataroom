import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

const addInvestorSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  skipNda: z.boolean().optional(),
});

// Common free email providers — don't infer firm from these
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "proton.me", "zoho.com",
  "yandex.com", "live.com", "msn.com", "me.com", "hey.com",
]);

function inferFirmFromEmail(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
  // Pretty-print: remove TLD, capitalize first letter
  const name = domain.split(".")[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

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
  const autoFirm = inferFirmFromEmail(parsed.data.email);

  const investor = await prisma.investor.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name || null,
      firm: autoFirm,
      ...(skipNda
        ? { ndaRequired: false, status: "nda_accepted" }
        : {}),
    },
  });

  // Send welcome email (non-blocking — don't fail the request if email fails)
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const investorName = investor.name ? investor.name.split(" ")[0] : "there";
  sendEmail({
    to: investor.email,
    subject: "You're Invited — Papaya Investor Dataroom",
    html: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 48px 24px; color: #333;">
        <img src="${baseUrl}/papaya-logo.png" alt="Papaya" style="height: 28px; margin-bottom: 32px;" />

        <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 20px;">
          Welcome to Papaya's Investor Dataroom
        </h1>

        <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
          Hi ${investorName},
        </p>

        <p style="font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
          Thank you for your interest in Papaya. We're excited to share our journey with you.
        </p>

        <p style="font-size: 15px; line-height: 1.7; margin: 0 0 24px;">
          We've prepared a dedicated dataroom where you can explore our pitch deck, financials, product roadmap, and other key materials — all in one place, at your own pace.
        </p>

        <div style="margin: 32px 0; text-align: center;">
          <a href="${baseUrl}" style="display: inline-block; background: #e91e63; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.2px;">
            Enter Dataroom
          </a>
        </div>

        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
          <p style="font-size: 13px; line-height: 1.6; color: #555; margin: 0;">
            <strong>How to sign in:</strong> Click the button above and enter your email address (<span style="color: #e91e63;">${investor.email}</span>). You'll receive a one-time verification code — no password needed.
          </p>
        </div>

        <p style="font-size: 15px; line-height: 1.7; margin: 24px 0 0;">
          If you have any questions or would like to schedule a conversation, please don't hesitate to reach out. We'd love to hear from you.
        </p>

        <p style="font-size: 15px; line-height: 1.7; margin: 24px 0 0;">
          Warm regards,<br />
          <strong>The Papaya Team</strong>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 36px 0 16px;" />

        <p style="font-size: 11px; color: #aaa; line-height: 1.5; margin: 0;">
          You're receiving this because your email was added to the Papaya investor dataroom.
          If this wasn't intended for you, you can safely ignore this message.
        </p>
      </div>
    `,
  }).catch((err) => {
    console.error("Failed to send welcome email:", err);
  });

  return NextResponse.json(investor, { status: 201 });
}
