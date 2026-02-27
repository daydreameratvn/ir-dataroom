import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const session = await auth();

  if (session?.user?.email) {
    // Check if admin
    const admin = await prisma.adminUser.findUnique({
      where: { email: session.user.email },
    });
    if (admin) {
      redirect("/admin");
    }

    // Check if investor
    const investor = await prisma.investor.findUnique({
      where: { email: session.user.email },
    });
    if (investor) {
      if (investor.status === "nda_accepted") {
        redirect("/dataroom");
      } else {
        redirect("/dataroom/nda");
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/papaya-logo.png"
              alt="Papaya"
              className="h-10 w-auto"
            />
          </div>
          <CardTitle className="text-2xl">Investor Dataroom</CardTitle>
          <CardDescription>
            Secure access to confidential investment documents
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link href="/auth/signin">
            <Button className="w-full" size="lg">
              Sign In with Email
            </Button>
          </Link>
          <p className="text-xs text-center text-muted-foreground mt-2">
            Access is restricted to invited investors only.
            <br />
            You will receive a verification code via email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
