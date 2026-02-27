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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, Pencil, Check, X } from "lucide-react";
import {
  STATUS_LABELS,
  INVESTOR_STATUSES,
  getStatusStyle,
} from "@/lib/statuses";

interface Investor {
  id: string;
  email: string;
  name: string | null;
  firm: string | null;
  status: string;
  invitedAt: string;
  ndaAcceptedAt: string | null;
  ndaRequired: boolean;
  lastActiveAt: string | null;
  totalViews: number;
  totalDownloads: number;
  uniqueFilesViewed: number;
  totalTimeSpent: number;
}

function getDaysAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function getSignal(investor: Investor): { label: string; color: string; tip: string; rec: string } | null {
  if (["termsheet_sent", "termsheet_signed", "docs_out", "dropped"].includes(investor.status)) return null;

  const daysSinceActive = investor.lastActiveAt
    ? Math.floor((Date.now() - new Date(investor.lastActiveAt).getTime()) / 86400000)
    : Infinity;
  const hasActivity = investor.totalViews > 0 || investor.totalDownloads > 0;

  if (!hasActivity) {
    return { label: "New", color: "#9ca3af", tip: "No activity yet.", rec: "Send intro email or share dataroom link" };
  }
  if (daysSinceActive >= 14) {
    return { label: "Cold", color: "#ef4444", tip: "Inactive 14+ days.", rec: "Send follow-up to re-engage" };
  }
  if (investor.totalDownloads > 0 && daysSinceActive < 7) {
    return { label: "Hot", color: "#22c55e", tip: "Downloading files.", rec: "Send termsheet or schedule call" };
  }
  if ((investor.totalViews >= 5 || investor.totalDownloads >= 2 || investor.totalTimeSpent >= 300) && daysSinceActive < 14) {
    return { label: "Engaged", color: "#3b82f6", tip: "Strong engagement.", rec: "Prioritize — share key materials" };
  }
  if (investor.totalViews > 0 && investor.totalDownloads === 0 && daysSinceActive < 7) {
    return { label: "Warming", color: "#eab308", tip: "Browsing, no downloads.", rec: "Nudge with highlights or Q&A" };
  }

  return null;
}

function EditableCell({
  value,
  placeholder,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  onSave: (newValue: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  const handleSave = () => {
    const trimmed = draft.trim();
    const newVal = trimmed || null;
    if (newVal !== value) {
      onSave(newVal);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          className="h-7 text-sm w-32"
          autoFocus
          placeholder={placeholder}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-800">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value || ""); setEditing(true); }}
      className="group flex items-center gap-1 text-left hover:text-blue-600"
    >
      <span>{value || "-"}</span>
      <Pencil className="h-3 w-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export function InvestorManager() {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newFirm, setNewFirm] = useState("");
  const [skipNda, setSkipNda] = useState(false);
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
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || null, firm: newFirm.trim() || null, skipNda }),
      });
      if (!res.ok) {
        let message = "Failed to add investor";
        try {
          const err = await res.json();
          message = err.error || message;
        } catch {
          // Server returned non-JSON (e.g. HTML 500 page)
        }
        throw new Error(message);
      }
      toast({ title: "Success", description: "Investor added successfully." });
      setNewEmail("");
      setNewName("");
      setNewFirm("");
      setSkipNda(false);
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

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/investors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast({ title: "Success", description: `Status updated to ${STATUS_LABELS[newStatus] || newStatus}.` });
      fetchInvestors();
    } catch {
      toast({
        title: "Error",
        description: "Failed to update investor status.",
        variant: "destructive",
      });
    }
  };

  const handleFieldUpdate = async (id: string, field: "name" | "firm", value: string | null) => {
    try {
      const res = await fetch(`/api/investors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error(`Failed to update ${field}`);
      toast({ title: "Success", description: `${field.charAt(0).toUpperCase() + field.slice(1)} updated.` });
      fetchInvestors();
    } catch {
      toast({
        title: "Error",
        description: `Failed to update ${field}.`,
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
                <div className="space-y-2">
                  <Label htmlFor="firm">Firm (optional)</Label>
                  <Input
                    id="firm"
                    placeholder="Sequoia Capital"
                    value={newFirm}
                    onChange={(e) => setNewFirm(e.target.value)}
                  />
                </div>
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <input
                    type="checkbox"
                    id="skipNda"
                    checked={skipNda}
                    onChange={(e) => setSkipNda(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <Label htmlFor="skipNda" className="text-sm font-medium cursor-pointer">
                      Skip NDA requirement
                    </Label>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Check this if the investor has already signed an NDA offline. They will get immediate access without signing online.
                    </p>
                  </div>
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
                  <TableHead>Firm</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>NDA Accepted</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Recommendation</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {investors.map((investor) => (
                  <TableRow key={investor.id}>
                    <TableCell className="font-medium">
                      {investor.email}
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={investor.name}
                        placeholder="Name"
                        onSave={(val) => handleFieldUpdate(investor.id, "name", val)}
                      />
                    </TableCell>
                    <TableCell>
                      <EditableCell
                        value={investor.firm}
                        placeholder="Firm"
                        onSave={(val) => handleFieldUpdate(investor.id, "firm", val)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <span
                          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                          style={getStatusStyle(investor.status)}
                        >
                          {STATUS_LABELS[investor.status] || investor.status}
                        </span>
                        {(investor.status === "dropped" || investor.status === "revoked") && (
                          <p className="text-[11px] text-red-500 mt-0.5">Access revoked</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {investor.ndaAcceptedAt
                        ? new Date(investor.ndaAcceptedAt).toLocaleDateString()
                        : !investor.ndaRequired
                          ? <span className="text-xs text-blue-600">Offline</span>
                          : "Pending"}
                    </TableCell>
                    <TableCell className="text-sm">{getDaysAgo(investor.lastActiveAt)}</TableCell>
                    {(() => {
                      const signal = getSignal(investor);
                      return (
                        <>
                          <TableCell>
                            {signal ? (
                              <div className="flex items-center gap-1.5" title={signal.tip}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: signal.color, display: "inline-block" }} />
                                <span className="text-xs font-medium" style={{ color: signal.color }}>{signal.label}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {signal ? (
                              <span className="text-xs text-gray-600">{signal.rec}</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </TableCell>
                        </>
                      );
                    })()}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={investor.status}
                          onChange={(e) => {
                            const newStatus = e.target.value;
                            if (newStatus === investor.status) return;
                            if (newStatus === "dropped") {
                              if (!confirm(`Are you sure you want to drop ${investor.email}? This will revoke all their dataroom access.`)) {
                                e.target.value = investor.status;
                                return;
                              }
                            }
                            handleStatusChange(investor.id, newStatus);
                          }}
                        >
                          {INVESTOR_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
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
