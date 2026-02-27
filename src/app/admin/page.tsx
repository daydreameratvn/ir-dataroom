import { prisma } from "@/lib/prisma";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Users, UserCheck, FileText, Eye, Download } from "lucide-react";
import { ActivityTable } from "@/components/admin/ActivityTable";

export default async function AdminDashboard() {
  const [
    totalInvestors,
    activeInvestors,
    totalFiles,
    totalViews,
    totalDownloads,
  ] = await Promise.all([
    prisma.investor.count(),
    prisma.investor.count({ where: { status: "nda_accepted" } }),
    prisma.file.count(),
    prisma.accessLog.count({ where: { action: "view" } }),
    prisma.accessLog.count({ where: { action: "download" } }),
  ]);

  const stats = [
    {
      label: "Total Investors",
      value: totalInvestors,
      icon: Users,
      description: "All registered investors",
    },
    {
      label: "Active Investors",
      value: activeInvestors,
      icon: UserCheck,
      description: "NDA accepted",
    },
    {
      label: "Total Files",
      value: totalFiles,
      icon: FileText,
      description: "In dataroom",
    },
    {
      label: "Total Views",
      value: totalViews,
      icon: Eye,
      description: "File views",
    },
    {
      label: "Total Downloads",
      value: totalDownloads,
      icon: Download,
      description: "File downloads",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your investor dataroom.
        </p>
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
                <CardDescription>{stat.description}</CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Activity Log */}
      <ActivityTable />
    </div>
  );
}
