import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Plus } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function UnderwritingPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('underwriting.title')}
        subtitle={t('underwriting.subtitle')}
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('underwriting.newApplication')}
          </Button>
        }
      />
      <Tabs defaultValue="applications">
        <TabsList>
          <TabsTrigger value="applications">{t('nav.underwritingApplications')}</TabsTrigger>
          <TabsTrigger value="risk">{t('nav.underwritingRisk')}</TabsTrigger>
          <TabsTrigger value="pricing">{t('nav.underwritingPricing')}</TabsTrigger>
        </TabsList>
        <TabsContent value="applications" className="mt-4">
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={t('underwriting.applicationsTitle')}
            description={t('underwriting.applicationsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={t('underwriting.riskTitle')}
            description={t('underwriting.riskDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title={t('underwriting.pricingTitle')}
            description={t('underwriting.pricingDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
