import { PageHeader } from '@papaya/shared-ui';
import StatusPageContent from './StatusPageContent';

export default function StatusPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Status"
        subtitle="Real-time health and uptime for all Oasis services"
      />
      <StatusPageContent />
    </div>
  );
}
