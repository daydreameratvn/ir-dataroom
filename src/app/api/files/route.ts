import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { Readable } from "stream";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "files");

// GET /api/files - List all files
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const files = await prisma.file.findMany({
    orderBy: [{ category: "asc" }, { uploadedAt: "desc" }],
  });

  return NextResponse.json(files);
}

// POST /api/files - Upload a file (admin only)
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

  const formData = await req.formData();
  const file = formData.get("file") as globalThis.File | null;
  const category = formData.get("category") as string | null;

  if (!file || !category) {
    return NextResponse.json(
      { error: "File and category are required" },
      { status: 400 }
    );
  }

  // Validate file type
  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];

  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Supported: PDF, Excel, Video" },
      { status: 400 }
    );
  }

  // Save file to disk using streaming for large files
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name);
  const storageName = `${uuidv4()}${ext}`;
  const storagePath = path.join(UPLOAD_DIR, storageName);

  // Stream the file to disk instead of loading entirely into memory
  const writeStream = createWriteStream(storagePath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readable = Readable.fromWeb(file.stream() as any);
  await new Promise<void>((resolve, reject) => {
    readable.pipe(writeStream);
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  // Save metadata to DB
  const fileRecord = await prisma.file.create({
    data: {
      name: file.name,
      storagePath: storageName,
      mimeType: file.type,
      size: file.size,
      category,
    },
  });

  return NextResponse.json(fileRecord, { status: 201 });
}
