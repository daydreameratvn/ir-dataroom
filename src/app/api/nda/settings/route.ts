import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/nda/settings - Update NDA text (admin only)
export async function PUT(req: NextRequest) {
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
  if (!body.content || typeof body.content !== "string") {
    return NextResponse.json(
      { error: "NDA content is required" },
      { status: 400 }
    );
  }

  // Deactivate all existing templates
  await prisma.ndaTemplate.updateMany({
    data: { isActive: false },
  });

  // Create new active template
  const template = await prisma.ndaTemplate.create({
    data: {
      content: body.content,
      isActive: true,
    },
  });

  return NextResponse.json(template);
}
