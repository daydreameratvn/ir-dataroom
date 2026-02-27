import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/nda - Get current NDA text
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const template = await prisma.ndaTemplate.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!template) {
    return NextResponse.json(
      { error: "No NDA template configured" },
      { status: 404 }
    );
  }

  // Also check if the current investor has already accepted
  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  return NextResponse.json({
    content: template.content,
    alreadyAccepted: !!investor?.ndaAcceptedAt,
    acceptedAt: investor?.ndaAcceptedAt,
  });
}

// POST /api/nda - Accept NDA (checkbox consent)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  if (!investor) {
    return NextResponse.json(
      { error: "Investor not found" },
      { status: 404 }
    );
  }

  if (investor.ndaAcceptedAt) {
    return NextResponse.json({ message: "NDA already accepted" });
  }

  if (investor.status === "dropped" || investor.status === "revoked") {
    return NextResponse.json(
      { error: "Access has been revoked" },
      { status: 403 }
    );
  }

  const body = await req.json();
  if (!body.accepted) {
    return NextResponse.json(
      { error: "You must accept the NDA to proceed" },
      { status: 400 }
    );
  }

  // Log consent with IP and user agent
  const ipAddress =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";

  const updated = await prisma.investor.update({
    where: { id: investor.id },
    data: {
      status: "nda_accepted",
      ndaAcceptedAt: new Date(),
      ndaIpAddress: ipAddress,
      ndaUserAgent: userAgent,
    },
  });

  return NextResponse.json({
    message: "NDA accepted successfully",
    investor: updated,
  });
}
