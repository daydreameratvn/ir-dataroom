import { useNavigate } from 'react-router-dom';
import { ShieldX, AlertTriangle, FileText, Loader2, ExternalLink, Flag, Link2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { FWAResultData, ImageForensicsResult, FWAClassificationType } from '../types';
import { FWA_CLASSIFICATION_CONFIG } from '../types';
import { useClaimFWACaseLink, useCreateFWACase, useFlagClaimForReview } from '../hooks/useFWACases';
import ImageForensicsSection from './ImageForensicsSection';

interface FWAViewProps {
  data: FWAResultData | null;
  claimId?: string;
  imageForensicsData?: ImageForensicsResult | null;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const DEFAULT_RISK_STYLE = { className: 'bg-gray-100 text-gray-800', ringColor: 'ring-gray-400', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' };

const RISK_LEVEL_STYLES: Record<string, { className: string; ringColor: string; bg: string; border: string; text: string }> = {
  LOW: { className: 'bg-emerald-100 text-emerald-800', ringColor: 'ring-emerald-400', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  MEDIUM: { className: 'bg-amber-100 text-amber-800', ringColor: 'ring-amber-400', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  HIGH: { className: 'bg-orange-100 text-orange-800', ringColor: 'ring-orange-400', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  CRITICAL: { className: 'bg-red-100 text-red-800', ringColor: 'ring-red-400', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
};

const DEFAULT_REC_STYLE = { className: 'bg-gray-100 text-gray-700' };

const RECOMMENDATION_STYLES: Record<string, { className: string }> = {
  CLEAR: { className: 'bg-emerald-100 text-emerald-700' },
  REVIEW: { className: 'bg-amber-100 text-amber-700' },
  INVESTIGATE: { className: 'bg-red-100 text-red-700' },
};

const DEFAULT_SEV_STYLE = { className: 'bg-gray-100 text-gray-700', text: 'text-gray-700' };

const SEVERITY_STYLES: Record<string, { className: string; text: string }> = {
  LOW: { className: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
  MEDIUM: { className: 'bg-amber-100 text-amber-700', text: 'text-amber-700' },
  HIGH: { className: 'bg-red-100 text-red-700', text: 'text-red-700' },
};

function getRiskScoreColor(score: number): string {
  if (score <= 30) return 'text-emerald-600';
  if (score <= 60) return 'text-amber-600';
  if (score <= 80) return 'text-orange-600';
  return 'text-red-600';
}

// ─── Actions Bar ─────────────────────────────────────────────────────────────

function FWAActionsBar({ claimId }: { claimId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: linkData, isLoading } = useClaimFWACaseLink(claimId);
  const createCase = useCreateFWACase();
  const flagForReview = useFlagClaimForReview();

  async function handleCreateCase() {
    try {
      const result = await createCase.mutateAsync({
        entityType: 'SINGLE_CLAIM',
        entityId: claimId,
        claimIds: [claimId],
      });
      navigate(`/fwa/fwa-cases/${result.id}`);
    } catch { /* error handled by mutation */ }
  }

  async function handleFlagForReview() {
    try {
      await flagForReview.mutateAsync(claimId);
    } catch { /* error handled by mutation */ }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{t('portal.fwaTab.checkingCase')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
      {linkData?.hasCase ? (
        <>
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium">{t('portal.fwaTab.linkedToCase')}</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              {linkData.caseStatus}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/fwa/fwa-cases/${linkData.caseId}`)}
          >
            <ExternalLink className="mr-2 h-3.5 w-3.5" />
            {t('portal.fwaTab.viewCase')}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="default"
            size="sm"
            onClick={handleCreateCase}
            disabled={createCase.isPending}
          >
            {createCase.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-3.5 w-3.5" />
            )}
            {t('portal.fwaTab.createCase')}
          </Button>
        </>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleFlagForReview}
        disabled={flagForReview.isPending}
      >
        {flagForReview.isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Flag className="mr-2 h-3.5 w-3.5" />
        )}
        {t('portal.fwaTab.sendToFlagged')}
      </Button>
      {flagForReview.isSuccess && (
        <span className="text-xs text-emerald-600">{t('portal.fwaTab.flaggedSuccess')}</span>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FWAView({ data, claimId, imageForensicsData }: FWAViewProps) {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ShieldX className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">{t('portal.fwaTab.noData')}</p>
      </div>
    );
  }

  const riskKey = data.riskLevel.toUpperCase();
  const riskLevelStyle = RISK_LEVEL_STYLES[riskKey] ?? DEFAULT_RISK_STYLE;
  const recStyle = RECOMMENDATION_STYLES[data.recommendation.toUpperCase()] ?? DEFAULT_REC_STYLE;
  const isHighRisk = data.riskScore > 60;

  // Group flags by category
  const flagsByCategory = data.flags.reduce<Record<string, typeof data.flags>>(
    (acc, flag) => {
      const cat = flag.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(flag);
      return acc;
    },
    {},
  );

  // Severity counts
  const sevCounts = data.flags.reduce<Record<string, number>>((acc, flag) => {
    const key = flag.severity.toUpperCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {/* Section 1 — Hero: Risk Score + Level + Recommendation */}
      <Card className={cn('border-2', riskLevelStyle.border, riskLevelStyle.bg)}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            {/* Score circle */}
            <div
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-full ring-4',
                riskLevelStyle.ringColor,
              )}
            >
              <span
                className={cn(
                  'text-3xl font-bold tabular-nums',
                  getRiskScoreColor(data.riskScore),
                )}
              >
                {data.riskScore}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{t('portal.fwaTab.riskLevel')}</span>
                <Badge
                  variant="secondary"
                  className={cn('font-bold', riskLevelStyle.className)}
                >
                  {riskKey}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{t('portal.fwaTab.recommendation')}</span>
                <Badge
                  variant="secondary"
                  className={cn('font-bold', recStyle.className)}
                >
                  {data.recommendation.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-sm text-muted-foreground">
              {t('portal.fwaTab.flagsDetected', { count: data.flags.length })}
            </p>
            {data.completedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(data.completedAt).toLocaleString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions Bar — case linking + flagging */}
      {claimId && <FWAActionsBar claimId={claimId} />}

      {/* Section 2 — High Risk Alert */}
      {isHighRisk && (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <span className="text-sm font-semibold text-red-800">{t('portal.fwaTab.highRiskTitle')}</span>
            <p className="text-sm text-red-700 mt-0.5">
              {t('portal.fwaTab.highRiskDesc', { score: data.riskScore, count: data.flags.length })}
            </p>
          </div>
        </div>
      )}

      {/* Section 3 — Severity Stats Row */}
      {data.flags.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {(['LOW', 'MEDIUM', 'HIGH'] as const).map((sev) => {
            const style = SEVERITY_STYLES[sev] ?? DEFAULT_SEV_STYLE;
            const count = sevCounts[sev] ?? 0;
            return (
              <Card key={sev}>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    {t('portal.fwaTab.severity', { level: sev })}
                  </p>
                  <p className={cn('text-2xl font-bold tabular-nums', style.text)}>
                    {count}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Section 4 — Flags grouped by category */}
      {data.flags.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">{t('portal.fwaTab.flags')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-2.5">
            {Object.entries(flagsByCategory).map(([category, flags]) => (
              <div key={category}>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </h4>
                <div className="space-y-2">
                  {flags.map((flag, i) => {
                    const sevStyle =
                      SEVERITY_STYLES[flag.severity.toUpperCase()] ?? DEFAULT_SEV_STYLE;
                    const isHighSev = flag.severity.toUpperCase() === 'HIGH';
                    return (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border p-3',
                          isHighSev && 'bg-red-50/50 border-red-200',
                        )}
                      >
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-sm font-medium">{flag.title}</span>
                          <Badge
                            variant="secondary"
                            className={cn('text-xs', sevStyle.className)}
                          >
                            {flag.severity.toUpperCase()}
                          </Badge>
                          {flag.classification && FWA_CLASSIFICATION_CONFIG[flag.classification as FWAClassificationType] && (
                            <Badge
                              variant="secondary"
                              className={cn('text-xs', FWA_CLASSIFICATION_CONFIG[flag.classification as FWAClassificationType].className)}
                            >
                              {FWA_CLASSIFICATION_CONFIG[flag.classification as FWAClassificationType].label}
                            </Badge>
                          )}
                        </div>
                        {flag.description && (
                          <p className="text-sm text-muted-foreground">
                            {flag.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Section 5 — Image Forensics */}
      <ImageForensicsSection data={imageForensicsData} />

      {/* Section 6 — Summary Callout */}
      {data.summary && (
        <div className="flex items-start gap-3 rounded-lg border p-4 bg-muted/30">
          <FileText className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <span className="text-sm font-semibold mb-1 block">{t('portal.fwaTab.summary')}</span>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.summary}</p>
          </div>
        </div>
      )}

    </div>
  );
}
