"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { signIn } from "next-auth/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Auto-focus first OTP input when entering OTP stage
  useEffect(() => {
    if (stage === "otp") {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [stage]);

  async function handleRequestOtp(e?: React.FormEvent) {
    e?.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send code");
        setIsLoading(false);
        return;
      }

      setStage("otp");
      setOtp(["", "", "", ""]);
      setCooldown(60);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      setIsLoading(true);
      setError("");

      try {
        const result = await signIn("otp", {
          email,
          code,
          redirect: false,
        });

        if (result?.error) {
          setError("Invalid or expired code. Please try again.");
          setOtp(["", "", "", ""]);
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } else if (result?.ok) {
          // Redirect on success
          window.location.href = "/";
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [email]
  );

  function handleOtpChange(index: number, value: string) {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3) {
      const code = newOtp.join("");
      if (code.length === 4) {
        handleVerifyOtp(code);
      }
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (pasted.length === 0) return;

    const newOtp = ["", "", "", ""];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);

    // Focus the next empty input or last one
    const nextEmpty = pasted.length < 4 ? pasted.length : 3;
    inputRefs.current[nextEmpty]?.focus();

    // Auto-submit if all 4 digits pasted
    if (pasted.length === 4) {
      handleVerifyOtp(pasted);
    }
  }

  function handleBack() {
    setStage("email");
    setOtp(["", "", "", ""]);
    setError("");
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/papaya-logo.png"
          alt="Papaya"
          className="h-10 w-auto"
        />
      </div>
      <Card className="w-full max-w-md mx-4">
        {stage === "email" ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
              <CardDescription>
                Enter your email to receive a verification code
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRequestOtp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Sending code..." : "Send verification code"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Only approved investors can access the dataroom.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">
                Enter verification code
              </CardTitle>
              <CardDescription>
                We sent a 4-digit code to{" "}
                <span className="font-medium text-slate-700">{email}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex justify-center gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className="w-14 h-16 text-center text-2xl font-bold border-2 rounded-lg
                        focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/20
                        transition-all disabled:opacity-50"
                      disabled={isLoading}
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>

                {error && (
                  <p className="text-sm text-red-600 text-center">{error}</p>
                )}

                {isLoading && (
                  <p className="text-sm text-slate-500 text-center">
                    Verifying...
                  </p>
                )}

                <div className="flex flex-col items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={() => handleRequestOtp()}
                    disabled={cooldown > 0 || isLoading}
                    className="text-slate-600 hover:text-slate-900 underline underline-offset-4 disabled:opacity-50 disabled:no-underline"
                  >
                    {cooldown > 0
                      ? `Resend code in ${cooldown}s`
                      : "Resend code"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBack}
                    disabled={isLoading}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
