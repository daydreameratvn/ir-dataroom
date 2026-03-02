import { useCallback, useEffect, useState } from 'react';
import { Eye, Users, RefreshCw, Download, Clock } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  Button,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';
import type { RoundAnalytics, InvestorEngagement, EngagementSignal } from '../types';
import { getRoundAnalytics, getRoundEngagement } from '../api';

interface AnalyticsDashboardProps {
  roundId: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// ── Engagement signal logic (same as InvestorTable) ──

function getSignal(eng: InvestorEngagement): EngagementSignal | null {
  if (['termsheet_sent', 'termsheet_signed', 'docs_out', 'dropped'].includes(eng.status)) return null;

  const daysSinceActive = eng.lastActiveAt
    ? Math.floor((Date.now() - new Date(eng.lastActiveAt).getTime()) / 86400000)
    : Infinity;
  const hasActivity = eng.totalViews > 0 || eng.totalDownloads > 0;

  if (!hasActivity) {
    return { label: 'New', color: '#9ca3af', tip: 'No activity yet.', rec: '' };
  }
  if (daysSinceActive >= 14) {
    return { label: 'Cold', color: '#ef4444', tip: 'Inactive 14+ days.', rec: '' };
  }
  if (eng.totalDownloads > 0 && daysSinceActive < 7) {
    return { label: 'Hot', color: '#22c55e', tip: 'Downloading files.', rec: '' };
  }
  if ((eng.totalViews >= 5 || eng.totalDownloads >= 2 || eng.totalTimeSpent >= 300) && daysSinceActive < 14) {
    return { label: 'Engaged', color: '#3b82f6', tip: 'Strong engagement.', rec: '' };
  }
  if (eng.totalViews > 0 && eng.totalDownloads === 0 && daysSinceActive < 7) {
    return { label: 'Warming', color: '#eab308', tip: 'Browsing, no downloads.', rec: '' };
  }

  return null;
}

export default function AnalyticsDashboard({ roundId }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<RoundAnalytics | null>(null);
  const [engagement, setEngagement] = useState<InvestorEngagement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [analyticsResult, engagementResult] = await Promise.all([
        getRoundAnalytics(roundId),
        getRoundEngagement(roundId).catch(() => [] as InvestorEngagement[]),
      ]);
      setAnalytics(analyticsResult);
      setEngagement(engagementResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={fetchAnalytics} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!analytics) return null;

  // Compute engagement distribution
  const signalCounts = { Hot: 0, Engaged: 0, Warming: 0, Cold: 0, New: 0 };
  for (const eng of engagement) {
    const signal = getSignal(eng);
    if (signal && signal.label in signalCounts) {
      signalCounts[signal.label as keyof typeof signalCounts]++;
    }
  }
  const totalEngagement = Object.values(signalCounts).reduce((a, b) => a + b, 0);

  const signalColors: Record<string, string> = {
    Hot: '#22c55e',
    Engaged: '#3b82f6',
    Warming: '#eab308',
    Cold: '#ef4444',
    New: '#9ca3af',
  };

  const maxViews = Math.max(...analytics.viewsOverTime.map((v) => v.views), 1);
  const maxDocViews = Math.max(...analytics.viewsPerDocument.map((d) => d.views), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Views"
          value={analytics.totalViews.toLocaleString()}
          icon={<Eye className="h-4 w-4" />}
        />
        <StatCard
          label="Unique Viewers"
          value={analytics.uniqueViewers.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Documents Tracked"
          value={analytics.viewsPerDocument.length}
          icon={<Download className="h-4 w-4" />}
        />
        <StatCard
          label="Active Investors"
          value={engagement.filter((e) => {
            const s = getSignal(e);
            return s && s.label !== 'New';
          }).length}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="documents">Document Popularity</TabsTrigger>
          <TabsTrigger value="investors">Top Investors</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-6">
          {/* Engagement Distribution */}
          {totalEngagement > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-4 text-sm font-medium">Investor Engagement Distribution</h4>
                {/* Horizontal stacked bar */}
                <div className="mb-3 flex h-8 w-full overflow-hidden rounded-lg">
                  {Object.entries(signalCounts).map(([label, count]) => {
                    if (count === 0) return null;
                    const pct = (count / totalEngagement) * 100;
                    return (
                      <div
                        key={label}
                        className="flex items-center justify-center text-xs font-medium text-white transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: signalColors[label],
                          minWidth: count > 0 ? 20 : 0,
                        }}
                        title={`${label}: ${count} (${Math.round(pct)}%)`}
                      >
                        {pct > 8 ? count : ''}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-4">
                  {Object.entries(signalCounts).map(([label, count]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-3 w-3 rounded-full"
                        style={{ backgroundColor: signalColors[label] }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {label}: {count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Views over time */}
          {analytics.viewsOverTime.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-4 text-sm font-medium">Daily Activity (Last 30 Days)</h4>
                <div className="flex items-end gap-1" style={{ height: 160 }}>
                  {analytics.viewsOverTime.map((entry) => {
                    const heightPercent = (entry.views / maxViews) * 100;
                    return (
                      <div
                        key={entry.date}
                        className="group relative flex-1"
                        style={{ height: '100%' }}
                      >
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary"
                          style={{ height: `${heightPercent}%`, minHeight: entry.views > 0 ? 4 : 0 }}
                        />
                        <div className="absolute -top-6 left-1/2 hidden -translate-x-1/2 rounded bg-foreground px-1.5 py-0.5 text-xs text-background group-hover:block">
                          {entry.views}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                  {analytics.viewsOverTime.length > 0 && (
                    <>
                      <span>{analytics.viewsOverTime[0]!.date}</span>
                      <span>{analytics.viewsOverTime[analytics.viewsOverTime.length - 1]!.date}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Engagement Tab ── */}
        <TabsContent value="engagement" className="space-y-6">
          {/* Engagement Distribution */}
          {totalEngagement > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-4 text-sm font-medium">Engagement Breakdown</h4>
                <div className="space-y-3">
                  {Object.entries(signalCounts).map(([label, count]) => {
                    const pct = totalEngagement > 0 ? (count / totalEngagement) * 100 : 0;
                    return (
                      <div key={label} className="flex items-center gap-3">
                        <span className="w-20 text-xs font-medium" style={{ color: signalColors[label] }}>
                          {label}
                        </span>
                        <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: signalColors[label] }}
                          />
                        </div>
                        <span className="w-12 text-right text-xs text-muted-foreground">
                          {count} ({Math.round(pct)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Engagement table - detailed */}
          {engagement.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-4 text-sm font-medium">Investor Engagement Details</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Investor</TableHead>
                        <TableHead>Signal</TableHead>
                        <TableHead className="text-right">Views</TableHead>
                        <TableHead className="text-right">Downloads</TableHead>
                        <TableHead className="text-right">Files</TableHead>
                        <TableHead className="text-right">Time Spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {engagement
                        .sort((a, b) => (b.totalViews + b.totalDownloads) - (a.totalViews + a.totalDownloads))
                        .slice(0, 25)
                        .map((eng) => {
                          const signal = getSignal(eng);
                          return (
                            <TableRow key={eng.investorId}>
                              <TableCell>
                                <div>
                                  <span className="font-medium">{eng.investorName}</span>
                                  {eng.investorFirm && (
                                    <p className="text-xs text-muted-foreground">{eng.investorFirm}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {signal ? (
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="inline-block rounded-full"
                                      style={{ width: 8, height: 8, backgroundColor: signal.color }}
                                    />
                                    <span className="text-xs font-medium" style={{ color: signal.color }}>
                                      {signal.label}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">&mdash;</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm">{eng.totalViews}</TableCell>
                              <TableCell className="text-right text-sm">{eng.totalDownloads}</TableCell>
                              <TableCell className="text-right text-sm">{eng.uniqueFilesViewed}</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {formatDuration(eng.totalTimeSpent)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Document Popularity Tab ── */}
        <TabsContent value="documents" className="space-y-6">
          {analytics.viewsPerDocument.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-4 text-sm font-medium">File Popularity</h4>
                {/* Horizontal bar chart */}
                <div className="space-y-2">
                  {analytics.viewsPerDocument.map((doc) => {
                    const pct = (doc.views / maxDocViews) * 100;
                    return (
                      <div key={doc.documentId} className="flex items-center gap-3">
                        <span className="w-48 truncate text-xs font-medium">{doc.documentName}</span>
                        <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {doc.views}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Top Investors Tab ── */}
        <TabsContent value="investors" className="space-y-6">
          {analytics.topInvestors.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="mb-4 text-sm font-medium">Top Investors by Activity</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Investor</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                        <TableHead className="text-right">Total Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.topInvestors.map((investor) => (
                        <TableRow key={investor.investorId}>
                          <TableCell className="font-medium">
                            {investor.investorName}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-xs">
                              {investor.totalActions}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatDuration(investor.totalDuration)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
