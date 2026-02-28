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
import NewDataBanner from '../../../components/NewDataBanner';
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

// ── Component ──

export default function UserTable() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

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

  // ── Impersonation state ──
  const [impersonateDialogOpen, setImpersonateDialogOpen] = useState(false);
  const [impersonatingUser, setImpersonatingUser] = useState<AdminUser | null>(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const { startImpersonation } = useAuth();

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
    hasNewData,
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

  function handleImpersonateClick(user: AdminUser) {
    setImpersonatingUser(user);
    setImpersonateDialogOpen(true);
  }

  async function handleConfirmImpersonate() {
    if (!impersonatingUser) return;

    setIsImpersonating(true);
    try {
      await startImpersonation(impersonatingUser.id);
      setImpersonateDialogOpen(false);
      setImpersonatingUser(null);
    } catch {
      // Error handling could be improved with a toast
    } finally {
      setIsImpersonating(false);
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

  // ── Relative time formatter ──
  function formatRelativeTime(dateString: string | undefined): string {
    if (!dateString) return t('admin.lastLogin.never');

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('admin.lastLogin.justNow');
    if (diffMins < 60) return t('admin.lastLogin.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('admin.lastLogin.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('admin.lastLogin.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  }

  // ── Table columns ──

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('admin.table.name'),
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex items-center gap-3">
              <Avatar size="sm">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {user.name}
                  {user.isImpersonatable && (
                    <Eye className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'userType',
        header: t('admin.table.type'),
        cell: ({ row }) => (
          <span className="text-sm capitalize">{t(`admin.userTypes.${row.original.userType}`)}</span>
        ),
      },
      {
        accessorKey: 'userLevel',
        header: t('admin.table.level'),
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className={cn('text-xs', LEVEL_STYLES[row.original.userLevel])}
          >
            {t(`admin.userLevels.${row.original.userLevel}`)}
          </Badge>
        ),
      },
      {
        accessorKey: 'department',
        header: t('admin.table.department'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.department ?? '--'}
          </span>
        ),
      },
      {
        accessorKey: 'lastLoginAt',
        header: t('admin.table.lastLogin'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.lastLoginAt)}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: t('admin.table.createdAt'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      {
        accessorKey: 'createdByName',
        header: t('admin.table.createdBy'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.createdByName ?? '--'}
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
                  <span className="sr-only">{t('admin.table.openMenu')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEditUser(user)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('admin.table.edit')}
                </DropdownMenuItem>
                {isSuperAdmin && !isSelf && (
                  <DropdownMenuItem onClick={() => handleToggleImpersonatable(user)}>
                    {user.isImpersonatable ? (
                      <>
                        <ShieldOff className="mr-2 h-4 w-4" />
                        {t('admin.table.disallowImpersonation')}
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {t('admin.table.allowImpersonation')}
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {isSuperAdmin && !isSelf && user.isImpersonatable && (
                  <DropdownMenuItem onClick={() => handleImpersonateClick(user)}>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('admin.table.impersonate')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => handleDeleteClick(user)}
                  disabled={isSelf}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('admin.table.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [currentUser?.id, t],
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

      {hasNewData && (
        <NewDataBanner message="User data has been updated." onRefresh={refetch} />
      )}

      {/* Toolbar: Search + Filters + Add button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          {/* Search */}
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('admin.searchPlaceholder')}
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
              <SelectValue placeholder={t('admin.filters.allTypes')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('admin.filters.allTypes')}</SelectItem>
              <SelectItem value="insurer">{t('admin.userTypes.insurer')}</SelectItem>
              <SelectItem value="broker">{t('admin.userTypes.broker')}</SelectItem>
              <SelectItem value="provider">{t('admin.userTypes.provider')}</SelectItem>
              <SelectItem value="papaya">{t('admin.userTypes.papaya')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Level filter */}
          <Select
            value={levelFilter ?? '__all__'}
            onValueChange={(val) => setLevelFilter(val === '__all__' ? undefined : val as UserLevel)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('admin.filters.allLevels')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('admin.filters.allLevels')}</SelectItem>
              <SelectItem value="admin">{t('admin.userLevels.admin')}</SelectItem>
              <SelectItem value="executive">{t('admin.userLevels.executive')}</SelectItem>
              <SelectItem value="manager">{t('admin.userLevels.manager')}</SelectItem>
              <SelectItem value="staff">{t('admin.userLevels.staff')}</SelectItem>
              <SelectItem value="viewer">{t('admin.userLevels.viewer')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add user button */}
        <Button onClick={handleCreateUser}>
          <Plus className="mr-2 h-4 w-4" />
          {t('admin.addUser')}
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
            {t('common.retry')}
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
          title={t('admin.emptyState.noUsersFound')}
          description={
            debouncedSearch || typeFilter || levelFilter
              ? t('admin.emptyState.adjustFilters')
              : t('admin.emptyState.addFirstUser')
          }
          action={
            !debouncedSearch && !typeFilter && !levelFilter ? (
              <Button variant="outline" onClick={handleCreateUser}>
                <Plus className="mr-2 h-4 w-4" />
                {t('admin.addUser')}
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
              {t('admin.pagination.showing', { start: startItem, end: endItem, total })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('common.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('admin.pagination.pageOf', { page, totalPages: totalPages || 1 })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                {t('common.next')}
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
            <AlertDialogTitle>{t('admin.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.deleteDialog.description', { name: deletingUser?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t('admin.deleteDialog.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Impersonate confirmation */}
      <AlertDialog open={impersonateDialogOpen} onOpenChange={setImpersonateDialogOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.impersonateDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.impersonateDialog.description', { name: impersonatingUser?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImpersonating}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={handleConfirmImpersonate}
              disabled={isImpersonating}
            >
              {isImpersonating
                ? t('admin.impersonateDialog.impersonating')
                : t('admin.impersonateDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
