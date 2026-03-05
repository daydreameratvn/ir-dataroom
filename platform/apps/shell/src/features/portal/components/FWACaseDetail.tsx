import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  StickyNote,
  FileQuestion,
  ArrowUpRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Brain,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  Badge,
  Card,
  CardHeader,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  MarkdownRenderer,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { useFWACase, useDeleteFWACase } from '../hooks/useFWACases';
import { FWA_CASE_STATUS_CONFIG, RISK_LEVEL_CLASSES, FWA_RECOMMENDATION_CONFIG } from '../types';
import type { FWACaseLinkedClaim, FWACaseAction, FWACaseActionType, FWAFlag } from '../types';
import { formatDate, formatDateTime, formatCurrencyCompact } from '../utils/format';

const ACTION_TYPE_ICONS: Record<FWACaseActionType, typeof StickyNote> = {
  NOTE: StickyNote,
  DOCUMENT_REQUEST: FileQuestion,
  ESCALATION: ArrowUpRight,
  STATUS_CHANGE: RefreshCw,
  CONFIRMATION: CheckCircle2,
  CLEARANCE: XCircle,
};

const ACTION_TYPE_CLASSES: Record<FWACaseActionType, string> = {
  NOTE: 'bg-slate-100 text-slate-700',
  DOCUMENT_REQUEST: 'bg-blue-100 text-blue-700',
  ESCALATION: 'bg-orange-100 text-orange-700',
  STATUS_CHANGE: 'bg-purple-100 text-purple-700',
  CONFIRMATION: 'bg-red-100 text-red-700',
  CLEARANCE: 'bg-emerald-100 text-emerald-700',
};

const SEVERITY_CLASSES: Record<string, string> = {
  LOW: 'bg-blue-100 text-blue-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
};

