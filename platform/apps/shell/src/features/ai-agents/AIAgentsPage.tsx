import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import {
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from '@papaya/shared-ui';

const agents = [
  {
    id: 'claim-assessor',
    nameKey: 'aiAgents.claimAssessor',
    description: 'Automatically assesses and adjudicates insurance claims using medical coding analysis and policy matching.',
    status: 'online',
  },
  {
    id: 'fraud-detector',
    nameKey: 'aiAgents.fraudDetector',
    description: 'Detects patterns of fraud, waste, and abuse across claims and providers in real-time.',
    status: 'online',
  },
  {
    id: 'underwriting-assistant',
    nameKey: 'aiAgents.underwritingAssistant',
    description: 'Assists underwriters with risk assessment, pricing recommendations, and application review.',
    status: 'online',
  },
  {
    id: 'document-analyzer',
    nameKey: 'aiAgents.documentAnalyzer',
    description: 'Extracts and validates information from medical documents, receipts, and claim forms.',
    status: 'online',
  },
];

export default function AIAgentsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('aiAgents.title')}
        subtitle={t('aiAgents.subtitle')}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{t(agent.nameKey)}</CardTitle>
              </div>
              <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                {t('aiAgents.online')}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{agent.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
