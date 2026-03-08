import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Skeleton,
  EmptyState,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@papaya/shared-ui';
import {
  Globe,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  Copy,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import useDomains from '../hooks/useDomains';
import {
  addDomain,
  verifyDomain,
  updateDomainAutoAdmit,
  deleteDomain,
  type TenantDomain,
} from '../domains-api';

export default function DomainsManager() {
  const { domains, isLoading, error, refetch } = useDomains();
  const [input, setInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantDomain | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleAdd() {
    const domain = input.trim().toLowerCase().replace(/^@/, '');
    if (!domain) return;

    setIsAdding(true);
    try {
      await addDomain({ domain });
      setInput('');
      refetch();
    } catch {
      // TODO: toast
    } finally {
      setIsAdding(false);
    }
  }

  async function handleVerify(domainId: string) {
    setVerifying(domainId);
    try {
      await verifyDomain(domainId);
      refetch();
    } catch {
      // TODO: toast
    } finally {
      setVerifying(null);
    }
  }

  async function handleToggleAutoAdmit(domain: TenantDomain) {
    try {
      await updateDomainAutoAdmit(domain.id, !domain.auto_admit);
      refetch();
    } catch {
      // TODO: toast
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDomain(deleteTarget.id);
      setDeleteTarget(null);
      refetch();
    } catch {
      // TODO: toast
    } finally {
      setIsDeleting(false);
    }
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(token);
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="mb-1 inline-block h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Verified Domains</h3>
          <p className="text-sm text-papaya-muted">
            Register and verify domains for auto-admit. Users with matching email
            domains can be automatically onboarded.
          </p>
        </div>
      </div>

      {/* Add domain */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="example.com"
          className="max-w-sm"
          disabled={isAdding}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button onClick={handleAdd} disabled={isAdding || !input.trim()}>
          {isAdding ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Add Domain
        </Button>
      </div>

      {/* Domain list */}
      {domains.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title="No domains registered"
          description="Add a domain to enable DNS verification and auto-admit for matching emails."
        />
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => (
            <Card key={domain.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">@{domain.domain}</span>
                      {domain.verified ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800">
                          <Clock className="mr-1 h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                      {domain.auto_admit && (
                        <Badge variant="outline">Auto-Admit</Badge>
                      )}
                    </div>
                    {!domain.verified && domain.verification_token && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Add this TXT record to your DNS:
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-0.5 text-xs">
                            papaya-verify={domain.verification_token}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToken(`papaya-verify=${domain.verification_token}`)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!domain.verified && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleVerify(domain.id)}
                      disabled={verifying === domain.id}
                    >
                      {verifying === domain.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Verify
                    </Button>
                  )}
                  {domain.verified && (
                    <ToggleSwitch
                      checked={domain.auto_admit}
                      onChange={() => handleToggleAutoAdmit(domain)}
                      label="Auto-Admit"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(domain)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Remove @{deleteTarget?.domain}? Users with this domain will no longer
              be auto-admitted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-papaya ${
          checked ? 'bg-papaya' : 'bg-gray-200'
        }`}
      >
        <span
          className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
