import { useTranslation } from 'react-i18next';
import { PageHeader } from '@papaya/shared-ui';
import StatusPageContent from './StatusPageContent';

export default function StatusPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('status.title')}
        subtitle={t('status.subtitle')}
      />
      <StatusPageContent />
    </div>
  );
}
