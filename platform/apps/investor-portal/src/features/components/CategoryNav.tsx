import { Tabs, TabsList, TabsTrigger } from '@papaya/shared-ui';
import { FileText, ShieldCheck } from 'lucide-react';

interface CategoryNavProps {
  activeTab: 'documents' | 'nda';
  onTabChange: (tab: 'documents' | 'nda') => void;
  ndaAccepted?: boolean;
  ndaMode?: 'digital' | 'offline';
}

export default function CategoryNav({
  activeTab,
  onTabChange,
  ndaAccepted,
  ndaMode,
}: CategoryNavProps) {
  const ndaLabel = ndaAccepted ? 'Signed NDA' : ndaMode === 'offline' ? 'NDA (Offline)' : 'NDA';

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as 'documents' | 'nda')}
    >
      <TabsList variant="line">
        <TabsTrigger value="documents" className="gap-1.5">
          <FileText className="size-3.5" />
          Documents
        </TabsTrigger>
        <TabsTrigger value="nda" className="gap-1.5">
          <ShieldCheck className="size-3.5" />
          {ndaLabel}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
