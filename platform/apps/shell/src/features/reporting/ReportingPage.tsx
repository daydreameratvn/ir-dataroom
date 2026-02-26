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
            title={t('reporting.dashboardsTitle')}
            description={t('reporting.dashboardsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title={t('reporting.reportsTitle')}
            description={t('reporting.reportsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="analytics" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title={t('reporting.analyticsTitle')}
            description={t('reporting.analyticsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="loss" className="mt-4">
          <EmptyState
            icon={<BarChart3 className="h-6 w-6" />}
            title={t('reporting.lossTitle')}
            description={t('reporting.lossDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
