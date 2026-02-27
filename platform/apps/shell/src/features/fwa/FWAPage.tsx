import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';
import AssessmentTab from './components/AssessmentTab';
import ComplianceTab from './components/ComplianceTab';
import ScourgeTab from './components/ScourgeTab';
import PendingTab from './components/PendingTab';

export default function FWAPage() {
  const [activeTab, setActiveTab] = useState('assessment');

  // When user clicks a pending assessment, switch to assessment tab with that chat
  const [pendingChatId, setPendingChatId] = useState<string | undefined>();
  const [pendingClaimCode, setPendingClaimCode] = useState<string | undefined>();

  function handleSelectPendingChat(chatId: string, claimCode: string) {
    setPendingChatId(chatId);
    setPendingClaimCode(claimCode);
    setActiveTab('assessment');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="FWA Detection"
        subtitle="Fraud, waste, and abuse detection agents"
        action={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm">
            <ShieldAlert className="h-5 w-5" />
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="assessment">Assessment</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="scourge">Scourge</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>

        <TabsContent value="assessment">
          <AssessmentTab
            initialChatId={pendingChatId}
            initialClaimCode={pendingClaimCode}
          />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceTab />
        </TabsContent>

        <TabsContent value="scourge">
          <ScourgeTab />
        </TabsContent>

        <TabsContent value="pending">
          <PendingTab onSelectChat={handleSelectPendingChat} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
