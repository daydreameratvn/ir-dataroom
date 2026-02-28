import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@papaya/shared-ui';
import { Plus, X, Loader2, Wrench } from 'lucide-react';
import type { ServiceOverride, ServiceStatus } from '../types';
import { listOverrides, setOverride, clearOverride } from '../api';

const SERVICES = ['Platform', 'Authentication', 'API Gateway', 'AI Agents', 'Database'];
const OVERRIDE_STATUSES: ServiceStatus[] = ['maintenance', 'degraded', 'outage'];

export default function ServiceOverridePanel() {
  const [overrides, setOverrides] = useState<ServiceOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [serviceName, setServiceName] = useState('');
  const [status, setStatus] = useState<string>('maintenance');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listOverrides();
      setOverrides(result.overrides);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!serviceName) {
      setError('Select a service');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setOverride({
        serviceName,
        status,
        reason: reason.trim() || undefined,
      });
      setShowForm(false);
      setServiceName('');
      setReason('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set override');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear(svcName: string) {
    setActionLoading(svcName);
    try {
      await clearOverride(svcName);
      await refresh();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  const statusColors: Record<string, string> = {
    maintenance: 'bg-blue-100 text-blue-800',
    degraded: 'bg-amber-100 text-amber-800',
    outage: 'bg-red-100 text-red-800',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-semibold">Service Overrides</CardTitle>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Override
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-lg border p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Service</label>
                <Select value={serviceName} onValueChange={setServiceName}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((svc) => (
                      <SelectItem key={svc} value={svc} className="text-xs">
                        {svc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OVERRIDE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Reason (optional)</label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Scheduled maintenance window"
                className="h-8 text-xs"
              />
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setError(null); }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Set Override
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : overrides.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            No active overrides. Services report their real-time status.
          </p>
        ) : (
          <div className="space-y-2">
            {overrides.map((override) => (
              <div
                key={override.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Wrench className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{override.serviceName}</span>
                      <Badge className={cn('text-[10px] px-1.5 py-0 capitalize', statusColors[override.status])}>
                        {override.status}
                      </Badge>
                    </div>
                    {override.reason && (
                      <p className="text-xs text-muted-foreground truncate">{override.reason}</p>
                    )}
                  </div>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Clear override"
                  onClick={() => handleClear(override.serviceName)}
                  disabled={actionLoading === override.serviceName}
                >
                  {actionLoading === override.serviceName ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
