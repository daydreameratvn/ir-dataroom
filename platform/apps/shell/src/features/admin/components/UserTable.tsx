import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Eye,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import type { UserType, UserLevel } from '@papaya/shared-types';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
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
import { useAuth } from '@papaya/auth';
import useUsers from '../hooks/useUsers';
import { deleteUser, setUserImpersonatable, type AdminUser } from '../api';
import UserDialog from './UserDialog';
import TenantFilter from './TenantFilter';

// ── Badge color mapping ──

const LEVEL_STYLES: Record<UserLevel, string> = {
  admin: 'bg-[#ED1B55] text-white hover:bg-[#ED1B55]/90',
  executive: 'bg-purple-600 text-white hover:bg-purple-600/90',
  manager: 'bg-blue-600 text-white hover:bg-blue-600/90',
  staff: 'bg-gray-500 text-white hover:bg-gray-500/90',
  viewer: 'bg-gray-300 text-gray-700 hover:bg-gray-300/90',
};

const TYPE_LABELS: Record<UserType, string> = {
  insurer: 'Insurer',
  broker: 'Broker',
  provider: 'Provider',
  papaya: 'Papaya',
};

const LEVEL_LABELS: Record<UserLevel, string> = {
  admin: 'Admin',
  executive: 'Executive',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
};

// ── Helpers ──

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatRelativeTime(dateString: string | undefined): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ── Component ──

export default function UserTable() {
  const { t } = useTranslation();
  const { user: currentUser, startImpersonation } = useAuth();

  const isSuperAdmin =
    currentUser?.userType === 'papaya' && currentUser?.userLevel === 'admin';

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<UserType | undefined>(undefined);
  const [levelFilter, setLevelFilter] = useState<UserLevel | undefined>(undefined);
  const [tenantFilter, setTenantFilter] = useState<string | undefined>(
    isSuperAdmin ? undefined : currentUser?.tenantId,
  );

  // ── Dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  // ── Delete confirmation state ──
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Debounced search ──
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

  // ── Data fetching ──
  const {
    users,
    total,
    page,
    pageSize,
    hasMore,
    isLoading,
    error,
    refetch,
    setPage,
  } = useUsers({
    tenantId: tenantFilter,
    search: debouncedSearch || undefined,
    userType: typeFilter,
    userLevel: levelFilter,
  });

  // ── Actions ──

  function handleCreateUser() {
    setEditingUser(null);
    setDialogOpen(true);
  }

  function handleEditUser(user: AdminUser) {
    setEditingUser(user);
    setDialogOpen(true);
  }

  function handleDeleteClick(user: AdminUser) {
    setDeletingUser(user);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!deletingUser) return;

    setIsDeleting(true);
    try {
      await deleteUser(deletingUser.id);
      setDeleteDialogOpen(false);
      setDeletingUser(null);
      refetch();
    } catch {
      // Error handling could be improved with a toast
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleImpersonate(user: AdminUser) {
    try {
      await startImpersonation(user.id);
    } catch {
      // Error handling could be improved with a toast
    }
  }

  async function handleToggleImpersonatable(user: AdminUser) {
    try {
      await setUserImpersonatable(user.id, !user.isImpersonatable);
      refetch();
    } catch {
      // Error handling could be improved with a toast
    }
  }

  // ── Table columns ──

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar size="sm">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'userType',
        header: 'Type',
        cell: ({ row }) => (
          <span className="text-sm capitalize">{TYPE_LABELS[row.original.userType]}</span>
        ),
      },
      {
        accessorKey: 'userLevel',
        header: 'Level',
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={cn('text-xs', LEVEL_STYLES[row.original.userLevel])}
          >
            {LEVEL_LABELS[row.original.userLevel]}
          </Badge>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.department ?? '--'}
          </span>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: 'Last Login',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.lastLoginAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const user = row.original;
          const isSelf = user.id === currentUser?.id;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEditUser(user)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {isSuperAdmin && !isSelf && user.isImpersonatable && (
                  <DropdownMenuItem onClick={() => handleImpersonate(user)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Impersonate
                  </DropdownMenuItem>
                )}
                {isSuperAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleToggleImpersonatable(user)}>
                      {user.isImpersonatable ? (
                        <>
                          <ShieldOff className="mr-2 h-4 w-4" />
                          Disallow Impersonation
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Allow Impersonation
                        </>
                      )}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleDeleteClick(user)}
                  disabled={isSelf}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentUser?.id, isSuperAdmin],
  );

  // ── Pagination info ──
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      {/* Super admin tenant filter */}
      {isSuperAdmin && (
        <TenantFilter value={tenantFilter} onChange={setTenantFilter} />
      )}

      {/* Toolbar: Search + Filters + Add button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          {/* Search */}
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Type filter */}
          <Select
            value={typeFilter ?? '__all__'}
            onValueChange={(val) => setTypeFilter(val === '__all__' ? undefined : val as UserType)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All types</SelectItem>
              <SelectItem value="insurer">Insurer</SelectItem>
              <SelectItem value="broker">Broker</SelectItem>
              <SelectItem value="provider">Provider</SelectItem>
              <SelectItem value="papaya">Papaya</SelectItem>
            </SelectContent>
          </Select>

          {/* Level filter */}
          <Select
            value={levelFilter ?? '__all__'}
            onValueChange={(val) => setLevelFilter(val === '__all__' ? undefined : val as UserLevel)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All levels</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add user button */}
        <Button onClick={handleCreateUser}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            size="sm"
            className="ml-2 text-destructive underline"
            onClick={refetch}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && users.length === 0 && (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No users found"
          description={
            debouncedSearch || typeFilter || levelFilter
              ? 'Try adjusting your search or filters.'
              : 'Get started by adding your first user.'
          }
          action={
            !debouncedSearch && !typeFilter && !levelFilter ? (
              <Button variant="outline" onClick={handleCreateUser}>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Data table */}
      {!isLoading && !error && users.length > 0 && (
        <>
          <DataTable columns={columns} data={users} />

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {startItem}--{endItem} of {total} users
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Create/Edit dialog */}
      <UserDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        user={editingUser}
        isSuperAdmin={isSuperAdmin}
        defaultTenantId={tenantFilter ?? currentUser?.tenantId}
        onSuccess={refetch}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-medium text-foreground">{deletingUser?.name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
