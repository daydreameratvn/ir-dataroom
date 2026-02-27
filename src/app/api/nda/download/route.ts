import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSignedNdaPdf } from "@/lib/nda-pdf";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  if (!investor || !investor.ndaAcceptedAt) {
    return NextResponse.json(
      { error: "NDA not yet accepted" },
      { status: 403 }
    );
  }

  // Use the signed version if available, fallback to active (legacy)
  let template;
  if (investor.ndaTemplateId) {
    template = await prisma.ndaTemplate.findUnique({
      where: { id: investor.ndaTemplateId },
    });
  }
  if (!template) {
    template = await prisma.ndaTemplate.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!template) {
    return NextResponse.json(
      { error: "No NDA template found" },
      { status: 404 }
    );
  }

  const pdfBuffer = await generateSignedNdaPdf(template.content, {
    email: investor.email,
    name: investor.name,
    firm: investor.firm,
    ndaAcceptedAt: investor.ndaAcceptedAt,
    ndaIpAddress: investor.ndaIpAddress,
  });

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="NDA-Signed.pdf"`,
      "Content-Length": pdfBuffer.length.toString(),
    },
  });
}
