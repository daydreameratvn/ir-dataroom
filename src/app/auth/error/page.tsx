import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const errorMessages: Record<string, string> = {
  AccessDenied:
    "Access denied. Your email is not on the approved investor list. Please contact us if you believe this is an error.",
  Verification:
    "The verification code is invalid or has expired. Please request a new code.",
  CredentialsSignin:
    "Invalid or expired verification code. Please request a new code.",
  Default:
    "An unexpected error occurred during authentication. Please try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    errorMessages[error ?? ""] ?? errorMessages.Default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            Authentication error
          </CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button asChild>
            <Link href="/auth/signin">Try again</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
