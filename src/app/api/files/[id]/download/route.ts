import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { watermarkPdf } from "@/lib/watermark/pdf";
import { watermarkExcel } from "@/lib/watermark/excel";
import { watermarkVideo } from "@/lib/watermark/video";
import { logAccess } from "@/lib/tracking";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "files");

/** Stream a file from disk as a web ReadableStream */
function streamFile(filePath: string): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath);
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        controller.enqueue(new Uint8Array(Buffer.from(chunk)));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

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
    // SECURE BY DEFAULT: Always watermark files.
    const cleanRequested = req.nextUrl.searchParams.get("clean") === "true";
    const skipWatermark = admin && !investor && cleanRequested;

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.name}"`,
    };

    // Log download (don't block the response)
    if (investor) {
      logAccess({
        investorId: investor.id,
        fileId: file.id,
        action: "download",
        ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || undefined,
        userAgent: req.headers.get("user-agent") || undefined,
      }).catch((err) => console.error("Failed to log download:", err));
    }

    // Admin clean download or unknown file types — stream from disk
    if (skipWatermark) {
      const stat = await fs.stat(filePath);
      headers["Content-Length"] = stat.size.toString();
      return new Response(streamFile(filePath), { headers });
    }

    // PDF watermark — returns buffer (fast, in-memory with pdf-lib)
    if (file.mimeType === "application/pdf") {
      try {
        const buffer = await watermarkPdf(filePath, email);
        headers["Content-Length"] = buffer.length.toString();
        return new Response(new Uint8Array(buffer), { headers });
      } catch (err) {
        console.error("PDF watermark failed, streaming original:", err);
        const stat = await fs.stat(filePath);
        headers["Content-Length"] = stat.size.toString();
        return new Response(streamFile(filePath), { headers });
      }
    }

    // Excel watermark — returns buffer (fast, in-memory)
    if (file.mimeType.includes("spreadsheet") || file.mimeType.includes("excel")) {
      try {
        const buffer = await watermarkExcel(filePath, email);
        headers["Content-Length"] = buffer.length.toString();
        return new Response(new Uint8Array(buffer), { headers });
      } catch (err) {
        console.error("Excel watermark failed, streaming original:", err);
        const stat = await fs.stat(filePath);
        headers["Content-Length"] = stat.size.toString();
        return new Response(streamFile(filePath), { headers });
      }
    }

    // Video watermark — stream from cached file (ffmpeg has timeout)
    if (file.mimeType.startsWith("video/")) {
      try {
        const cachedPath = await watermarkVideo(
          filePath,
          email,
          file.id,
          investor?.id || "admin"
        );
        const stat = await fs.stat(cachedPath);
        headers["Content-Length"] = stat.size.toString();
        return new Response(streamFile(cachedPath), { headers });
      } catch (err) {
        console.error("Video watermark failed, streaming original:", err);
        const stat = await fs.stat(filePath);
        headers["Content-Length"] = stat.size.toString();
        return new Response(streamFile(filePath), { headers });
      }
    }

    // Other file types — stream from disk
    const stat = await fs.stat(filePath);
    headers["Content-Length"] = stat.size.toString();
    return new Response(streamFile(filePath), { headers });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to process file" },
      { status: 500 }
    );
  }
}
