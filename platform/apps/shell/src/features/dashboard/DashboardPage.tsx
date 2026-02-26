import { useTranslation } from 'react-i18next';
import {
  FileText,
  Clock,
  Shield,
  ShieldAlert,
  Bot,
  TrendingUp,
  Plus,
  BarChart3,
} from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '@papaya/shared-ui';
import { useAuth } from '@papaya/auth';

const recentActivity = [
  { id: '1', type: 'claim', action: 'AI adjudicated', detail: 'CLM-2024-0892 — Auto-approved ($2,450)', time: '2m ago', agent: 'Claim Assessor' },
  { id: '2', type: 'fwa', action: 'Alert flagged', detail: 'Provider P-0034 — Unusual billing pattern', time: '8m ago', agent: 'Fraud Detector' },
  { id: '3', type: 'claim', action: 'Submitted', detail: 'CLM-2024-0893 — Hospitalization ($15,800)', time: '12m ago', agent: undefined },
  { id: '4', type: 'policy', action: 'Renewed', detail: 'POL-TH-2024-1205 — Premium adjusted +5%', time: '25m ago', agent: 'Underwriting Assistant' },
  { id: '5', type: 'claim', action: 'Documents analyzed', detail: 'CLM-2024-0890 — 12 documents processed', time: '32m ago', agent: 'Document Analyzer' },
];

export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t('dashboard.title')}`}
        subtitle={`${t('dashboard.subtitle')} — ${user?.name ?? ''}`}
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label={t('dashboard.totalClaims')}
          value="1,284"
          icon={<FileText className="h-5 w-5" />}
          trend={{ value: 12.5, label: 'vs last month' }}
        />
        <StatCard
          label={t('dashboard.pendingReview')}
          value="47"
          icon={<Clock className="h-5 w-5" />}
          trend={{ value: -8.3, label: 'vs last week' }}
        />
        <StatCard
          label={t('dashboard.activePolicies')}
          value="8,392"
          icon={<Shield className="h-5 w-5" />}
          trend={{ value: 3.2, label: 'growth' }}
        />
        <StatCard
          label={t('dashboard.fwaAlerts')}
          value="12"
          icon={<ShieldAlert className="h-5 w-5" />}
          trend={{ value: -15.0, label: 'vs last month' }}
        />
        <StatCard
          label={t('dashboard.aiProcessed')}
          value="94.7%"
          icon={<Bot className="h-5 w-5" />}
          trend={{ value: 2.1, label: 'accuracy' }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">{t('dashboard.recentActivity')}</CardTitle>
            <Button variant="ghost" size="sm">
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                  {activity.type === 'claim' && <FileText className="h-4 w-4 text-blue-600" />}
                  {activity.type === 'fwa' && <ShieldAlert className="h-4 w-4 text-orange-600" />}
                  {activity.type === 'policy' && <Shield className="h-4 w-4 text-emerald-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{activity.action}</span>
                    {activity.agent && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <Bot className="mr-0.5 h-2.5 w-2.5" /> {activity.agent}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{activity.detail}</p>
                </div>
                <span className="flex-shrink-0 text-xs text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">{t('dashboard.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-start" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.newClaim')}
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              {t('dashboard.newPolicy')}
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              {t('dashboard.runAnalysis')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
