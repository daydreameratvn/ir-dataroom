import { Fragment, useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Send, Building2, Pencil, Check, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@papaya/shared-ui';
import type { InvestorRound, InvestorRoundStatus, InvestorEngagement, EngagementSignal, NdaMode } from '../types';
import {
  listRoundInvestors,
  updateInvestorStatus,
  updateInvestorProfile,
  removeInvestorFromRound,
  sendInvitation,
  getRoundEngagement,
  updateNdaMode,
} from '../api';
import InvestorStatusBadge from './InvestorStatusBadge';
import InvestorInviteDialog from './InvestorInviteDialog';

interface InvestorTableProps {
  roundId: string;
}

const INVESTOR_STATUSES: InvestorRoundStatus[] = [
  'invited',
  'nda_signed',
  'viewing',
  'termsheet_sent',
  'termsheet_signed',
  'docs_out',
  'docs_signed',
  'dropped',
];

function getDaysAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

// ── Engagement signal computation ──

function getSignal(eng: InvestorEngagement): EngagementSignal | null {
  if (['termsheet_sent', 'termsheet_signed', 'docs_out', 'docs_signed', 'dropped'].includes(eng.status)) return null;

  const daysSinceActive = eng.lastActiveAt
    ? Math.floor((Date.now() - new Date(eng.lastActiveAt).getTime()) / 86400000)
    : Infinity;
  const hasActivity = eng.totalViews > 0 || eng.totalDownloads > 0;

  if (!hasActivity) {
    return { label: 'New', color: '#9ca3af', tip: 'No activity yet.', rec: 'Send intro email or share dataroom link' };
  }
  if (daysSinceActive >= 14) {
    return { label: 'Cold', color: '#ef4444', tip: 'Inactive 14+ days.', rec: 'Send follow-up to re-engage' };
  }
  if (eng.totalDownloads > 0 && daysSinceActive < 7) {
    return { label: 'Hot', color: '#22c55e', tip: 'Downloading files.', rec: 'Send termsheet or schedule call' };
  }
  if ((eng.totalViews >= 5 || eng.totalDownloads >= 2 || eng.totalTimeSpent >= 300) && daysSinceActive < 14) {
    return { label: 'Engaged', color: '#3b82f6', tip: 'Strong engagement.', rec: 'Prioritize \u2014 share key materials' };
  }
  if (eng.totalViews > 0 && eng.totalDownloads === 0 && daysSinceActive < 7) {
    return { label: 'Warming', color: '#eab308', tip: 'Browsing, no downloads.', rec: 'Nudge with highlights or Q&A' };
  }

  return null;
}

// ── Firm grouping ──

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'proton.me', 'zoho.com',
  'yandex.com', 'live.com', 'msn.com', 'me.com', 'hey.com',
]);

