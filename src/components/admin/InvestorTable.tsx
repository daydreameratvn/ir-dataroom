"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Ban, Trash2, RefreshCw } from "lucide-react";

interface Investor {
  id: string;
  email: string;
  name: string | null;
  status: string;
  invitedAt: string;
  ndaAcceptedAt: string | null;
  accessLogs?: { startedAt: string }[];
}

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "nda_accepted":
      return "default";
    case "invited":
      return "secondary";
    case "revoked":
      return "destructive";
    default:
      return "outline";
  }
}

function getLastActive(investor: Investor): string {
  if (investor.accessLogs && investor.accessLogs.length > 0) {
    return new Date(investor.accessLogs[0].startedAt).toLocaleDateString();
  }
  return "Never";
}

export function InvestorManager() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const fetchInvestors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/investors");
      if (!res.ok) throw new Error("Failed to fetch investors");
      const data = await res.json();
      setInvestors(data);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load investors.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  const handleAdd = async () => {
    if (!newEmail.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add investor");
      }
      toast({ title: "Success", description: "Investor added successfully." });
      setNewEmail("");
      setNewName("");
      setDialogOpen(false);
      fetchInvestors();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add investor";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/investors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked" }),
      });
      if (!res.ok) throw new Error("Failed to revoke investor");
      toast({ title: "Success", description: "Investor access revoked." });
      fetchInvestors();
    } catch {
      toast({
        title: "Error",
        description: "Failed to revoke investor.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this investor?")) return;
    try {
      const res = await fetch(`/api/investors/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete investor");
      toast({ title: "Success", description: "Investor deleted." });
      fetchInvestors();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete investor.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Investors</h2>
          <p className="text-muted-foreground">
            Manage investor access to your dataroom.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchInvestors}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Investor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Investor</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="investor@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    placeholder="John Doe"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={submitting || !newEmail.trim()}
                  className="w-full"
                >
                  {submitting ? "Adding..." : "Add Investor"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Investors</CardTitle>
          <CardDescription>
            {investors.length} investor{investors.length !== 1 ? "s" : ""} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading investors...
            </div>
          ) : investors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No investors yet. Add one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>NDA Accepted</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor) => (
                  <TableRow key={investor.id}>
                    <TableCell className="font-medium">
                      {investor.email}
                    </TableCell>
                    <TableCell>{investor.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(investor.status)}>
                        {investor.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {investor.ndaAcceptedAt
                        ? new Date(investor.ndaAcceptedAt).toLocaleDateString()
                        : "Pending"}
                    </TableCell>
                    <TableCell>{getLastActive(investor)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {investor.status !== "revoked" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevoke(investor.id)}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            Revoke
                          </Button>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(investor.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
