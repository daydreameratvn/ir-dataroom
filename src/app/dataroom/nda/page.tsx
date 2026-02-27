import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NdaConsentForm } from "@/components/dataroom/NdaConsentForm";
import { CheckCircle2 } from "lucide-react";

export default async function NdaPage() {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  // Fetch active NDA template
  const template = await prisma.ndaTemplate.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!template) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">
          No NDA template is currently configured. Please contact us.
        </p>
      </div>
    );
  }

  const ndaAccepted = investor?.status === "nda_accepted";

  // Mode 1: NDA already accepted — show signed NDA with sign-off details
  if (ndaAccepted) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
          <h2 className="text-2xl font-bold">Non-Disclosure Agreement</h2>
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            Accepted
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>NDA Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[32rem] overflow-y-auto rounded border bg-gray-50 p-4">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                {template.content}
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-base">Sign-Off Record</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Signed by
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  {investor.email}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date & Time
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  {investor.ndaAcceptedAt
                    ? new Date(investor.ndaAcceptedAt).toLocaleString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        timeZoneName: "short",
                      })
                    : "N/A"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-gray-500">
                  IP Address
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-900">
                  {investor.ndaIpAddress || "N/A"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Mode 2: NDA not yet accepted — show acceptance form
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-6 text-2xl font-bold">Non-Disclosure Agreement</h2>
      <p className="mb-4 text-sm text-gray-600">
        Please review and accept the following Non-Disclosure Agreement to
        access the investor dataroom.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>NDA Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto rounded border bg-gray-50 p-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {template.content}
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      <NdaConsentForm />
    </div>
  );
}
