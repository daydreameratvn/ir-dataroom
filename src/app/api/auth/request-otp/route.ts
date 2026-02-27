import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is an admin or an approved investor
    const admin = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    const investor = await prisma.investor.findUnique({
      where: { email: normalizedEmail },
    });

    if (!admin && (!investor || investor.status === "revoked")) {
      // Don't reveal whether the email exists — return generic success
      return NextResponse.json({ success: true });
    }

    // Invalidate previous unused OTP codes for this email
    await prisma.otpCode.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    // Generate 4-digit code (1000-9999)
    const code = String(Math.floor(1000 + Math.random() * 9000));

    // Store OTP with 10-minute expiry
    await prisma.otpCode.create({
      data: {
        email: normalizedEmail,
        code,
        expires: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Send OTP email
    await sendEmail({
      to: normalizedEmail,
      subject: "Your verification code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">Your verification code</h2>
          <p style="color: #666; margin-bottom: 24px;">Enter this code to sign in to the dataroom:</p>
          <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #999; font-size: 13px;">This code expires in 10 minutes. If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Request OTP error:", error);
    return NextResponse.json(
      { error: "Failed to send verification code" },
      { status: 500 }
    );
  }
}