export default function FWACaseDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'overview';
  const { data: fwaCase, isLoading, error } = useFWACase(id!);
  const deleteCase = useDeleteFWACase();
  const [expandedClaims, setExpandedClaims] = useState<Set<string>>(new Set());

  const ENTITY_TYPE_LABELS: Record<string, string> = {
    SINGLE_CLAIM: t('portal.fwaCases.entityType.single_claim'),
    INSURED_PERSON: t('portal.fwaCases.entityType.insured'),
    PROVIDER: t('portal.fwaCases.entityType.provider'),
    AGENCY_BROKER: t('portal.fwaCases.entityType.broker'),
  };

  const ACTION_TYPE_LABELS: Record<FWACaseActionType, string> = {
    NOTE: t('portal.fwaCaseDetail.actionType.note'),
    DOCUMENT_REQUEST: t('portal.fwaCaseDetail.actionType.documentRequest'),
    ESCALATION: t('portal.fwaCaseDetail.actionType.escalation'),
    STATUS_CHANGE: t('portal.fwaCaseDetail.actionType.statusChange'),
    CONFIRMATION: t('portal.fwaCaseDetail.actionType.confirmation'),
    CLEARANCE: t('portal.fwaCaseDetail.actionType.clearance'),
  };

  function setTab(tab: string) {
    setSearchParams({ tab }, { replace: true });
  }

  function toggleClaimExpanded(claimId: string) {
    setExpandedClaims((prev) => {
      const next = new Set(prev);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  }

  async function handleDelete() {
    if (!id || !confirm(t('portal.fwaCaseDetail.confirmDelete'))) return;
    try {
      await deleteCase.mutateAsync(id);
      navigate('/fwa/fwa-cases');
    } catch {
      // Error handled by mutation
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !fwaCase) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/fwa/fwa-cases')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('portal.fwaCaseDetail.backToCases')}
        </Button>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : t('portal.fwaCaseDetail.loadError')}
        </div>
      </div>
    );
  }

  const statusCfg = FWA_CASE_STATUS_CONFIG[fwaCase.status];
  const entityLabel = ENTITY_TYPE_LABELS[fwaCase.entityType] ?? fwaCase.entityType;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate('/fwa/fwa-cases')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> {t('portal.fwaCaseDetail.backToCases')}
      </Button>

      <PageHeader
        title={t('portal.fwaCaseDetail.caseTitle', { code: fwaCase.caseCode })}
        subtitle={`${entityLabel} · ${fwaCase.entityName}`}
        action={
          <div className="flex gap-2">
            <Badge variant="secondary" className={statusCfg.className}>{statusCfg.label}</Badge>
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={deleteCase.isPending}>
              <Trash2 className="mr-2 h-4 w-4" /> {t('common.delete')}
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t('portal.fwaCaseDetail.overview')}</TabsTrigger>
          <TabsTrigger value="claims">{t('portal.fwaCaseDetail.linkedClaims', { count: fwaCase.linkedClaims.length })}</TabsTrigger>
          <TabsTrigger value="timeline">{t('portal.fwaCaseDetail.timeline', { count: fwaCase.actions.length })}</TabsTrigger>
          <TabsTrigger value="ai">{t('portal.fwaCaseDetail.aiAnalysis')}</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('portal.fwaCaseDetail.highestRiskScore')}</p>
                <p className="text-2xl font-bold">{fwaCase.highestRiskScore}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('portal.fwaCaseDetail.averageRiskScore')}</p>
                <p className="text-2xl font-bold">{fwaCase.avgRiskScore.toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('portal.fwaCaseDetail.totalFlaggedAmount')}</p>
                <p className="text-2xl font-bold">{formatCurrencyCompact(fwaCase.totalFlaggedAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{t('portal.fwaCaseDetail.linkedClaimsLabel')}</p>
                <p className="text-2xl font-bold">{fwaCase.linkedClaims.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Flag Summary */}
          {Object.keys(fwaCase.flagSummary).length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold">{t('portal.fwaCaseDetail.flagSummary')}</h3></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(fwaCase.flagSummary).map(([flag, count]) => (
                    <Badge key={flag} variant="secondary">
                      {flag}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Case Info */}
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">{t('portal.fwaCaseDetail.caseInformation')}</h3></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">{t('portal.fwaCaseDetail.entityType')}</dt>
                  <dd className="font-medium">{entityLabel}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('portal.fwaCaseDetail.entityName')}</dt>
                  <dd className="font-medium">{fwaCase.entityName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('portal.fwaCaseDetail.created')}</dt>
                  <dd className="font-medium">{formatDate(fwaCase.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('portal.fwaCaseDetail.lastUpdated')}</dt>
                  <dd className="font-medium">{formatDate(fwaCase.updatedAt)}</dd>
                </div>
                {fwaCase.closedAt && (
                  <div>
                    <dt className="text-muted-foreground">{t('portal.fwaCaseDetail.closed')}</dt>
                    <dd className="font-medium">{formatDate(fwaCase.closedAt)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* AI Quick Summary on Overview */}
          {fwaCase.aiSummary && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold">{t('portal.fwaCaseDetail.aiSummaryHeading')}</h3></CardHeader>
              <CardContent>
                <MarkdownRenderer content={fwaCase.aiSummary} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Linked Claims -- Enhanced with expandable flag details */}
        <TabsContent value="claims" className="mt-4">
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
                  <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCaseDetail.requested')}</th>
                  <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCaseDetail.covered')}</th>
                  <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.fwaCases.flags')}</th>
                  <th className="w-10 border-b bg-muted/50 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {fwaCase.linkedClaims.map((claim: FWACaseLinkedClaim) => {
                  const isExpanded = expandedClaims.has(claim.id);
                  const recCfg = FWA_RECOMMENDATION_CONFIG[claim.recommendation];
                  return (
                    <>
                      <tr
                        key={claim.id}
                        className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleClaimExpanded(claim.id)}
                      >
                        <td className="px-4 py-3 text-muted-foreground">
                          {claim.flags.length > 0 && (
                            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono">{claim.claimCode}</td>
                        <td className="px-4 py-3 text-sm">{claim.insuredName}</td>
                        <td className="px-4 py-3 text-sm">{claim.providerName ?? '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <Badge variant="secondary" className={cn('text-xs', RISK_LEVEL_CLASSES[claim.riskLevel])}>
                            {claim.riskLevel} ({claim.riskScore})
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {recCfg ? (
                            <Badge variant="secondary" className={recCfg.className}>{recCfg.label}</Badge>
                          ) : (
                            <span>{claim.recommendation}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrencyCompact(claim.requestedAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right">{formatCurrencyCompact(claim.coveredAmount)}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono">{claim.flags.length}</td>
                        <td className="px-4 py-3">
                          <button
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('portal.fwaCaseDetail.viewClaimDetail')}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/fwa/claims/${claim.id}`);
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && claim.flags.length > 0 && (
                        <tr key={`${claim.id}-flags`} className="border-b">
                          <td colSpan={10} className="bg-muted/30 px-6 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('portal.fwaCaseDetail.flagDetails')}</p>
                              <div className="grid gap-2">
                                {claim.flags.map((flag: FWAFlag, idx: number) => (
                                  <div key={idx} className="flex items-start gap-3 rounded-md bg-background p-3 text-sm">
                                    <Badge variant="secondary" className={cn('shrink-0 text-xs', SEVERITY_CLASSES[flag.severity])}>
                                      {flag.severity}
                                    </Badge>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{flag.title}</span>
                                        <Badge variant="outline" className="text-xs">{flag.category}</Badge>
                                      </div>
                                      {flag.description && (
                                        <p className="mt-1 text-muted-foreground">{flag.description}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Timeline -- Enhanced with icons, colored badges, vertical connector */}
        <TabsContent value="timeline" className="mt-4">
          {fwaCase.actions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('portal.fwaCaseDetail.noActions')}</p>
          ) : (
            <div className="relative pl-8">
              {/* Vertical line */}
              <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

              <div className="space-y-6">
                {fwaCase.actions.map((action: FWACaseAction, idx: number) => {
                  const actionClass = ACTION_TYPE_CLASSES[action.type];
                  const Icon = ACTION_TYPE_ICONS[action.type];
                  const actionLabel = ACTION_TYPE_LABELS[action.type];
                  return (
                    <div key={action.id} className="relative">
                      {/* Dot on the vertical line */}
                      <div className={cn(
                        'absolute -left-8 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background',
                        actionClass,
                      )}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="secondary" className={actionClass}>{actionLabel}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDateTime(action.createdAt)}</span>
                        </div>
                        <p className="text-sm">{action.content}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t('portal.fwaCaseDetail.by', { name: action.createdBy })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* AI Analysis -- Real content from aiSummary, aiPatterns, aiNextSteps */}
        <TabsContent value="ai" className="mt-4 space-y-6">
          {!fwaCase.aiSummary && !fwaCase.aiPatterns && (!fwaCase.aiNextSteps || fwaCase.aiNextSteps.length === 0) ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Brain className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="font-medium">{t('portal.fwaCaseDetail.noAiAnalysis')}</p>
                <p className="mt-1 text-sm">{t('portal.fwaCaseDetail.noAiAnalysisDescription')}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* AI Summary */}
              {fwaCase.aiSummary && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">{t('portal.fwaCaseDetail.caseAnalysisSummary')}</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MarkdownRenderer content={fwaCase.aiSummary} />
                  </CardContent>
                </Card>
              )}

              {/* AI Patterns */}
              {fwaCase.aiPatterns && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">{t('portal.fwaCaseDetail.detectedPatterns')}</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <MarkdownRenderer content={fwaCase.aiPatterns} />
                  </CardContent>
                </Card>
              )}

              {/* AI Next Steps */}
              {fwaCase.aiNextSteps && fwaCase.aiNextSteps.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">{t('portal.fwaCaseDetail.suggestedNextSteps')}</h3>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {fwaCase.aiNextSteps.map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {i + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
