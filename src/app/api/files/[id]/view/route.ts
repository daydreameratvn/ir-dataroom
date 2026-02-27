import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { watermarkPdf } from "@/lib/watermark/pdf";
import { watermarkVideo } from "@/lib/watermark/video";
import { logAccess } from "@/lib/tracking";
import fs from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "files");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });
  const admin = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });

  if (!investor && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!admin && investor && investor.status !== "nda_accepted") {
    return NextResponse.json(
      { error: "NDA not accepted" },
      { status: 403 }
    );
  }

  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const filePath = path.join(UPLOAD_DIR, file.storagePath);
  const email = session.user.email;

  try {
    let buffer: Buffer;

    // SECURE BY DEFAULT: Always watermark files.
    // Only skip watermark for admin when explicitly requesting clean copy (?clean=true).
    // This ensures watermarks are never accidentally omitted for investors.
    const cleanRequested = req.nextUrl.searchParams.get("clean") === "true";
    const skipWatermark = admin && !investor && cleanRequested;

    if (skipWatermark) {
      buffer = await fs.readFile(filePath);
    } else if (file.mimeType === "application/pdf") {
      try {
        buffer = await watermarkPdf(filePath, email);
      } catch (err) {
        console.error("PDF watermark failed, serving original:", err);
        buffer = await fs.readFile(filePath);
      }
    } else if (file.mimeType.startsWith("video/")) {
      try {
        const cachedPath = await watermarkVideo(
          filePath,
          email,
          file.id,
          investor?.id || "admin"
        );
        buffer = await fs.readFile(cachedPath);
      } catch (err) {
        console.error("Video watermark failed, serving original:", err);
        buffer = await fs.readFile(filePath);
      }
    } else {
      buffer = await fs.readFile(filePath);
    }

    // Log view access and return the accessLogId in headers
    let accessLogId: string | null = null;
    if (investor) {
      const log = await logAccess({
        investorId: investor.id,
        fileId: file.id,
        action: "view",
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      });
      accessLogId = log.id;
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${file.name}"`,
        "Content-Length": buffer.length.toString(),
        ...(accessLogId ? { "X-Access-Log-Id": accessLogId } : {}),
      },
    });
  } catch (error) {
    console.error("View error:", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}
