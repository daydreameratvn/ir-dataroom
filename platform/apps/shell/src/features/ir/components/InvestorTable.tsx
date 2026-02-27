import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
} from '@papaya/shared-ui';
import type { InvestorRound, InvestorRoundStatus } from '../types';
import {
  listRoundInvestors,
  updateInvestorStatus,
  removeInvestorFromRound,
  sendInvitation,
} from '../api';
import InvestorStatusBadge from './InvestorStatusBadge';
import InvestorInviteDialog from './InvestorInviteDialog';

interface InvestorTableProps {
  roundId: string;
}

const INVESTOR_STATUSES: InvestorRoundStatus[] = [
  'invited',
  'nda_pending',
  'nda_accepted',
  'active',
  'termsheet_sent',
  'termsheet_signed',
  'docs_out',
  'dropped',
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export default function InvestorTable({ roundId }: InvestorTableProps) {
  const [investors, setInvestors] = useState<InvestorRound[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const limit = 20;

  const fetchInvestors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listRoundInvestors(roundId, { page, limit });
      setInvestors(result.data);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch investors');
    } finally {
      setIsLoading(false);
    }
  }, [roundId, page]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  async function handleStatusChange(investorRoundId: string, newStatus: InvestorRoundStatus) {
    try {
      await updateInvestorStatus(roundId, investorRoundId, newStatus);
      setInvestors((prev) =>
        prev.map((inv) =>
          inv.id === investorRoundId ? { ...inv, status: newStatus } : inv
        )
      );
    } catch {
      fetchInvestors();
    }
  }

  async function handleRemove(investorRoundId: string) {
    try {
      await removeInvestorFromRound(roundId, investorRoundId);
      setInvestors((prev) => prev.filter((inv) => inv.id !== investorRoundId));
      setTotal((prev) => prev - 1);
    } catch {
      fetchInvestors();
    }
  }

  async function handleSendInvite(investorId: string) {
    try {
      await sendInvitation(investorId);
    } catch {
      // Best effort
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {total} investor{total !== 1 ? 's' : ''} in this round
        </h3>
        <div className="flex items-center gap-2">
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
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Firm</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invited</TableHead>
                <TableHead>NDA Accepted</TableHead>
                <TableHead>Last Access</TableHead>
                <TableHead className="text-right">Access Count</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investors.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.investorName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {inv.investorEmail}
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.investorFirm ?? (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={inv.status}
                      onValueChange={(v) => handleStatusChange(inv.id, v as InvestorRoundStatus)}
                    >
                      <SelectTrigger className="h-7 w-40 text-xs">
                        <InvestorStatusBadge status={inv.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTOR_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <InvestorStatusBadge status={s} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(inv.invitedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(inv.ndaAcceptedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(inv.lastAccessAt)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <Badge variant="outline" className="text-xs">
                      {inv.accessCount}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendInvite(inv.investorId)}
                        className="h-7 px-2 text-xs"
                        title="Send invitation email"
                      >
                        <Send className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(inv.id)}
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700"
                        title="Remove from round"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
    </div>
  );
}
