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
  Wifi,
} from 'lucide-react';

/* ── Types ── */

type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';

interface Service {
  name: string;
  description: string;
  status: ServiceStatus;
  uptime: number;
  icon: React.ReactNode;
  dailyStatus: ServiceStatus[];
}

interface Incident {
  id: string;
  title: string;
  status: 'resolved' | 'monitoring' | 'investigating' | 'identified';
  severity: 'minor' | 'major' | 'critical';
  createdAt: string;
  resolvedAt?: string;
  updates: { time: string; message: string }[];
}

/* ── Mock Data ── */

function generateDailyStatus(uptime: number): ServiceStatus[] {
  const days: ServiceStatus[] = [];
  for (let i = 0; i < 90; i++) {
    const rand = Math.random() * 100;
    if (rand > uptime) {
      days.push(rand > 99.5 ? 'outage' : 'degraded');
    } else {
      days.push('operational');
    }
  }
  return days;
}

const services: Service[] = [
  {
    name: 'Platform',
    description: 'Web application and user interface',
    status: 'operational',
    uptime: 99.98,
    icon: <Globe className="h-4 w-4" />,
    dailyStatus: generateDailyStatus(99.98),
  },
  {
    name: 'Authentication',
    description: 'Login, SSO, and session management',
    status: 'operational',
    uptime: 99.99,
    icon: <Shield className="h-4 w-4" />,
    dailyStatus: generateDailyStatus(99.99),
  },
  {
    name: 'API Gateway',
    description: 'GraphQL and REST API endpoints',
    status: 'operational',
    uptime: 99.97,
    icon: <Server className="h-4 w-4" />,
    dailyStatus: generateDailyStatus(99.97),
  },
  {
    name: 'AI Agents',
    description: 'Fatima and claims processing agents',
    status: 'degraded',
    uptime: 99.82,
    icon: <Bot className="h-4 w-4" />,
    dailyStatus: generateDailyStatus(99.82),
  },
  {
    name: 'Database',
    description: 'Primary data store and backups',
    status: 'operational',
    uptime: 99.99,
    icon: <Database className="h-4 w-4" />,
    dailyStatus: generateDailyStatus(99.99),
  },
  {
    name: 'Realtime',
    description: 'WebSocket connections and live updates',
    status: 'operational',
    uptime: 99.94,
    icon: <Wifi className="h-4 w-4" />,
    dailyStatus: generateDailyStatus(99.94),
  },
];

const incidents: Incident[] = [
  {
    id: 'INC-047',
    title: 'Elevated latency on AI Agent responses',
    status: 'monitoring',
    severity: 'minor',
    createdAt: '2026-02-26T08:14:00Z',
    updates: [
      { time: '10:30', message: 'Latency has returned to normal levels. Monitoring for stability.' },
      { time: '09:15', message: 'Identified increased load on Bedrock inference endpoints. Scaling up capacity.' },
      { time: '08:14', message: 'We are investigating reports of slow AI Agent responses.' },
    ],
  },
  {
    id: 'INC-046',
    title: 'Intermittent 502 errors on API Gateway',
    status: 'resolved',
    severity: 'major',
    createdAt: '2026-02-25T14:22:00Z',
    resolvedAt: '2026-02-25T15:41:00Z',
    updates: [
      { time: '15:41', message: 'Issue fully resolved. Root cause: misconfigured health check threshold after deployment.' },
      { time: '15:10', message: 'Fix deployed. Error rate dropping.' },
      { time: '14:45', message: 'Identified faulty health check config causing ECS task cycling.' },
      { time: '14:22', message: 'Investigating elevated 502 error rates on the API Gateway.' },
    ],
  },
  {
    id: 'INC-045',
    title: 'Scheduled maintenance — Database migration',
    status: 'resolved',
    severity: 'minor',
    createdAt: '2026-02-23T02:00:00Z',
    resolvedAt: '2026-02-23T02:18:00Z',
    updates: [
      { time: '02:18', message: 'Migration complete. All services operational.' },
      { time: '02:00', message: 'Beginning scheduled database migration. Brief read-only period expected.' },
    ],
  },
];

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
  monitoring: { icon: <Activity className="h-4 w-4" />, color: 'text-blue-600' },
  investigating: { icon: <Clock className="h-4 w-4" />, color: 'text-amber-600' },
  identified: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-amber-600' },
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
            <p className="text-sm font-medium text-foreground">{service.name}</p>
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

function IncidentCard({ incident }: { incident: Incident }) {
  const { t } = useTranslation();
  const { severityConfig } = useStatusConfig();
  const sConfig = severityConfig[incident.severity]!;
  const iConfig = incidentStatusConfig[incident.status]!;

  return (
    <div className="relative pl-6 pb-8 last:pb-0">
      {/* Timeline connector */}
      <div className="absolute left-[7px] top-6 bottom-0 w-px bg-border last:hidden" />
      <div className={cn('absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background border-2',
        incident.status === 'resolved' ? 'border-emerald-400' : 'border-amber-400'
      )} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-medium text-foreground">{incident.title}</h4>
          <Badge variant={sConfig.variant} className="text-[10px] px-1.5 py-0">
            {sConfig.label}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className={cn('inline-flex items-center gap-1', iConfig.color)}>
            {iConfig.icon}
            <span className="capitalize font-medium">{incident.status}</span>
          </span>
          <span>{new Date(incident.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          {incident.resolvedAt && (
            <span className="text-emerald-600">
              {t('status.resolved', { time: new Date(incident.resolvedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) })}
            </span>
          )}
        </div>

        <div className="space-y-1.5 mt-2">
          {incident.updates.map((update, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="font-mono text-muted-foreground/60 flex-shrink-0 w-12 text-right">{update.time}</span>
              <span className="text-muted-foreground">{update.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Content ── */

export default function StatusPageContent() {
  const { t } = useTranslation();
  const { overallStatusMessages } = useStatusConfig();

  const overall = getOverallStatus(services);
  const banner = overallStatusMessages[overall];
  const bannerGradient = overallBannerStyles[overall];

  const overallUptime = (services.reduce((sum, s) => sum + s.uptime, 0) / services.length).toFixed(2);
  const activeIncidents = incidents.filter((i) => i.status !== 'resolved').length;

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
            <span className="text-xs text-muted-foreground">{t('status.servicesUptime')}</span>
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
          <div>
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Footer Note ── */}
      <p className="text-center text-xs text-muted-foreground/60 pb-4">
        {t('status.footer')} &middot; &copy; 2026 Papaya
      </p>
    </div>
  );
}
