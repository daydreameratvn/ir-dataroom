"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const [ndaText, setNdaText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchNda = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/nda");
      if (!res.ok) throw new Error("Failed to fetch NDA");
      const data = await res.json();
      setNdaText(data.content || "");
    } catch {
      toast({
        title: "Error",
        description: "Failed to load NDA template.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchNda();
  }, [fetchNda]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/nda/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: ndaText }),
      });
      if (!res.ok) throw new Error("Failed to save NDA");
      toast({
        title: "Success",
        description: "NDA template saved successfully.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save NDA template.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure your dataroom settings.
        </p>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>NDA Template</CardTitle>
          <CardDescription>
            Edit the Non-Disclosure Agreement text that investors must accept
            before accessing the dataroom.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading NDA template...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="nda-text">NDA Content</Label>
                <Textarea
                  id="nda-text"
                  value={ndaText}
                  onChange={(e) => setNdaText(e.target.value)}
                  rows={20}
                  placeholder="Enter your NDA text here..."
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save NDA Template"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
