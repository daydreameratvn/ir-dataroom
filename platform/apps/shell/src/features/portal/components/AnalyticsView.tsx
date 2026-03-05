import { Loader2 } from 'lucide-react';
import { PageHeader, Card, CardHeader, CardContent } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { usePortalAnalytics } from '../hooks/usePortalAnalytics';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AnalyticsView() {
  const { t } = useTranslation();
  const { data, isLoading } = usePortalAnalytics();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const claimsOverTime = (data?.claimsOverTime as Array<{ date: string; count: number }>) ?? [];
  const outcomeDistribution = (data?.outcomeDistribution as Array<{ name: string; value: number }>) ?? [];
  const topDiagnoses = (data?.topDiagnoses as Array<{ code: string; count: number }>) ?? [];
  const processingTimes = (data?.processingTimes as Array<{ type: string; avgMinutes: number }>) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('portal.analytics.title')} subtitle={t('portal.analytics.subtitle')} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Claims Volume Over Time */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.analytics.claimsOverTime')}</h3>
          </CardHeader>
          <CardContent>
            {claimsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={claimsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        {/* Assessment Outcomes */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.analytics.outcomeDistribution')}</h3>
          </CardHeader>
          <CardContent>
            {outcomeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={outcomeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {outcomeDistribution.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        {/* Top Diagnoses */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.analytics.topDiagnoses')}</h3>
          </CardHeader>
          <CardContent>
            {topDiagnoses.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topDiagnoses} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="code" type="category" width={80} className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>

        {/* Processing Times */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.analytics.processingTimes')}</h3>
          </CardHeader>
          <CardContent>
            {processingTimes.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={processingTimes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="type" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="avgMinutes" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
