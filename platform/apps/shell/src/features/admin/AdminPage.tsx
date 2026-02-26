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
            title={t('admin.usersTitle')}
            description={t('admin.usersDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <EmptyState
            icon={<Settings className="h-6 w-6" />}
            title={t('admin.settingsTitle')}
            description={t('admin.settingsDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <EmptyState
            icon={<Settings className="h-6 w-6" />}
            title={t('admin.auditTitle')}
            description={t('admin.auditDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
