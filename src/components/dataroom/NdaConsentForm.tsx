"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function NdaConsentForm() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/nda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to accept NDA");
      }

      router.push("/dataroom");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start space-x-3">
        <Checkbox
          id="nda-consent"
          checked={agreed}
          onCheckedChange={(checked) => setAgreed(checked === true)}
        />
        <Label htmlFor="nda-consent" className="text-sm leading-relaxed">
          I have read and agree to the terms of this Non-Disclosure Agreement
        </Label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={!agreed || submitting}>
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </form>
  );
}
