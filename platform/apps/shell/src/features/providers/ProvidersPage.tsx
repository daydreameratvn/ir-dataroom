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
            title="Provider Directory"
            description="Manage your medical provider network, contracts, and performance metrics."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="contracts" className="mt-4">
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="Contracts"
            description="View and manage provider contracts, fee schedules, and agreements."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="performance" className="mt-4">
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="Performance"
            description="Track provider performance metrics, quality scores, and compliance ratings."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
