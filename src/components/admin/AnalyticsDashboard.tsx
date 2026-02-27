"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
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
} from "recharts";
import {
  Users,
  UserCheck,
  FileText,
  Eye,
  Download,
  Activity,
} from "lucide-react";

interface InvestorAnalytics {
  id: string;
  email: string;
  name: string | null;
  status: string;
  ndaAcceptedAt: string | null;
  totalFilesViewed: number;
  totalTimeSpent: number;
  totalDownloads: number;
  lastActive: string | null;
}

interface FileAnalytics {
  id: string;
  name: string;
  category: string;
  uniqueViewers: number;
  totalViews: number;
  avgViewDuration: number;
  totalDownloads: number;
}

interface DailyActivity {
  date: string;
  views: number;
  downloads: number;
}

interface AnalyticsData {
  summary: {
    totalInvestors: number;
    activeInvestors: number;
    totalFiles: number;
    totalViews: number;
    totalDownloads: number;
  };
  investors: InvestorAnalytics[];
  files: FileAnalytics[];
  dailyActivity: DailyActivity[];
  recentActivity: {
    id: string;
    action: string;
    startedAt: string;
    duration: number | null;
    investor: { email: string; name: string | null };
    file: { name: string; category: string };
  }[];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return seconds + "s";
  if (seconds < 3600)
    return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
  return (
    Math.floor(seconds / 3600) +
    "h " +
    Math.floor((seconds % 3600) / 60) +
    "m"
  );
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState("");
  const { toast } = useToast();

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const result = await res.json();
      setData(result);
    } catch {
      toast({
        title: "Error",
        description: "Failed to load analytics data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading || !data) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Loading analytics...
      </div>
    );
  }

  const { summary, investors, files, dailyActivity, recentActivity } = data;

  // Prepare chart data
  const investorEngagement = investors
    .map((inv) => ({
      name: inv.name || inv.email.split("@")[0],
      views: inv.totalFilesViewed,
      downloads: inv.totalDownloads,
      timeSpent: inv.totalTimeSpent,
    }))
    .sort((a, b) => b.views + b.downloads - (a.views + a.downloads))
    .slice(0, 10);

  const filePopularity = files
    .map((f) => ({
      name: f.name.length > 20 ? f.name.substring(0, 20) + "..." : f.name,
      views: f.totalViews,
      downloads: f.totalDownloads,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Filter activity log
  const filteredActivity = recentActivity.filter((log) => {
    if (!filterText) return true;
    const search = filterText.toLowerCase();
    return (
      log.investor.email.toLowerCase().includes(search) ||
      log.file.name.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search)
    );
  });

  const stats = [
    {
      label: "Total Investors",
      value: summary.totalInvestors,
      icon: Users,
    },
    {
      label: "Active Investors",
      value: summary.activeInvestors,
      icon: UserCheck,
    },
    {
      label: "Total Files",
      value: summary.totalFiles,
      icon: FileText,
    },
    {
      label: "Total Views",
      value: summary.totalViews,
      icon: Eye,
    },
    {
      label: "Total Downloads",
      value: summary.totalDownloads,
      icon: Download,
    },
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
        <Button variant="outline" size="sm" asChild>
          <a href="/api/tracking/export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </a>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
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
              <CardDescription>
                Top investors by views and downloads
              </CardDescription>
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
              <CardDescription>
                Files ranked by total views
              </CardDescription>
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
              <CardDescription>
                Views and downloads over time
              </CardDescription>
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
              <CardDescription>
                All file access events with filtering
              </CardDescription>
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
                          {log.investor.email}
                        </TableCell>
                        <TableCell>{log.file.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.action === "download"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {log.duration != null
                            ? formatDuration(log.duration)
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(log.startedAt).toLocaleString()}
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
