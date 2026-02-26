import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function AdminPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
      />
      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t('nav.adminUsers')}</TabsTrigger>
          <TabsTrigger value="settings">{t('nav.adminSettings')}</TabsTrigger>
          <TabsTrigger value="audit">{t('nav.adminAudit')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <EmptyState
            icon={<Settings className="h-6 w-6" />}
            title="Users & Roles"
            description="Manage users, roles, system settings, and review audit trails."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <EmptyState
            icon={<Settings className="h-6 w-6" />}
            title="Settings"
            description="Configure system-wide settings, integrations, and tenant preferences."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <EmptyState
            icon={<Settings className="h-6 w-6" />}
            title="Audit Log"
            description="Review all system activity, user actions, and configuration changes."
            action={<Button variant="outline">Get Started</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
