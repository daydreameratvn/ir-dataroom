import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, ShieldAlert, AlertTriangle, Loader2 } from 'lucide-react';
import {
  PageHeader,
  StatCard,
  Button,
  Badge,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { useFWACases, useCreateFWACase } from '../hooks/useFWACases';
import {
  FWA_CASE_STATUS_CONFIG,
  RISK_LEVEL_CLASSES,
  FWA_RECOMMENDATION_CONFIG,
} from '../types';
import type { FlaggedQueueItem, FWACase, FWACaseStatus } from '../types';
import { formatDate, formatCurrencyCompact } from '../utils/format';

export default function FWACasesList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useFWACases();
  const createCase = useCreateFWACase();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FWACaseStatus | 'ALL'>('ALL');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const stats = data?.stats;
  const flaggedQueue = data?.flaggedQueue ?? [];
  const cases = data?.cases ?? [];

  const filteredQueue = flaggedQueue.filter((item) =>
    !search || item.claimCode.toLowerCase().includes(search.toLowerCase()) || item.insuredName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCases = cases.filter((c) => {
    if (search && !c.caseCode.toLowerCase().includes(search.toLowerCase()) && !c.entityName.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    return true;
  });

  function toggleSelection(id: string) {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreateCase() {
    if (selectedItems.size === 0) return;
    const claimIds = Array.from(selectedItems);
    const firstItem = flaggedQueue.find((q) => q.id === claimIds[0]);
    if (!firstItem) return;

    try {
      const result = await createCase.mutateAsync({
        entityType: 'SINGLE_CLAIM',
        entityId: firstItem.insuredPersonId,
        claimIds,
      });
      navigate(`/fwa/fwa-cases/${result.id}`);
    } catch {
      // Error handled by mutation
    }
  }

  const ENTITY_TYPE_LABELS: Record<string, string> = {
    SINGLE_CLAIM: t('portal.fwaCases.entityType.single_claim'),
    INSURED_PERSON: t('portal.fwaCases.entityType.insured'),
    PROVIDER: t('portal.fwaCases.entityType.provider'),
    AGENCY_BROKER: t('portal.fwaCases.entityType.broker'),
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('portal.fwaCases.title')} subtitle={t('portal.fwaCases.subtitle')} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label={t('portal.fwaCases.flaggedQueue')} value={isLoading ? '-' : (stats?.totalFlagged ?? 0)} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label={t('portal.fwaCases.newCases')} value={isLoading ? '-' : (stats?.newCases ?? 0)} icon={<ShieldAlert className="h-5 w-5" />} />
        <StatCard label={t('portal.fwaCases.underInvestigation')} value={isLoading ? '-' : (stats?.underInvestigation ?? 0)} />
        <StatCard label={t('portal.fwaCases.confirmedHits')} value={isLoading ? '-' : (stats?.confirmedHits ?? 0)} />
        <StatCard label={t('portal.fwaCases.cleared')} value={isLoading ? '-' : (stats?.cleared ?? 0)} />
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={t('portal.fwaCases.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 rounded-md border border-input bg-background pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as FWACaseStatus | 'ALL')}
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
        >
          <option value="ALL">{t('portal.fwaCases.allStatuses')}</option>
          {Object.entries(FWA_CASE_STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        {selectedItems.size > 0 && (
          <Button size="sm" onClick={handleCreateCase} disabled={createCase.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {t('portal.fwaCases.createCaseCount', { count: selectedItems.size })}
          </Button>
        )}
      </div>

      <Tabs defaultValue="flagged">
        <TabsList>
          <TabsTrigger value="flagged">{t('portal.fwaCases.flaggedQueueCount', { count: flaggedQueue.length })}</TabsTrigger>
          <TabsTrigger value="cases">{t('portal.fwaCases.activeCasesCount', { count: cases.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="flagged" className="mt-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredQueue.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-6 w-6" />}
              title={t('portal.fwaCases.noFlaggedTitle')}
              description={t('portal.fwaCases.noFlaggedDescription')}
            />
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="w-10 border-b bg-muted/50 px-4 py-3" />
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.claimCode')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.insured')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.provider')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.risk')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.recommendation')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCases.flags')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCases.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((item: FlaggedQueueItem) => {
                    const recCfg = FWA_RECOMMENDATION_CONFIG[item.recommendation];
                    return (
                      <tr key={item.id} className="border-b transition-colors hover:bg-muted/50">
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedItems.has(item.id)}
                            onChange={() => toggleSelection(item.id)}
                            className="rounded border-input"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">{item.claimCode}</td>
                        <td className="px-4 py-3 text-sm">{item.insuredName}</td>
                        <td className="px-4 py-3 text-sm">{item.providerName ?? '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant="secondary" className={cn('text-xs', RISK_LEVEL_CLASSES[item.riskLevel])}>
                            {item.riskLevel} ({item.riskScore})
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {recCfg ? (
                            <Badge variant="secondary" className={recCfg.className}>{recCfg.label}</Badge>
                          ) : (
                            <span>{item.recommendation}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{item.flagCount}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrencyCompact(item.requestedAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="cases" className="mt-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCases.length === 0 ? (
            <EmptyState
              icon={<ShieldAlert className="h-6 w-6" />}
              title={statusFilter !== 'ALL' ? t('portal.fwaCases.noMatchingTitle') : t('portal.fwaCases.noActiveCasesTitle')}
              description={statusFilter !== 'ALL' ? t('portal.fwaCases.noMatchingDescription') : t('portal.fwaCases.noActiveCasesDescription')}
            />
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.caseCode')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.entity')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.status')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCases.riskScore')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCases.claims')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCases.flaggedAmount')}</th>
                    <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.fwaCases.created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCases.map((c: FWACase) => {
                    const statusCfg = FWA_CASE_STATUS_CONFIG[c.status];
                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                        onClick={() => navigate(`/fwa/fwa-cases/${c.id}`)}
                      >
                        <td className="px-4 py-3 text-sm font-mono">{c.caseCode}</td>
                        <td className="px-4 py-3 text-sm">
                          <div>{c.entityName}</div>
                          <div className="text-xs text-muted-foreground">{ENTITY_TYPE_LABELS[c.entityType] ?? c.entityType}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant="secondary" className={statusCfg.className}>{statusCfg.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">{c.highestRiskScore}</td>
                        <td className="px-4 py-3 text-sm text-right">{c.linkedClaims.length}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrencyCompact(c.totalFlaggedAmount)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(c.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