function getInferredFirm(email: string, firm: string | null): string | null {
  if (firm) return firm.toLowerCase().trim();
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function getFirmGroupLabel(email: string, firm: string | null): string | null {
  if (firm) return firm;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return null;
  const name = domain.split('.')[0] ?? '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

type InvestorWithEngagement = InvestorRound & Partial<InvestorEngagement>;

function groupByFirm(investors: InvestorWithEngagement[]): InvestorWithEngagement[] {
  const firmMap = new Map<string, InvestorWithEngagement[]>();
  const ungrouped: InvestorWithEngagement[] = [];

  for (const inv of investors) {
    const firm = getInferredFirm(inv.investorEmail, inv.investorFirm);
    if (firm) {
      const list = firmMap.get(firm) || [];
      list.push(inv);
      firmMap.set(firm, list);
    } else {
      ungrouped.push(inv);
    }
  }

  const sortedFirms = Array.from(firmMap.entries()).sort((a, b) => {
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  const result: InvestorWithEngagement[] = [];
  for (const [, group] of sortedFirms) {
    result.push(...group);
  }
  result.push(...ungrouped);
  return result;
}

// ── Inline editable cell (matches prototype's EditableCell) ──

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
  const [draft, setDraft] = useState(value || '');

  const handleSave = () => {
    const trimmed = draft.trim();
    const newVal = trimmed || null;
    if (newVal !== value) {
      onSave(newVal);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          className="h-7 text-sm w-32"
          autoFocus
          placeholder={placeholder}
        />
        <button onClick={handleSave} className="text-green-600 hover:text-green-800">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={handleCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setDraft(value || ''); setEditing(true); }}
      className="group flex items-center gap-1 text-left hover:text-blue-600"
    >
      <span>{value || '-'}</span>
      <Pencil className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export default function InvestorTable({ roundId }: InvestorTableProps) {
  const [investors, setInvestors] = useState<InvestorRound[]>([]);
  const [engagement, setEngagement] = useState<Map<string, InvestorEngagement>>(new Map());
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [groupedByFirm, setGroupedByFirm] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<InvestorRound | null>(null);
  const [dropTarget, setDropTarget] = useState<InvestorRound | null>(null);
  const [resendTarget, setResendTarget] = useState<InvestorRound | null>(null);
  const [resending, setResending] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [ndaModeTarget, setNdaModeTarget] = useState<{ inv: InvestorRound; newMode: NdaMode } | null>(null);
  const limit = 20;

  const fetchInvestors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [result, engagementData] = await Promise.all([
        listRoundInvestors(roundId, { page, limit }),
        getRoundEngagement(roundId).catch(() => [] as InvestorEngagement[]),
      ]);
      setInvestors(result.data);
      setTotal(result.total);

      const engMap = new Map<string, InvestorEngagement>();
      for (const eng of engagementData) {
        engMap.set(eng.investorId, eng);
      }
      setEngagement(engMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch investors');
    } finally {
      setIsLoading(false);
    }
  }, [roundId, page]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  async function handleStatusChange(inv: InvestorRound, newStatus: InvestorRoundStatus) {
    if (newStatus === 'dropped') {
      setDropTarget(inv);
      return;
    }
    try {
      await updateInvestorStatus(roundId, inv.id, newStatus);
      setInvestors((prev) =>
        prev.map((i) => (i.id === inv.id ? { ...i, status: newStatus } : i))
      );
    } catch {
      fetchInvestors();
    }
  }

  async function handleDropConfirmed() {
    if (!dropTarget) return;
    const investorRoundId = dropTarget.id;
    setDropTarget(null);
    try {
      await updateInvestorStatus(roundId, investorRoundId, 'dropped');
      setInvestors((prev) =>
        prev.map((i) => (i.id === investorRoundId ? { ...i, status: 'dropped' as InvestorRoundStatus } : i))
      );
    } catch {
      fetchInvestors();
    }
  }

  async function handleFieldUpdate(investorId: string, field: 'name' | 'firm', value: string | null) {
    try {
      await updateInvestorProfile(investorId, { [field]: value });
      // Optimistically update local state
      setInvestors((prev) =>
        prev.map((inv) => {
          if (inv.investorId !== investorId) return inv;
          if (field === 'name') return { ...inv, investorName: value ?? inv.investorName };
          if (field === 'firm') return { ...inv, investorFirm: value };
          return inv;
        })
      );
    } catch {
      fetchInvestors();
    }
  }

  function requestNdaModeChange(inv: InvestorRound, newMode: NdaMode) {
    // Switching to digital requires confirmation — investor will need to accept the NDA
    if (newMode === 'digital' && inv.ndaMode !== 'digital') {
      setNdaModeTarget({ inv, newMode });
      return;
    }
    applyNdaModeChange(inv.id, newMode);
  }

  async function applyNdaModeChange(investorRoundId: string, newMode: NdaMode) {
    try {
      await updateNdaMode(roundId, investorRoundId, newMode);
      setInvestors((prev) =>
        prev.map((inv) =>
          inv.id === investorRoundId
            ? { ...inv, ndaMode: newMode, ndaRequired: newMode === 'digital' }
            : inv
        )
      );
    } catch {
      fetchInvestors();
    }
  }

  async function handleNdaModeConfirmed() {
    if (!ndaModeTarget) return;
    const { inv, newMode } = ndaModeTarget;
    setNdaModeTarget(null);
    await applyNdaModeChange(inv.id, newMode);
  }

  async function handleRemoveConfirmed() {
    if (!removeTarget) return;
    const investorRoundId = removeTarget.id;
    setRemoveTarget(null);
    try {
      await removeInvestorFromRound(roundId, investorRoundId);
      setInvestors((prev) => prev.filter((inv) => inv.id !== investorRoundId));
      setTotal((prev) => prev - 1);
    } catch {
      fetchInvestors();
    }
  }

  function showNotification(type: 'success' | 'error', message: string) {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  }

  async function handleResendConfirmed() {
    if (!resendTarget) return;
    const { investorId, investorEmail } = resendTarget;
    setResendTarget(null);
    setResending(true);
    try {
      await sendInvitation(investorId);
      showNotification('success', `Invitation email sent to ${investorEmail}`);
    } catch (err) {
      showNotification('error', err instanceof Error ? err.message : 'Failed to send invitation email');
    } finally {
      setResending(false);
    }
  }

  // Merge investor round data with engagement data
  const investorsWithEngagement: InvestorWithEngagement[] = investors.map((inv) => {
    const eng = engagement.get(inv.investorId);
    // Spread eng but preserve typed status from inv
    return eng ? { ...inv, ...eng, status: inv.status } : inv;
  });

  const displayInvestors = groupedByFirm
    ? groupByFirm(investorsWithEngagement)
    : investorsWithEngagement;

  const totalPages = Math.ceil(total / limit);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Investors</h2>
        <p className="text-muted-foreground">Manage investor access to your dataroom.</p>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {total} investor{total !== 1 ? 's' : ''} in this round
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={groupedByFirm ? 'default' : 'outline'}
            size="sm"
            onClick={() => setGroupedByFirm((prev) => !prev)}
            className="gap-1.5"
            title="Group investors from the same firm together (auto-detects by email domain)"
          >
            <Building2 className="h-3.5 w-3.5" />
            {groupedByFirm ? 'Grouped by Firm' : 'Group by Firm'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchInvestors} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setInviteDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Investor
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {notification && (
        <div
          className={`rounded-md border px-3 py-2 text-sm flex items-center justify-between transition-opacity ${
            notification.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <span>{notification.type === 'success' ? '\u2705' : '\u274C'} {notification.message}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading investors...
        </div>
      ) : investors.length === 0 ? (
        <Card>
          <CardContent className="flex h-32 items-center justify-center pt-6 text-sm text-muted-foreground">
            No investors in this round yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Firm</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>NDA Mode</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Recommendation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayInvestors.map((inv, idx, arr) => {
                const firmLabel = groupedByFirm ? getFirmGroupLabel(inv.investorEmail, inv.investorFirm) : null;
                const prev = idx > 0 ? arr[idx - 1] : undefined;
                const prevFirmLabel =
                  groupedByFirm && prev
                    ? getFirmGroupLabel(prev.investorEmail, prev.investorFirm)
                    : null;
                const showFirmHeader = groupedByFirm && firmLabel && firmLabel !== prevFirmLabel;
                const showUngroupedHeader =
                  groupedByFirm &&
                  !firmLabel &&
                  prev != null &&
                  getFirmGroupLabel(prev.investorEmail, prev.investorFirm) !== null;

                const eng: InvestorEngagement | undefined = engagement.get(inv.investorId);
                const signal = eng ? getSignal(eng) : null;

                return (
                  <Fragment key={inv.id}>
                    {showFirmHeader && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={9} className="py-1.5 px-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {firmLabel}
                            </span>
                            <span className="text-xs text-muted-foreground/60">
                              ({arr.filter((i) => getFirmGroupLabel(i.investorEmail, i.investorFirm) === firmLabel).length})
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {showUngroupedHeader && (
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={9} className="py-1.5 px-4">
                          <span className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide">
                            Individual / Personal Email
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className="font-medium">
                        {inv.investorEmail}
                      </TableCell>
                      <TableCell>
                        <EditableCell
                          value={inv.investorName}
                          placeholder="Name"
                          onSave={(val) => handleFieldUpdate(inv.investorId, 'name', val)}
                        />
                      </TableCell>
                      <TableCell>
                        <EditableCell
                          value={inv.investorFirm}
                          placeholder="Firm"
                          onSave={(val) => handleFieldUpdate(inv.investorId, 'firm', val)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <Select
                            value={inv.status}
                            onValueChange={(v) => handleStatusChange(inv, v as InvestorRoundStatus)}
                          >
                            <SelectTrigger className="h-7 w-40 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INVESTOR_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  <InvestorStatusBadge status={s} />
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(inv.status === 'dropped') && (
                            <p className="text-[11px] text-red-500 mt-0.5">Access revoked</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={inv.ndaMode}
                          onValueChange={(v) => requestNdaModeChange(inv, v as NdaMode)}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="digital">Digital</SelectItem>
                            <SelectItem value="offline">Offline</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getDaysAgo(eng?.lastActiveAt ?? inv.lastAccessAt)}
                      </TableCell>
                      <TableCell>
                        {signal ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5 cursor-help">
                                <span
                                  className="inline-block rounded-full"
                                  style={{ width: 8, height: 8, backgroundColor: signal.color }}
                                />
                                <span className="text-xs font-medium" style={{ color: signal.color }}>
                                  {signal.label}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{signal.tip}</p>
                              <p className="text-xs mt-0.5 text-muted-foreground">
                                {eng?.totalViews ?? 0} views &bull; {eng?.totalDownloads ?? 0} downloads &bull;{' '}
                                {Math.round((eng?.totalTimeSpent ?? 0) / 60)}m spent
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {signal ? (
                          <span className="text-xs text-muted-foreground">{signal.rec}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setResendTarget(inv)}
                            disabled={resending}
                            className="h-7 px-2 text-xs"
                            title="Re-send invitation email"
                          >
                            <Send className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoveTarget(inv)}
                            className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                            title="Remove from round"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}

      <InvestorInviteDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        roundId={roundId}
        onAdded={fetchInvestors}
      />

      {/* Remove investor confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Investor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{removeTarget?.investorName}</strong> (
              {removeTarget?.investorEmail}) from this round? Their access will be revoked
              immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveConfirmed}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove Investor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Drop investor confirmation (revoke access) */}
      <AlertDialog open={!!dropTarget} onOpenChange={(open) => !open && setDropTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop Investor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to drop <strong>{dropTarget?.investorName}</strong> (
              {dropTarget?.investorEmail})? This will revoke all their dataroom access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDropConfirmed}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Drop &amp; Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resend invitation confirmation */}
      <AlertDialog open={!!resendTarget} onOpenChange={(open) => !open && setResendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resend Invitation Email</AlertDialogTitle>
            <AlertDialogDescription>
              Send the dataroom invitation email again to{' '}
              <strong>{resendTarget?.investorName}</strong> ({resendTarget?.investorEmail})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResendConfirmed}>
              Send Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* NDA mode change confirmation */}
      <AlertDialog open={!!ndaModeTarget} onOpenChange={(open) => !open && setNdaModeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change NDA Mode to Digital</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to switch{' '}
              <strong>{ndaModeTarget?.inv.investorName ?? ndaModeTarget?.inv.investorEmail}</strong>{' '}
              to digital NDA mode? This investor will need to accept the NDA before they can
              access the dataroom.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleNdaModeConfirmed}>
              Change to Digital
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
