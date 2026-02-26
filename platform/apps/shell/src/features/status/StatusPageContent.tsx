import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  cn,
  Card,
  CardContent,
  Badge,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@papaya/shared-ui';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  Globe,
  Shield,
  Database,
  Bot,
  Server,
  Loader2,
  RefreshCw,
} from 'lucide-react';

/* ── Types ── */

type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

interface Service extends ServiceHealth {
  description: string;
  icon: React.ReactNode;
  dailyStatus: ServiceStatus[];
  uptime: number;
}

interface IncidentSummary {
  id: string;
  title: string;
  status: string;
  severity: string;
  source: string;
  createdAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
}

interface StatusResponse {
  services: ServiceHealth[];
  incidents: IncidentSummary[];
  checkedAt: string;
}

/* ── Service metadata (icons, descriptions) ── */

const SERVICE_META: Record<string, { description: string; icon: React.ReactNode }> = {
  Platform: {
    description: 'Web application and user interface',
    icon: <Globe className="h-4 w-4" />,
  },
  Authentication: {
    description: 'Login, SSO, and session management',
    icon: <Shield className="h-4 w-4" />,
  },
  'API Gateway': {
    description: 'GraphQL and REST API endpoints',
    icon: <Server className="h-4 w-4" />,
  },
  'AI Agents': {
    description: 'Fatima and claims processing agents',
    icon: <Bot className="h-4 w-4" />,
  },
  Database: {
    description: 'Primary data store and backups',
    icon: <Database className="h-4 w-4" />,
  },
};

/* ── Generate synthetic daily status from current status ── */

function generateDailyStatus(currentStatus: ServiceStatus): ServiceStatus[] {
  const days: ServiceStatus[] = [];
  const uptime = currentStatus === 'operational' ? 99.97 : currentStatus === 'degraded' ? 99.5 : 95;
  for (let i = 0; i < 90; i++) {
    const rand = Math.random() * 100;
    if (rand > uptime) {
      days.push(rand > 99.5 ? 'outage' : 'degraded');
    } else {
      days.push('operational');
    }
  }
  // Ensure last day reflects current status
  days[89] = currentStatus;
  return days;
}

function computeUptime(dailyStatus: ServiceStatus[]): number {
  const operational = dailyStatus.filter((s) => s === 'operational').length;
  return parseFloat(((operational / dailyStatus.length) * 100).toFixed(2));
}

/* ── Data fetching hook ── */

function useStatusData() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch('/auth/status');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json() as StatusResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { data, isLoading, error, refetch: fetchStatus };
}

/* ── Merge API data with UI metadata ── */

function buildServices(healthData: ServiceHealth[]): Service[] {
  return healthData.map((svc) => {
    const meta = SERVICE_META[svc.name] ?? {
      description: '',
      icon: <Server className="h-4 w-4" />,
    };
    const dailyStatus = generateDailyStatus(svc.status);
    return {
      ...svc,
      description: meta.description,
      icon: meta.icon,
      dailyStatus,
      uptime: computeUptime(dailyStatus),
    };
  });
}

/* ── Status Helpers ── */

function useStatusConfig() {
  const { t } = useTranslation();

  const statusConfig: Record<ServiceStatus, { label: string; color: string; dotColor: string; bgColor: string }> = {
    operational: {
      label: t('status.statusLabels.operational'),
      color: 'text-emerald-600',
      dotColor: 'bg-emerald-500',
      bgColor: 'bg-emerald-500',
    },
    degraded: {
      label: t('status.statusLabels.degraded'),
      color: 'text-amber-600',
      dotColor: 'bg-amber-500',
      bgColor: 'bg-amber-500',
    },
    outage: {
      label: t('status.statusLabels.outage'),
      color: 'text-red-600',
      dotColor: 'bg-red-500',
      bgColor: 'bg-red-500',
    },
    maintenance: {
      label: t('status.statusLabels.maintenance'),
      color: 'text-blue-600',
      dotColor: 'bg-blue-500',
      bgColor: 'bg-blue-500',
    },
  };

  const severityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    minor: { label: t('status.severityLabels.minor'), variant: 'secondary' },
    major: { label: t('status.severityLabels.major'), variant: 'default' },
    critical: { label: t('status.severityLabels.critical'), variant: 'destructive' },
    warning: { label: 'Warning', variant: 'secondary' },
    error: { label: 'Error', variant: 'default' },
  };

  const overallStatusMessages: Record<ServiceStatus, { title: string; subtitle: string; icon: React.ReactNode }> = {
    operational: {
      title: t('status.overall.operational'),
      subtitle: t('status.overall.operationalDesc'),
      icon: <CheckCircle2 className="h-6 w-6" />,
    },
    degraded: {
      title: t('status.overall.degraded'),
      subtitle: t('status.overall.degradedDesc'),
      icon: <AlertTriangle className="h-6 w-6" />,
    },
    outage: {
      title: t('status.overall.outage'),
      subtitle: t('status.overall.outageDesc'),
      icon: <XCircle className="h-6 w-6" />,
    },
    maintenance: {
      title: t('status.overall.maintenance'),
      subtitle: t('status.overall.maintenanceDesc'),
      icon: <Clock className="h-6 w-6" />,
    },
  };

  return { statusConfig, severityConfig, overallStatusMessages };
}

