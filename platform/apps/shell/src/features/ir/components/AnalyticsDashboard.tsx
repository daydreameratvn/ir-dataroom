import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  FileText,
  Eye,
  Download,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
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
import type { RoundAnalytics, RoundDashboardStats, AccessLog } from '../types';
import { getRoundAnalytics, getRoundDashboardStats, getAccessLogs, exportAccessLogsCSV, getRoundEngagement } from '../api';

interface AnalyticsDashboardProps {
  roundId: string;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

export default function AnalyticsDashboard({ roundId }: AnalyticsDashboardProps) {
  const [analytics, setAnalytics] = useState<RoundAnalytics | null>(null);
  const [dashStats, setDashStats] = useState<RoundDashboardStats | null>(null);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [analyticsResult, statsResult, logsResult, engagementResult] = await Promise.all([
        getRoundAnalytics(roundId),
        getRoundDashboardStats(roundId),
        getAccessLogs(roundId, { limit: 200 }),
        getRoundEngagement(roundId).catch(() => []),
      ]);
      setAnalytics(analyticsResult);
      setDashStats(statsResult);
      setAccessLogs(logsResult.data);

      // Merge engagement data into investor chart data
      setInvestorEngagement(
        engagementResult
          .map((inv) => ({
            name: inv.investorName || inv.investorEmail.split('@')[0] || inv.investorEmail,
            views: inv.totalViews,
            downloads: inv.totalDownloads,
          }))
          .sort((a, b) => b.views + b.downloads - (a.views + a.downloads))
          .slice(0, 10)
      );
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  const [investorEngagement, setInvestorEngagement] = useState<
    { name: string; views: number; downloads: number }[]
  >([]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading || !analytics || !dashStats) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  // File popularity chart data
  const filePopularity = analytics.viewsPerDocument
    .map((f) => ({
      name: f.documentName.length > 20 ? f.documentName.substring(0, 20) + '...' : f.documentName,
      views: f.views,
      downloads: f.downloads,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Daily activity chart data
  const dailyActivity = analytics.viewsOverTime;

  // Filtered activity log
  const filteredActivity = filterText
    ? accessLogs.filter((log) => {
        const search = filterText.toLowerCase();
        return (
          log.investorEmail.toLowerCase().includes(search) ||
          (log.documentName?.toLowerCase().includes(search) ?? false) ||
          log.action.toLowerCase().includes(search)
        );
      })
    : accessLogs;

  const stats = [
    { label: 'Total Investors', value: dashStats.totalInvestors, icon: Users },
    { label: 'Active Investors', value: dashStats.activeInvestors, icon: UserCheck },
    { label: 'Total Files', value: dashStats.totalFiles, icon: FileText },
    { label: 'Total Views', value: dashStats.totalViews, icon: Eye },
    { label: 'Total Downloads', value: dashStats.totalDownloads, icon: Download },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
          <p className="text-muted-foreground">
            Detailed insights into investor engagement.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportAccessLogsCSV(roundId)}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {/* Charts */}
      <Tabs defaultValue="engagement" className="space-y-4">
        <TabsList>
          <TabsTrigger value="engagement">Investor Engagement</TabsTrigger>
          <TabsTrigger value="files">File Popularity</TabsTrigger>
          <TabsTrigger value="activity">Daily Activity</TabsTrigger>
          <TabsTrigger value="log">Activity Log</TabsTrigger>
        </TabsList>

        {/* Investor Engagement */}
        <TabsContent value="engagement">
          <Card>
            <CardHeader>
              <CardTitle>Investor Engagement Ranking</CardTitle>
              <CardDescription>Top investors by views and downloads</CardDescription>
            </CardHeader>
            <CardContent>
              {investorEngagement.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No engagement data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={investorEngagement}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-30}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="views" fill="#3b82f6" name="Views" />
                    <Bar dataKey="downloads" fill="#10b981" name="Downloads" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* File Popularity */}
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>Most Viewed Files</CardTitle>
              <CardDescription>Files ranked by total views</CardDescription>
            </CardHeader>
            <CardContent>
              {filePopularity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No file data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={filePopularity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-30}
                      textAnchor="end"
                      height={80}
                      fontSize={12}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="views" fill="#8b5cf6" name="Views" />
                    <Bar dataKey="downloads" fill="#f59e0b" name="Downloads" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Daily Activity */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Daily Activity</CardTitle>
              <CardDescription>Views and downloads over time</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activity data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={dailyActivity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={12} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="views"
                      stroke="#3b82f6"
                      name="Views"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="downloads"
                      stroke="#10b981"
                      name="Downloads"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Log */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Full Activity Log
              </CardTitle>
              <CardDescription>All file access events with filtering</CardDescription>
              <div className="pt-2">
                <Input
                  placeholder="Filter by investor, file, or action..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="max-w-sm"
                />
              </div>
            </CardHeader>
            <CardContent>
              {filteredActivity.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activity matching your filter.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Investor</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActivity.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {log.investorEmail}
                        </TableCell>
                        <TableCell>{log.documentName ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={log.action === 'download' ? 'default' : 'secondary'}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDuration(log.durationSeconds)}
                        </TableCell>
                        <TableCell>
                          {new Date(log.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
