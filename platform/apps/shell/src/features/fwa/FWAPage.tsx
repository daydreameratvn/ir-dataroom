import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function FWAPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fwa.title')}
        subtitle={t('fwa.subtitle')}
      />
      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">{t('nav.fwaAlerts')}</TabsTrigger>
          <TabsTrigger value="investigations">{t('nav.fwaInvestigations')}</TabsTrigger>
          <TabsTrigger value="rules">{t('nav.fwaRules')}</TabsTrigger>
        </TabsList>
        <TabsContent value="alerts" className="mt-4">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title={t('fwa.alertsTitle')}
            description={t('fwa.alertsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="investigations" className="mt-4">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title={t('fwa.investigationsTitle')}
            description={t('fwa.investigationsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title={t('fwa.rulesTitle')}
            description={t('fwa.rulesDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