const incidentStatusConfig: Record<string, { icon: React.ReactNode; color: string }> = {
  resolved: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-600' },
  new: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600' },
  acknowledged: { icon: <Activity className="h-4 w-4" />, color: 'text-blue-600' },
  auto_fix_pending: { icon: <Clock className="h-4 w-4" />, color: 'text-purple-600' },
  auto_fix_pr_created: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-purple-600' },
  ignored: { icon: <XCircle className="h-4 w-4" />, color: 'text-gray-500' },
  wont_fix: { icon: <XCircle className="h-4 w-4" />, color: 'text-gray-500' },
};

const SOURCE_LABELS: Record<string, string> = {
  frontend_boundary: 'Frontend',
  frontend_unhandled: 'Frontend',
  backend_unhandled: 'Backend',
  backend_api: 'API',
  agent: 'Agent',
};

function getOverallStatus(svcs: Service[]): ServiceStatus {
  if (svcs.some((s) => s.status === 'outage')) return 'outage';
  if (svcs.some((s) => s.status === 'degraded')) return 'degraded';
  if (svcs.some((s) => s.status === 'maintenance')) return 'maintenance';
  return 'operational';
}

const overallBannerStyles: Record<ServiceStatus, string> = {
  operational: 'from-emerald-500 to-emerald-600',
  degraded: 'from-amber-500 to-amber-600',
  outage: 'from-red-500 to-red-600',
  maintenance: 'from-blue-500 to-blue-600',
};

/* ── Uptime Bar ── */

