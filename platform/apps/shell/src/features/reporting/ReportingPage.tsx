import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function ReportingPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reporting.title')}
        subtitle={t('reporting.subtitle')}
      />
      <Tabs defaultValue="dashboards">
        <TabsList>
          <TabsTrigger value="dashboards">{t('nav.reportingDashboards')}</TabsTrigger>
          <TabsTrigger value="reports">{t('nav.reportingReports')}</TabsTrigger>
          <TabsTrigger value="analytics">{t('nav.reportingAnalytics')}</TabsTrigger>
          <TabsTrigger value="loss">{t('nav.reportingLoss')}</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboards" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Dashboards"
            description="Comprehensive insurance analytics, reporting, and loss management insights."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Reports"
            description="Generate and schedule regulatory, financial, and operational reports."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Analytics"
            description="Deep-dive analytics with custom queries, visualizations, and data exploration."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="loss" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title="Loss Management"
            description="Track loss ratios, reserve adequacy, and claims development triangles."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
