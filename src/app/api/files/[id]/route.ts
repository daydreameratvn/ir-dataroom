import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";
import { invalidateVideoCache } from "@/lib/watermark/video";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "files");

// GET /api/files/[id] - Get file metadata
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.json(file);
}

// DELETE /api/files/[id] - Delete a file (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Delete physical file
  try {
    await fs.unlink(path.join(UPLOAD_DIR, file.storagePath));
  } catch {
    // File might not exist on disk
  }

  // Invalidate video cache if applicable
  if (file.mimeType.startsWith("video/")) {
    await invalidateVideoCache(file.id);
  }

  // Delete DB record (cascades to access logs)
  await prisma.file.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
