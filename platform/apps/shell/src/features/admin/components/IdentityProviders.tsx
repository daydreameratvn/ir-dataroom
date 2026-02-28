import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  EmptyState,
} from '@papaya/shared-ui';
import type { UserType, UserLevel } from '@papaya/shared-types';
import {
  Link2,
  Link2Off,
  RefreshCw,
  Plus,
  Trash2,
  History,
  Loader2,
  Shield,
  Users,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  useIdentityProviders,
  useTriggerSync,
  useUpdateProvider,
  useDeleteProvider,
} from '../hooks/useIdentityProviders';
import { createProvider, getGoogleConnectUrl, type IdentityProvider } from '../directory-api';
import GoogleWorkspaceConnect from './GoogleWorkspaceConnect';
import SyncHistory from './SyncHistory';

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  partial: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function IdentityProviders() {
  const { providers, isLoading, error, refetch } = useIdentityProviders();
  const { sync, isSyncing } = useTriggerSync(refetch);
  const { update, isUpdating } = useUpdateProvider(refetch);
  const { remove, isDeleting } = useDeleteProvider(refetch);

  const [showConnect, setShowConnect] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function handleAddGoogle() {
    setIsCreating(true);
    try {
      const provider = await createProvider({
        providerType: 'google_workspace',
        displayName: 'Google Workspace',
      });
      // Open Google consent flow
      const url = await getGoogleConnectUrl(provider.id);
      window.open(url, '_blank', 'width=600,height=700');
      // Poll for connection — refetch after a delay
      setTimeout(refetch, 5000);
    } catch {
      // Error handled by API
    } finally {
      setIsCreating(false);
    }
  }

  async function handleReconnect(provider: IdentityProvider) {
    try {
      const url = await getGoogleConnectUrl(provider.id);
      window.open(url, '_blank', 'width=600,height=700');
      setTimeout(refetch, 5000);
    } catch {
      // Error handled by API
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="mb-1 inline-block h-4 w-4" /> Failed to load identity providers: {error}
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <EmptyState
        icon={<Shield className="h-6 w-6" />}
        title="Identity Providers"
        description="Connect your organization's directory to automatically manage users. Import users from Google Workspace, enable domain-based auto-join, and automate offboarding."
        action={
          <Button onClick={handleAddGoogle} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Connect Google Workspace
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Identity Providers</h3>
          <p className="text-sm text-papaya-muted">
            Manage directory integrations for user provisioning and offboarding.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddGoogle}
          disabled={isCreating}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Provider
        </Button>
      </div>

      {providers.map((provider) => (
        <Card key={provider.id} className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{provider.display_name}</h4>
                <Badge
                  className={
                    provider.admin_email
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }
                >
                  {provider.admin_email ? 'Connected' : 'Not Connected'}
                </Badge>
                {!provider.is_active && (
                  <Badge className="bg-gray-100 text-gray-600">Inactive</Badge>
                )}
              </div>
              {provider.admin_email && (
                <p className="text-sm text-papaya-muted">
                  Authorized by {provider.admin_email}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {provider.admin_email ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sync(provider.id)}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Sync Now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistory(provider.id)}
                  >
                    <History className="mr-2 h-4 w-4" />
                    History
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReconnect(provider)}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => handleReconnect(provider)}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(provider.id)}
                disabled={isDeleting}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {provider.admin_email && (
            <>
              <Separator className="my-4" />

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {/* Domains */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Domains</label>
                  <div className="flex flex-wrap gap-1">
                    {provider.domains.length > 0 ? (
                      provider.domains.map((d) => (
                        <Badge key={d} variant="outline">
                          @{d}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-papaya-muted">No domains configured</span>
                    )}
                  </div>
                  <DomainsEditor
                    domains={provider.domains}
                    onChange={(domains) =>
                      update(provider.id, { domains })
                    }
                    disabled={isUpdating}
                  />
                </div>

                {/* Last Sync */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Last Sync</label>
                  {provider.last_sync_at ? (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-papaya-muted" />
                      <span className="text-sm">
                        {formatRelativeTime(provider.last_sync_at)}
                      </span>
                      {provider.last_sync_status && (
                        <Badge
                          className={
                            STATUS_STYLES[provider.last_sync_status] ?? 'bg-gray-100 text-gray-600'
                          }
                        >
                          {provider.last_sync_status}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-papaya-muted">Never synced</span>
                  )}
                  {provider.last_sync_error && (
                    <p className="text-xs text-red-500">{provider.last_sync_error}</p>
                  )}
                </div>

                {/* Auto-Join Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Domain Auto-Join</label>
                      <p className="text-xs text-papaya-muted">
                        Auto-provision users signing in with a matching domain
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={provider.auto_join_enabled}
                      onChange={(val) =>
                        update(provider.id, { autoJoinEnabled: val })
                      }
                      disabled={isUpdating}
                    />
                  </div>
                  {provider.auto_join_enabled && (
                    <div className="flex gap-2">
                      <Select
                        value={provider.auto_join_user_type ?? 'insurer'}
                        onValueChange={(val) =>
                          update(provider.id, { autoJoinUserType: val as UserType })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="insurer">Insurer</SelectItem>
                          <SelectItem value="broker">Broker</SelectItem>
                          <SelectItem value="provider">Provider</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={provider.auto_join_user_level ?? 'viewer'}
                        onValueChange={(val) =>
                          update(provider.id, { autoJoinUserLevel: val as UserLevel })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="executive">Executive</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Auto-Offboard Toggle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium">Auto Offboarding</label>
                      <p className="text-xs text-papaya-muted">
                        Deactivate users removed from Google Workspace (hourly sync)
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={provider.auto_offboard_enabled}
                      onChange={(val) =>
                        update(provider.id, { autoOffboardEnabled: val })
                      }
                      disabled={isUpdating}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      ))}

      {showConnect && (
        <GoogleWorkspaceConnect
          onClose={() => setShowConnect(false)}
          onConnected={refetch}
        />
      )}

      {showHistory && (
        <SyncHistory
          providerId={showHistory}
          onClose={() => setShowHistory(null)}
        />
      )}
    </div>
  );
}

// ── Simple toggle switch ──

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-papaya focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-papaya' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Domains editor ──

function DomainsEditor({
  domains,
  onChange,
  disabled,
}: {
  domains: string[];
  onChange: (domains: string[]) => void;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');

  function handleAdd() {
    const domain = input.trim().toLowerCase().replace(/^@/, '');
    if (domain && !domains.includes(domain)) {
      onChange([...domains, domain]);
      setInput('');
    }
  }

  function handleRemove(domain: string) {
    onChange(domains.filter((d) => d !== domain));
  }

  return (
    <div className="flex gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Add domain (e.g. papaya.asia)"
        className="h-8 text-sm"
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleAdd();
          }
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={handleAdd}
        disabled={disabled || !input.trim()}
      >
        Add
      </Button>
    </div>
  );
}
