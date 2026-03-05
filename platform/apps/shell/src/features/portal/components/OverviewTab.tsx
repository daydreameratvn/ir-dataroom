import { useMemo } from 'react';
import { Badge } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { CLAIM_STATUS_CONFIG, CLAIM_TYPE_CONFIG } from '../types';
import { formatDate, formatCurrency } from '../utils/format';
import type { PortalClaim } from '../types';
import ProcessTimeline from './ProcessTimeline';

interface OverviewTabProps {
  claim: PortalClaim;
}

/** Coerce string | number | null to number | null for formatCurrency. */
function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? null : num;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-border/50 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{children}</dd>
    </div>
  );
}

/** Map lowercase DB statuses to the uppercase keys used in CLAIM_STATUS_CONFIG */
const STATUS_MAP: Record<string, string> = {
  submitted: 'SUBMITTED',
  under_review: 'IN_REVIEW',
  ai_processing: 'PROCESSING',
  awaiting_approval: 'AWAITING_APPROVAL',
  adjudicated: 'SUCCESS',
  approved: 'APPROVED',
  partially_approved: 'APPROVED',
  denied: 'REJECTED',
  appealed: 'IN_REVIEW',
  settled: 'SUCCESS',
  closed: 'SUCCESS',
};

export default function OverviewTab({ claim }: OverviewTabProps) {
  const { t } = useTranslation();
  const mappedStatus = STATUS_MAP[claim.status] ?? claim.status;
  const statusCfg = CLAIM_STATUS_CONFIG[mappedStatus];
  const statusKey = mappedStatus.toLowerCase();
  const typeCfg = claim.type ? CLAIM_TYPE_CONFIG[claim.type] : null;
  const currency = claim.currency ?? 'THB';

  return (
    <div className="space-y-6">
      {/* Claim Information */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('portal.overview.claimInfo')}
        </h3>
        <dl className="rounded-lg border p-4">
          <InfoRow label={t('portal.overview.claimNumber')}>
            <span className="font-mono">{claim.claimNumber}</span>
          </InfoRow>
          <InfoRow label={t('portal.overview.status')}>
            {statusCfg ? (
              <Badge variant="secondary" className={statusCfg.className}>{t(`portal.claimStatus.${statusKey}`, statusCfg.label)}</Badge>
            ) : (
              <Badge variant="secondary">{claim.status}</Badge>
            )}
          </InfoRow>
          {claim.type && (
            <InfoRow label={t('portal.overview.type')}>
              {typeCfg ? (
                <Badge variant="secondary" className={typeCfg.className}>{t(`portal.claimType.${claim.type}`, typeCfg.label)}</Badge>
              ) : (
                <span>{claim.type}</span>
              )}
            </InfoRow>
          )}
          <InfoRow label={t('portal.overview.claimant')}>{claim.insuredName ?? claim.insuredPerson?.name ?? '—'}</InfoRow>
          <InfoRow label={t('portal.overview.provider')}>{claim.providerName ?? '—'}</InfoRow>
          {claim.dateOfService && (
            <InfoRow label={t('portal.overview.dateOfService')}>{formatDate(claim.dateOfService)}</InfoRow>
          )}
          <InfoRow label={t('portal.overview.created')}>{formatDate(claim.createdAt)}</InfoRow>
        </dl>
      </section>

      {/* Financial Summary */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {t('portal.overview.financialSummary')}
        </h3>
        <dl className="rounded-lg border p-4">
          <InfoRow label={t('portal.overview.requestedAmount')}>{formatCurrency(toNumber(claim.totalRequestedAmount), currency)}</InfoRow>
          <InfoRow label={t('portal.overview.coveredAmount')}>{formatCurrency(toNumber(claim.totalCoveredAmount), currency)}</InfoRow>
          <InfoRow label={t('portal.overview.paidAmount')}>{formatCurrency(toNumber(claim.totalPaidAmount), currency)}</InfoRow>
        </dl>
      </section>

      {/* AI Analysis — parse aiSummary JSON for structured display */}
      <AIAnalysisSection claim={claim} />

      {/* Process Timeline */}
      {claim.processes.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('portal.overview.processTimeline')}
          </h3>
          <div className="rounded-lg border p-4">
            <ProcessTimeline processes={claim.processes} />
          </div>
        </section>
      )}
    </div>
  );
}

const DECISION_STYLES: Record<string, string> = {
  approve: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  deny: 'bg-red-100 text-red-800 border-red-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  review: 'bg-blue-100 text-blue-800 border-blue-200',
};

function AIAnalysisSection({ claim }: { claim: PortalClaim }) {
  const { t } = useTranslation();

  const parsed = useMemo(() => {
    if (!claim.aiSummary) return null;
    try {
      return JSON.parse(claim.aiSummary) as Record<string, unknown>;
    } catch {
      // Legacy plain-text aiSummary — return as-is
      return null;
    }
  }, [claim.aiSummary]);

  // Extract structured recommendation from assessment namespace
  const recommendation = useMemo(() => {
    if (!parsed) return null;
    const assessment = parsed.assessment as Record<string, unknown> | undefined;
    const auto = (assessment?.automationResult ?? parsed.automationResult) as
      | { decision?: string; confidence?: number; reasoning?: string }
      | undefined;
    if (!auto) return null;
    return auto;
  }, [parsed]);

  // Extract treatment summary from extraction namespace
  const treatmentSummary = useMemo(() => {
    if (!parsed) return null;
    const extraction = parsed.extraction as Record<string, unknown> | undefined;
    return (extraction?.treatmentSummary ?? parsed.treatmentSummary) as string | undefined;
  }, [parsed]);

  const hasContent =
    claim.aiSummary || claim.aiRecommendation || claim.denialReason;

  if (!hasContent) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t('portal.overview.aiAnalysis')}
      </h3>
      <div className="rounded-lg border p-4 space-y-3">
        {/* Structured recommendation from assessment agent */}
        {recommendation && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">{t('portal.overview.recommendation')}</p>
              {recommendation.decision && (
                <Badge
                  variant="secondary"
                  className={DECISION_STYLES[recommendation.decision] ?? 'bg-gray-100 text-gray-800'}
                >
                  {recommendation.decision.toUpperCase()}
                </Badge>
              )}
              {recommendation.confidence != null && (
                <span className="text-xs text-muted-foreground">
                  {t('portal.overview.confidence', { percent: Math.round(recommendation.confidence * 100) })}
                </span>
              )}
            </div>
            {recommendation.reasoning && (
              <p className="text-sm">{recommendation.reasoning}</p>
            )}
          </div>
        )}

        {/* Treatment summary from extraction */}
        {treatmentSummary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{t('portal.overview.treatmentSummary')}</p>
            <p className="text-sm">{treatmentSummary}</p>
          </div>
        )}

        {/* Fallback: plain-text aiSummary (legacy or unparseable) */}
        {!parsed && claim.aiSummary && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{t('portal.overview.summary')}</p>
            <p className="text-sm">{claim.aiSummary}</p>
          </div>
        )}

        {/* aiRecommendation field (separate from aiSummary JSON) */}
        {claim.aiRecommendation && !recommendation && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{t('portal.overview.recommendation')}</p>
            <p className="text-sm">{claim.aiRecommendation}</p>
          </div>
        )}

        {/* Denial reason */}
        {claim.denialReason && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{t('portal.overview.denialReason')}</p>
            <p className="text-sm text-red-600">{claim.denialReason}</p>
          </div>
        )}
      </div>
    </section>
  );
}
