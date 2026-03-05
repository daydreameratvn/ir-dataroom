import { useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  CardContent,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@papaya/shared-ui';
import {
  ShieldAlert,
  TrendingUp,
  CheckCircle,
  DollarSign,
  Banknote,
  AlertTriangle,
  Scale,
  Search,
} from 'lucide-react';
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
import { useTranslation } from '@papaya/i18n';
import { useFWAAnalytics } from '../hooks/usePortalAnalytics';
import type { FWAGroupBy, FWAAnalyticsData } from '../types';
import { FWA_CLASSIFICATION_CONFIG, FWA_CATEGORY_COLORS, FWA_RECOMMENDATION_CONFIG } from '../types';
import { formatTHBShort, formatCurrencyCompact } from '../utils/format';
import FWAResolutionSummary from './FWAResolutionSummary';
import FWAHotspotMap from './FWAHotspotMap';
import FWAFlaggedClaimsTable from './FWAFlaggedClaimsTable';

// ─── Constants ─────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  LOW: '#10b981',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toDateStr(from), to: toDateStr(to) };
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function FWAAnalyticsView() {
  const { t } = useTranslation();
  const defaults = getDefaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [groupBy, setGroupBy] = useState<FWAGroupBy>('week');

  const { data, isLoading, refetch, isFetching } = useFWAAnalytics({
    from: dateFrom,
    to: dateTo,
    groupBy,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary;
  const riskDistribution = data?.riskDistribution ?? [];
  const flagsByCategory = data?.flagsByCategory ?? [];
  const recommendations = data?.recommendations ?? [];
  const riskTrends = data?.riskTrends ?? [];
  const fwaClassification = data?.fwaClassification;
  const financialTrends = data?.financialTrends;
  const topFlaggedClaims = data?.topFlaggedClaims ?? [];
  const hotspots = data?.hotspots;

  // Prepare pie chart data for risk distribution
  const riskPieData = riskDistribution.map((d) => ({ name: d.riskLevel, value: d.count }));

  // Prepare pie chart data for recommendations
  const recPieData = recommendations.map((d) => ({ name: d.recommendation, value: d.count }));

  // Prepare classification bar chart data
  const classificationBarData = fwaClassification?.map((item) => ({
    type: FWA_CLASSIFICATION_CONFIG[item.type]?.label ?? item.type,
    [t('portal.fwaAnalytics.identified')]: item.identified,
    [t('portal.fwaAnalytics.confirmed')]: item.confirmed,
  }));

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={t('portal.fwaAnalytics.title')} subtitle={t('portal.fwaAnalytics.subtitle')} />
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('portal.fwaAnalytics.from')}</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border bg-transparent px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">{t('portal.fwaAnalytics.to')}</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border bg-transparent px-2 py-1.5 text-sm"
            />
          </div>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as FWAGroupBy)}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t('portal.fwaAnalytics.daily')}</SelectItem>
              <SelectItem value="week">{t('portal.fwaAnalytics.weekly')}</SelectItem>
              <SelectItem value="month">{t('portal.fwaAnalytics.monthly')}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Detection KPI Cards (Row 1) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('portal.fwaAnalytics.casesDetected')}
          value={summary?.highCriticalCount ?? 0}
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.fwaAnalytics.detectionRate')}
          value={summary?.detectionRate ? formatPercent(summary.detectionRate) : '0%'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.fwaAnalytics.casesConfirmed')}
          value={summary?.casesConfirmed ?? 0}
          icon={<CheckCircle className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.fwaAnalytics.confirmationRate')}
          value={
            summary && summary.casesIdentified > 0
              ? formatPercent((summary.casesConfirmed / summary.casesIdentified) * 100)
              : '0%'
          }
          icon={<Search className="h-5 w-5" />}
        />
      </div>

      {/* Financial KPI Cards (Row 2) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('portal.fwaAnalytics.totalClaimsValue')}
          value={formatTHBShort(summary?.totalClaimsValue ?? 0)}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.fwaAnalytics.valueSaved')}
          value={formatTHBShort(summary?.totalValueSaved ?? 0)}
          icon={<Banknote className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.fwaAnalytics.fraudDeclined')}
          value={formatTHBShort(summary?.totalFraudDeclined ?? 0)}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.fwaAnalytics.wasteAbuseDenied')}
          value={formatTHBShort(summary?.totalWADenied ?? 0)}
          icon={<Scale className="h-5 w-5" />}
        />
      </div>

      {/* Case Resolution Summary */}
      {summary && (
        <FWAResolutionSummary summary={summary} classification={fwaClassification} />
      )}

      {/* Geographic Hotspot Map */}
      {hotspots && hotspots.byProvince.length > 0 && (
        <FWAHotspotMap
          byProvince={hotspots.byProvince}
          byCity={hotspots.byCity}
          byProvider={hotspots.byProvider}
          byBroker={hotspots.byBroker}
        />
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Risk Distribution (Donut) */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.riskDistribution')}</h3>
          </CardHeader>
          <CardContent>
            {riskPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={riskPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {riskPieData.map((entry) => (
                      <Cell key={entry.name} fill={RISK_COLORS[entry.name] ?? '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <NoData />
            )}
          </CardContent>
        </Card>

        {/* Recommendations Distribution */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.recommendations')}</h3>
          </CardHeader>
          <CardContent>
            {recPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={recPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {recPieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={FWA_RECOMMENDATION_CONFIG[entry.name]?.color ?? '#6b7280'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <NoData />
            )}
          </CardContent>
        </Card>

        {/* Flags by Category */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.flagsByCategory')}</h3>
          </CardHeader>
          <CardContent>
            {flagsByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={flagsByCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis dataKey="category" type="category" width={140} className="text-xs" />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {flagsByCategory.map((entry) => (
                      <Cell
                        key={entry.category}
                        fill={FWA_CATEGORY_COLORS[entry.category] ?? '#6b7280'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <NoData />
            )}
          </CardContent>
        </Card>

        {/* Risk Trends Over Time */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.riskTrends')}</h3>
          </CardHeader>
          <CardContent>
            {riskTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={riskTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="critical"
                    stackId="1"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="high"
                    stackId="1"
                    stroke="#f97316"
                    fill="#f97316"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="medium"
                    stackId="1"
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.3}
                  />
                  <Area
                    type="monotone"
                    dataKey="low"
                    stackId="1"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoData />
            )}
          </CardContent>
        </Card>

        {/* FWA Classification Breakdown */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.classificationBreakdown')}</h3>
          </CardHeader>
          <CardContent>
            {classificationBarData && classificationBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={classificationBarData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="type" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={t('portal.fwaAnalytics.identified')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={t('portal.fwaAnalytics.confirmed')} fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <NoData />
            )}
          </CardContent>
        </Card>

        {/* Financial Impact Over Time */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.financialImpact')}</h3>
          </CardHeader>
          <CardContent>
            {financialTrends && financialTrends.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={financialTrends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis
                    className="text-xs"
                    tickFormatter={(v: number) => `${(v / 1_000).toFixed(0)}K`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrencyCompact(value),
                      name,
                    ]}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="totalValue"
                    name={t('portal.fwaAnalytics.totalValue')}
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.1}
                  />
                  <Area
                    type="monotone"
                    dataKey="flaggedValue"
                    name={t('portal.fwaAnalytics.flaggedValue')}
                    stroke="#f59e0b"
                    fill="#f59e0b"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="savedValue"
                    name={t('portal.fwaAnalytics.savedValue')}
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <NoData />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Flagged Claims Table */}
      {topFlaggedClaims.length > 0 && (
        <FWAFlaggedClaimsTable claims={topFlaggedClaims} />
      )}
    </div>
  );
}

function NoData() {
  const { t } = useTranslation();
  return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>;
}
