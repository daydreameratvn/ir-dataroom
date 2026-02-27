import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { DataroomTabs } from "@/components/dataroom/DataroomTabs";
import { Shield } from "lucide-react";
import { hasDataroomAccess } from "@/lib/statuses";

export default async function DataroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/auth/signin");
  }

  const investor = await prisma.investor.findUnique({
    where: { email: session.user.email },
  });

  if (!investor) {
    redirect("/auth/signin");
  }

  if (investor.status === "dropped" || investor.status === "revoked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p className="mt-2 text-gray-600">
            Your access to the investor dataroom has been revoked. Please
            contact us if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  const ndaAccepted = hasDataroomAccess(investor.status);

  // Check if user is also an admin (for "Back to Admin" button)
  const isAlsoAdmin = await prisma.adminUser.findUnique({
    where: { email: session.user.email },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/papaya-logo.png"
            alt="Papaya"
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-4">
            {isAlsoAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
              >
                <Shield className="h-3.5 w-3.5" />
                Back to Admin
              </Link>
            )}
            <span className="text-sm text-gray-600">
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        </div>
        {ndaAccepted && (
          <div className="mx-auto max-w-7xl">
            <DataroomTabs />
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
