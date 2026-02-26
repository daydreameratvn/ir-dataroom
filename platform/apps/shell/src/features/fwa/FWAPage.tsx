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
            title="FWA Alerts"
            description="Real-time fraud, waste, and abuse detection powered by Papaya AI agents."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="investigations" className="mt-4">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="Investigations"
            description="Track and manage ongoing fraud investigations with full case management."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <EmptyState
            icon={<ShieldAlert className="h-6 w-6" />}
            title="Rules Engine"
            description="Configure and manage fraud detection rules, thresholds, and scoring models."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
