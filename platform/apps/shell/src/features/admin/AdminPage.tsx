import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';
import UserTable from './components/UserTable';
import ErrorTracker from './components/ErrorTracker';
import IdentityProviders from './components/IdentityProviders';
import MembersTable from './components/MembersTable';
import DomainsManager from './components/DomainsManager';
import AuditLogTable from './components/AuditLogTable';

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
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="settings">{t('nav.adminSettings')}</TabsTrigger>
          <TabsTrigger value="audit">{t('nav.adminAudit')}</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UserTable />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTable />
        </TabsContent>
        <TabsContent value="domains" className="mt-4">
          <DomainsManager />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <IdentityProviders />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogTable />
        </TabsContent>
        <TabsContent value="errors" className="mt-4">
          <ErrorTracker />
        </TabsContent>
      </Tabs>
    </div>
  );
}
