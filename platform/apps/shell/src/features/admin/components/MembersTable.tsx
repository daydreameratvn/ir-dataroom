import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Badge,
  Button,
  Input,
  DataTable,
  type ColumnDef,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  EmptyState,
  cn,
} from '@papaya/shared-ui';
import {
  Plus,
  MoreHorizontal,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserX,
  UserCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import useMembers from '../hooks/useMembers';
import {
  updateMemberStatus,
  removeMember,
  type TenantMember,
  type MemberStatus,
  type MemberSource,
} from '../members-api';
import InviteMembersDialog from './InviteMembersDialog';
import CsvImportDialog from './CsvImportDialog';

const STATUS_STYLES: Record<MemberStatus, string> = {
  invited: 'bg-blue-100 text-blue-800',
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-yellow-100 text-yellow-800',
  removed: 'bg-red-100 text-red-800',
};

const SOURCE_LABELS: Record<MemberSource, string> = {
  manual: 'Manual',
  csv: 'CSV Import',
  google_workspace: 'Google',
  microsoft_365: 'Microsoft',
  domain_auto_admit: 'Auto-Admit',
};

export default function MembersTable() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemberStatus | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<MemberSource | undefined>(undefined);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  // Action dialogs
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<TenantMember | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'reactivate' | 'remove'>('suspend');
  const [isActioning, setIsActioning] = useState(false);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }

  const {
    members,
    total,
    page,
    pageSize,
    hasMore,
    isLoading,
    error,
    refetch,
    setPage,
  } = useMembers({
    search: debouncedSearch || undefined,
    status: statusFilter,
    source: sourceFilter,
  });

  function handleAction(member: TenantMember, type: 'suspend' | 'reactivate' | 'remove') {
    setActionTarget(member);
    setActionType(type);
    setActionDialogOpen(true);
  }

  async function handleConfirmAction() {
    if (!actionTarget) return;
    setIsActioning(true);
    try {
      if (actionType === 'remove') {
        await removeMember(actionTarget.id);
      } else {
        const newStatus: MemberStatus = actionType === 'suspend' ? 'suspended' : 'active';
        await updateMemberStatus(actionTarget.id, newStatus);
      }
      setActionDialogOpen(false);
      setActionTarget(null);
      refetch();
    } catch {
      // TODO: toast
    } finally {
      setIsActioning(false);
    }
  }

  const actionLabels = {
    suspend: { title: 'Suspend Member', description: 'This will suspend access for', button: 'Suspend' },
    reactivate: { title: 'Reactivate Member', description: 'This will restore access for', button: 'Reactivate' },
    remove: { title: 'Remove Member', description: 'This will permanently remove', button: 'Remove' },
  };

  const columns = useMemo<ColumnDef<TenantMember, unknown>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => (
          <span className="text-sm font-medium">{row.original.email}</span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge className={cn('text-xs capitalize', STATUS_STYLES[row.original.status])}>
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {SOURCE_LABELS[row.original.source]}
          </span>
        ),
      },
      {
        accessorKey: 'invited_at',
        header: 'Invited',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.invited_at
              ? new Date(row.original.invited_at).toLocaleDateString()
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'joined_at',
        header: 'Joined',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.joined_at
              ? new Date(row.original.joined_at).toLocaleDateString()
              : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'inviter_name',
        header: 'Invited By',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.inviter_name ?? '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const member = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {member.status === 'active' && (
                  <DropdownMenuItem onClick={() => handleAction(member, 'suspend')}>
                    <UserX className="mr-2 h-4 w-4" />
                    Suspend
                  </DropdownMenuItem>
                )}
                {member.status === 'suspended' && (
                  <DropdownMenuItem onClick={() => handleAction(member, 'reactivate')}>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Reactivate
                  </DropdownMenuItem>
                )}
                {member.status !== 'removed' && (
                  <DropdownMenuItem
                    onClick={() => handleAction(member, 'remove')}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [],
  );

  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter ?? '__all__'}
            onValueChange={(val) => setStatusFilter(val === '__all__' ? undefined : val as MemberStatus)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="invited">Invited</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter ?? '__all__'}
            onValueChange={(val) => setSourceFilter(val === '__all__' ? undefined : val as MemberSource)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Sources</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="csv">CSV Import</SelectItem>
              <SelectItem value="google_workspace">Google</SelectItem>
              <SelectItem value="microsoft_365">Microsoft</SelectItem>
              <SelectItem value="domain_auto_admit">Auto-Admit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCsvOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Invite Members
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <Button variant="link" size="sm" className="ml-2 text-destructive underline" onClick={refetch}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && members.length === 0 && (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No members found"
          description={
            debouncedSearch || statusFilter || sourceFilter
              ? 'Try adjusting your filters.'
              : 'Invite your first members to get started.'
          }
          action={
            !debouncedSearch && !statusFilter && !sourceFilter ? (
              <Button variant="outline" onClick={() => setInviteOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Invite Members
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Table */}
      {!isLoading && !error && members.length > 0 && (
        <>
          <DataTable columns={columns} data={members} />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {startItem}–{endItem} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages || 1}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!hasMore}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Dialogs */}
      <InviteMembersDialog open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={refetch} />
      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onSuccess={refetch} />

      {/* Action confirmation */}
      <AlertDialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{actionLabels[actionType].title}</AlertDialogTitle>
            <AlertDialogDescription>
              {actionLabels[actionType].description} {actionTarget?.email}. This action can be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={actionType === 'remove' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
              disabled={isActioning}
            >
              {isActioning ? 'Processing...' : actionLabels[actionType].button}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
