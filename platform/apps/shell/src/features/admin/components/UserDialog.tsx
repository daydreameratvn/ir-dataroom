import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserType, UserLevel, Tenant } from '@papaya/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@papaya/shared-ui';
import { createUser, updateUser, listTenants, type AdminUser, type CreateUserPayload, type UpdateUserPayload } from '../api';

// ── Types ──

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser | null;  // null = create mode, non-null = edit mode
  isSuperAdmin: boolean;
  defaultTenantId?: string;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  userType: UserType;
  userLevel: UserLevel;
  title: string;
  department: string;
  tenantId: string;
}

// ── Constants ──

const USER_TYPES: { value: UserType; label: string }[] = [
  { value: 'insurer', label: 'Insurer' },
  { value: 'broker', label: 'Broker' },
  { value: 'provider', label: 'Provider' },
  { value: 'papaya', label: 'Papaya' },
];

const USER_LEVELS: { value: UserLevel; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'executive', label: 'Executive' },
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
  { value: 'viewer', label: 'Viewer' },
];

// ── Component ──

export default function UserDialog({
  open,
  onOpenChange,
  user,
  isSuperAdmin,
  defaultTenantId,
  onSuccess,
}: UserDialogProps) {
  const { t } = useTranslation();
  const isEditMode = user !== null;

  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    userType: 'insurer',
    userLevel: 'staff',
    title: '',
    department: '',
    tenantId: defaultTenantId ?? '',
  });
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // Populate form when editing
  useEffect(() => {
    if (open && user) {
      setForm({
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        userType: user.userType,
        userLevel: user.userLevel,
        title: user.title ?? '',
        department: user.department ?? '',
        tenantId: user.tenantId,
      });
    } else if (open && !user) {
      setForm({
        name: '',
        email: '',
        phone: '',
        userType: 'insurer',
        userLevel: 'staff',
        title: '',
        department: '',
        tenantId: defaultTenantId ?? '',
      });
    }
    setError(null);
    setFieldErrors({});
  }, [open, user, defaultTenantId]);

  // Fetch tenants for super admin
  useEffect(() => {
    if (!isSuperAdmin) return;

    let cancelled = false;
    async function fetchTenants() {
      try {
        const result = await listTenants();
        if (!cancelled) setTenants(result);
      } catch {
        // Silent fail
      }
    }
    fetchTenants();
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};

    if (!form.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Invalid email address';
    }
    if (isSuperAdmin && !isEditMode && !form.tenantId) {
      errors.tenantId = 'Tenant is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditMode) {
        const payload: UpdateUserPayload = {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          userType: form.userType,
          userLevel: form.userLevel,
          title: form.title.trim() || undefined,
          department: form.department.trim() || undefined,
        };
        await updateUser(user.id, payload);
      } else {
        const payload: CreateUserPayload = {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          userType: form.userType,
          userLevel: form.userLevel,
          title: form.title.trim() || undefined,
          department: form.department.trim() || undefined,
          ...(isSuperAdmin && form.tenantId ? { tenantId: form.tenantId } : {}),
        };
        await createUser(payload);
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t('admin.editUser') : t('admin.createUser')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the user details below.'
              : 'Fill in the details to create a new user.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label htmlFor="user-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="user-name"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="John Doe"
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p className="text-xs text-destructive">{fieldErrors.name}</p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label htmlFor="user-email" className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <Input
              id="user-email"
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="john@example.com"
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label htmlFor="user-phone" className="text-sm font-medium">
              Phone
            </label>
            <Input
              id="user-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="+66 812 345 678"
            />
          </div>

          {/* User Type & Level — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={form.userType}
                onValueChange={(val) => updateField('userType', val as UserType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Level</label>
              <Select
                value={form.userLevel}
                onValueChange={(val) => updateField('userLevel', val as UserLevel)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Title & Department — side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="user-title" className="text-sm font-medium">
                Title
              </label>
              <Input
                id="user-title"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="VP of Claims"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="user-department" className="text-sm font-medium">
                Department
              </label>
              <Input
                id="user-department"
                value={form.department}
                onChange={(e) => updateField('department', e.target.value)}
                placeholder="Operations"
              />
            </div>
          </div>

          {/* Tenant selector — super admin only, create mode */}
          {isSuperAdmin && !isEditMode && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Tenant <span className="text-destructive">*</span>
              </label>
              <Select
                value={form.tenantId || undefined}
                onValueChange={(val) => updateField('tenantId', val)}
              >
                <SelectTrigger className="w-full" aria-invalid={!!fieldErrors.tenantId}>
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.tenantId && (
                <p className="text-xs text-destructive">{fieldErrors.tenantId}</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? (isEditMode ? 'Saving...' : 'Creating...')
                : (isEditMode ? 'Save Changes' : 'Create User')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