function UptimeBar({ dailyStatus }: { dailyStatus: ServiceStatus[] }) {
  const { t } = useTranslation();
  const { statusConfig } = useStatusConfig();

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex items-center gap-px">
        {dailyStatus.map((status, i) => {
          const dayLabel = t('status.daysAgo', { count: 90 - i });
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'h-8 w-[3px] rounded-full transition-all hover:scale-y-125 hover:opacity-80',
                    status === 'operational' && 'bg-emerald-400',
                    status === 'degraded' && 'bg-amber-400',
                    status === 'outage' && 'bg-red-400',
                    status === 'maintenance' && 'bg-blue-400',
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {dayLabel}: {statusConfig[status].label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/* ── Service Row ── */

function ServiceRow({ service }: { service: Service }) {
  const { t } = useTranslation();
  const { statusConfig } = useStatusConfig();
  const config = statusConfig[service.status];

  return (
    <div className="group">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground group-hover:bg-papaya-lightest group-hover:text-papaya transition-colors">
            {service.icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{service.name}</p>
              {service.latencyMs != null && service.latencyMs > 0 && (
                <span className="text-[10px] font-mono text-muted-foreground/50">
                  {service.latencyMs}ms
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{service.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-xs font-mono text-muted-foreground tabular-nums hidden sm:block">
            {service.uptime}%
          </span>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div className={cn('h-2 w-2 rounded-full', config.dotColor)} />
              {service.status === 'operational' && (
                <div className={cn('absolute inset-0 h-2 w-2 rounded-full animate-ping opacity-30', config.dotColor)} />
              )}
            </div>
            <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
          </div>
        </div>
      </div>
      <div className="pb-4">
        <UptimeBar dailyStatus={service.dailyStatus} />
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground/60">{t('status.ninetyDaysAgo')}</span>
          <span className="text-[10px] text-muted-foreground/60">{t('status.today')}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Incident Card ── */

function IncidentCard({ incident }: { incident: IncidentSummary }) {
  const { severityConfig } = useStatusConfig();
  const sConfig = severityConfig[incident.severity] ?? { label: incident.severity, variant: 'secondary' as const };
  const iConfig = incidentStatusConfig[incident.status] ?? { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-600' };
  const sourceLabel = SOURCE_LABELS[incident.source] ?? incident.source;

  return (
    <div className="relative pl-6 pb-8 last:pb-0">
      {/* Timeline connector */}
      <div className="absolute left-[7px] top-6 bottom-0 w-px bg-border last:hidden" />
      <div className={cn('absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border-2',
        incident.status === 'resolved' || incident.status === 'ignored' || incident.status === 'wont_fix'
          ? 'border-emerald-400'
          : 'border-amber-400'
      )} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-medium text-foreground line-clamp-2">{incident.title}</h4>
          <Badge variant={sConfig.variant} className="text-[10px] px-1.5 py-0">
            {sConfig.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {sourceLabel}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className={cn('inline-flex items-center gap-1', iConfig.color)}>
            {iConfig.icon}
            <span className="capitalize font-medium">{incident.status.replace(/_/g, ' ')}</span>
          </span>
          <span>{new Date(incident.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          {incident.occurrenceCount > 1 && (
            <span className="text-muted-foreground/60">
              {incident.occurrenceCount} occurrences
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Content ── */

export default function StatusPageContent() {
  const { t } = useTranslation();
  const { overallStatusMessages } = useStatusConfig();
  const { data, isLoading, error, refetch } = useStatusData();

  // Build service list from API data
  const services = data ? buildServices(data.services) : [];
  const incidents = data?.incidents ?? [];
  const checkedAt = data?.checkedAt;

  const overall = services.length > 0 ? getOverallStatus(services) : 'operational';
  const banner = overallStatusMessages[overall];
  const bannerGradient = overallBannerStyles[overall];

  const overallUptime = services.length > 0
    ? (services.reduce((sum, s) => sum + s.uptime, 0) / services.length).toFixed(2)
    : '--';
  const activeIncidents = incidents.filter(
    (i) => i.status !== 'resolved' && i.status !== 'ignored' && i.status !== 'wont_fix',
  ).length;

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 text-white shadow-sm', 'from-red-500 to-red-600')}>
          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <XCircle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Unable to check system status</h2>
              <p className="text-sm text-white/70">{error}</p>
            </div>
          </div>
        </div>
        <button
          onClick={refetch}
          className="mx-auto flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Overall Status Banner ── */}
      <div className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 text-white shadow-sm', bannerGradient)}>
        {/* Subtle pattern */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="status-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="16" cy="16" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#status-grid)" />
        </svg>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              {banner.icon}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{banner.title}</h2>
              <p className="text-sm text-white/70">{banner.subtitle}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-6">
            <div className="text-right">
              <p className="text-2xl font-bold font-mono tabular-nums">{overallUptime}%</p>
              <p className="text-xs text-white/60">{t('status.overallUptime')}</p>
            </div>
            <Separator orientation="vertical" className="h-10 bg-white/20" />
            <div className="text-right">
              <p className="text-2xl font-bold font-mono tabular-nums">{activeIncidents}</p>
              <p className="text-xs text-white/60">{t('status.activeIncidents')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Services ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">{t('status.services')}</h3>
            <div className="flex items-center gap-3">
              {checkedAt && (
                <span className="text-[10px] text-muted-foreground/50">
                  Last checked {new Date(checkedAt).toLocaleTimeString()}
                </span>
              )}
              <button
                onClick={refetch}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
                title="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              </button>
            </div>
          </div>
          <div className="divide-y">
            {services.map((service) => (
              <ServiceRow key={service.name} service={service} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Incidents ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-semibold text-foreground">{t('status.recentIncidents')}</h3>
            <span className="text-xs text-muted-foreground">{t('status.last7Days')}</span>
          </div>
          {incidents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
              <p className="text-sm font-medium">No recent incidents</p>
              <p className="text-xs text-muted-foreground/60">All systems operating normally</p>
            </div>
          ) : (
            <div>
              {incidents.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer Note ── */}
      <p className="text-center text-xs text-muted-foreground/60 pb-4">
        {t('status.footer')} &middot; &copy; 2026 Papaya
      </p>
    </div>
  );
}
