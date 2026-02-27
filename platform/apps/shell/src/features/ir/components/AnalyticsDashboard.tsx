import { useCallback, useEffect, useState } from 'react';
import { Eye, Users, RefreshCw } from 'lucide-react';
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
} from '@papaya/shared-ui';
import type { RoundAnalytics } from '../types';
import { getRoundAnalytics } from '../api';

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

export default function AnalyticsDashboard({ roundId }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<RoundAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getRoundAnalytics(roundId);
      setAnalytics(result);
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

  const maxViews = Math.max(...analytics.viewsOverTime.map((v) => v.views), 1);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      {/* Views over time - simple bar chart */}
      {analytics.viewsOverTime.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="mb-4 text-sm font-medium">Views Over Time</h4>
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

      {/* Top Investors */}
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
                          {investor.actions}
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

      {/* Views per Document */}
      {analytics.viewsPerDocument.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h4 className="mb-4 text-sm font-medium">Views per Document</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.viewsPerDocument.map((doc) => (
                    <TableRow key={doc.documentId}>
                      <TableCell className="font-medium">
                        {doc.documentName}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {doc.views}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
