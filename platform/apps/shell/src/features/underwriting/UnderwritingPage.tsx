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
            title="Applications"
            description="AI-assisted risk assessment and pricing for new insurance applications."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="risk" className="mt-4">
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title="Risk Assessment"
            description="AI-driven risk scoring and analysis for individual applications and portfolios."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" />}
            title="Pricing"
            description="Dynamic pricing models and premium calculations based on risk profiles."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
