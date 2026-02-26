import { useTranslation } from 'react-i18next';
import { Shield, Plus } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function PoliciesPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('policies.title')}
        subtitle={t('policies.subtitle')}
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('policies.newPolicy')}
          </Button>
        }
      />
      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">{t('nav.policiesBrowse')}</TabsTrigger>
          <TabsTrigger value="endorsements">{t('nav.policiesEndorsements')}</TabsTrigger>
          <TabsTrigger value="renewals">{t('nav.policiesRenewals')}</TabsTrigger>
          <TabsTrigger value="servicing">{t('nav.policiesServicing')}</TabsTrigger>
        </TabsList>
        <TabsContent value="browse" className="mt-4">
          <EmptyState
            icon={<Shield className="h-6 w-6" />}
            title={t('policies.browseTitle')}
            description={t('policies.browseDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="endorsements" className="mt-4">
          <EmptyState
            icon={<Shield className="h-6 w-6" />}
            title={t('policies.endorsementsTitle')}
            description={t('policies.endorsementsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="renewals" className="mt-4">
          <EmptyState
            icon={<Shield className="h-6 w-6" />}
            title={t('policies.renewalsTitle')}
            description={t('policies.renewalsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="servicing" className="mt-4">
          <EmptyState
            icon={<Shield className="h-6 w-6" />}
            title={t('policies.servicingTitle')}
            description={t('policies.servicingDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
