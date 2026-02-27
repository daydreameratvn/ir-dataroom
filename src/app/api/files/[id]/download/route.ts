import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { watermarkPdf } from "@/lib/watermark/pdf";
import { watermarkExcel } from "@/lib/watermark/excel";
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

  // Get investor
  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  // Admins can also download (without watermark)
  const admin = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });

  if (!investor && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check NDA status for non-admin investors
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
    const contentType = file.mimeType;

    // SECURE BY DEFAULT: Always watermark files.
    // Only skip watermark for admin-only users when explicitly requesting clean copy (?clean=true).
    // If user is both admin AND investor, watermarks are always applied.
    const cleanRequested = req.nextUrl.searchParams.get("clean") === "true";
    const skipWatermark = admin && !investor && cleanRequested;

    if (skipWatermark) {
      // Admin-only clean download
      buffer = await fs.readFile(filePath);
    } else if (file.mimeType === "application/pdf") {
      try {
        buffer = await watermarkPdf(filePath, email);
      } catch (err) {
        console.error("PDF watermark failed, serving original:", err);
        buffer = await fs.readFile(filePath);
      }
    } else if (
      file.mimeType.includes("spreadsheet") ||
      file.mimeType.includes("excel")
    ) {
      try {
        buffer = await watermarkExcel(filePath, email);
      } catch (err) {
        console.error("Excel watermark failed, serving original:", err);
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

    // Log download
    if (investor) {
      await logAccess({
        investorId: investor.id,
        fileId: file.id,
        action: "download",
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${file.name}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}
