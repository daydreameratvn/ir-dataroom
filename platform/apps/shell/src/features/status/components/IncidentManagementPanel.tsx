import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  cn,
} from '@papaya/shared-ui';
import {
  Plus,
  MessageSquarePlus,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { StatusIncident, StatusIncidentWithUpdates } from '../types';
import { listIncidents, resolveIncident, deleteIncident, getIncident } from '../api';
import CreateIncidentDialog from './CreateIncidentDialog';
import PostUpdateDialog from './PostUpdateDialog';
import IncidentTimeline from './IncidentTimeline';

const severityColors: Record<string, string> = {
  minor: 'bg-blue-100 text-blue-800',
  major: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
};

const statusColors: Record<string, string> = {
  investigating: 'text-red-600',
  identified: 'text-amber-600',
  monitoring: 'text-blue-600',
  resolved: 'text-emerald-600',
};

export default function IncidentManagementPanel() {
  const [incidents, setIncidents] = useState<StatusIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<StatusIncident | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedIncident, setExpandedIncident] = useState<StatusIncidentWithUpdates | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listIncidents({ limit: 50 });
      setIncidents(result.data);
    } catch {
      // Silently fail — panel is admin-only, not critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedIncident(null);
      return;
    }
    setExpandedId(id);
    try {
      const detail = await getIncident(id);
      setExpandedIncident(detail);
    } catch {
      setExpandedIncident(null);
    }
  }

  async function handleResolve(id: string) {
    setActionLoading(id);
    try {
      await resolveIncident(id);
      await refresh();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    setActionLoading(id);
    try {
      await deleteIncident(id);
      await refresh();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base font-semibold">Incident Management</CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create Incident
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : incidents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-sm">No incidents</p>
            </div>
          ) : (
            <div className="space-y-2">
              {incidents.map((incident) => {
                const isExpanded = expandedId === incident.id;
                const isLoading = actionLoading === incident.id;

                return (
                  <div
                    key={incident.id}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        onClick={() => handleExpand(incident.id)}
                        className="flex items-center gap-2 text-left min-w-0"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {incident.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={cn('text-xs font-medium capitalize', statusColors[incident.status] ?? 'text-muted-foreground')}>
                              {incident.status}
                            </span>
                            <Badge className={cn('text-[10px] px-1.5 py-0', severityColors[incident.severity])}>
                              {incident.severity}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(incident.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Post update"
                          onClick={() => setUpdateTarget(incident)}
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" />
                        </Button>
                        {incident.status !== 'resolved' && (
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Resolve"
                            onClick={() => handleResolve(incident.id)}
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Delete"
                          onClick={() => handleDelete(incident.id)}
                          disabled={isLoading}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && expandedIncident?.id === incident.id && (
                      <div className="pl-6 pt-2 border-t">
                        {incident.description && (
                          <p className="text-xs text-muted-foreground mb-3">{incident.description}</p>
                        )}
                        {incident.affectedServices.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {incident.affectedServices.map((svc) => (
                              <Badge key={svc} variant="outline" className="text-[10px]">
                                {svc}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <IncidentTimeline updates={expandedIncident.updates} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateIncidentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />

      {updateTarget && (
        <PostUpdateDialog
          open={!!updateTarget}
          onOpenChange={(open) => { if (!open) setUpdateTarget(null); }}
          incidentId={updateTarget.id}
          currentStatus={updateTarget.status}
          onPosted={() => {
            setUpdateTarget(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
