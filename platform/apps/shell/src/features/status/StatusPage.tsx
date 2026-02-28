import { useTranslation } from 'react-i18next';
import { PageHeader } from '@papaya/shared-ui';
import { useAuth } from '@papaya/auth';
import StatusPageContent from './StatusPageContent';
import IncidentManagementPanel from './components/IncidentManagementPanel';
import ServiceOverridePanel from './components/ServiceOverridePanel';

export default function StatusPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.userLevel === 'admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('status.title')}
        subtitle={t('status.subtitle')}
      />
      <StatusPageContent />
      {isAdmin && <IncidentManagementPanel />}
      {isAdmin && <ServiceOverridePanel />}
    </div>
  );
}
