import { useTranslation } from 'react-i18next';
import { Building2, Plus } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function ProvidersPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('providers.title')}
        subtitle={t('providers.subtitle')}
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('providers.addProvider')}
          </Button>
        }
      />
      <Tabs defaultValue="directory">
        <TabsList>
          <TabsTrigger value="directory">{t('nav.providersDirectory')}</TabsTrigger>
          <TabsTrigger value="contracts">{t('nav.providersContracts')}</TabsTrigger>
          <TabsTrigger value="performance">{t('nav.providersPerformance')}</TabsTrigger>
        </TabsList>
        <TabsContent value="directory" className="mt-4">
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={t('providers.directoryTitle')}
            description={t('providers.directoryDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="contracts" className="mt-4">
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={t('providers.contractsTitle')}
            description={t('providers.contractsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title={t('providers.performanceTitle')}
            description={t('providers.performanceDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
