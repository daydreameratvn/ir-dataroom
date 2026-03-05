import { useState } from 'react';
import { ShieldAlert, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { PreExistingResult, PreExistingFinding } from '../types';

interface PreExistingViewProps {
  data: PreExistingResult | null;
}

// ─── Tier Styles ─────────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, { labelKey: string; badge: string; bg: string; border: string; text: string }> = {
  confirmed: {
    labelKey: 'portal.preExisting.tier.confirmed',
    badge: 'bg-red-100 text-red-800 border-red-300',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
  },
  suspected: {
    labelKey: 'portal.preExisting.tier.suspected',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  unlikely: {
    labelKey: 'portal.preExisting.tier.unlikely',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
};

const DEFAULT_TIER_STYLE = {
  labelKey: 'portal.preExisting.tier.unknown',
  badge: 'bg-gray-100 text-gray-700 border-gray-300',
  bg: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-700',
};

// ─── Risk Styles (overall non-disclosure) ────────────────────────────────────

const RISK_STYLES: Record<string, { labelKey: string; badge: string; border: string; bg: string }> = {
  none: {
    labelKey: 'portal.preExisting.risk.none',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
  },
  low: {
    labelKey: 'portal.preExisting.risk.low',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
  },
  medium: {
    labelKey: 'portal.preExisting.risk.medium',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
  },
  high: {
    labelKey: 'portal.preExisting.risk.high',
    badge: 'bg-red-100 text-red-800 border-red-300',
    border: 'border-red-200',
    bg: 'bg-red-50',
  },
};

const DEFAULT_RISK_STYLE = {
  labelKey: 'portal.preExisting.risk.unknown',
  badge: 'bg-gray-100 text-gray-700 border-gray-300',
  border: 'border-gray-200',
  bg: 'bg-gray-50',
};

// ─── Tier Sort Order (worst first) ──────────────────────────────────────────

const TIER_SORT_ORDER: Record<string, number> = {
  confirmed: 0,
  suspected: 1,
  unlikely: 2,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRiskStyle(level: string) {
  const normalized = level.toLowerCase().replace(/[\s_-]+/g, '');
  for (const [key, style] of Object.entries(RISK_STYLES)) {
    if (normalized.includes(key) && style) return style;
  }
  return DEFAULT_RISK_STYLE;
}

function getTierStyle(tier: string) {
  const normalized = tier.toLowerCase().replace(/[\s_-]+/g, '');
  for (const [key, style] of Object.entries(TIER_STYLES)) {
    if (normalized.includes(key) && style) return style;
  }
  return DEFAULT_TIER_STYLE;
}

// ─── Finding Row (expandable) ───────────────────────────────────────────────

function FindingRow({ finding }: { finding: PreExistingFinding }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const tierKey = finding.assessmentTier ?? (finding as Record<string, unknown>).risk_level as string ?? '';
  const tierStyle = getTierStyle(tierKey);
  const isConfirmed = tierKey.toLowerCase() === 'confirmed';
  const evidenceItems = Array.isArray(finding.evidence) ? finding.evidence : [];
  const evidenceDescriptions = evidenceItems
    .filter((e) => typeof e === 'object' && e !== null && typeof e.description === 'string')
    .map((e) => e.description);

  return (
    <div
      className={cn(
        'border-b border-border/50 last:border-0',
        isConfirmed && 'bg-red-50/50',
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="grid grid-cols-[20px_1fr_100px_120px] items-center gap-x-2 w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">
            {finding.conditionName || (finding as Record<string, unknown>).condition as string || '—'}
          </span>
          {finding.category && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-600 shrink-0">
              {finding.category}
            </Badge>
          )}
        </div>
        <Badge variant="secondary" className={cn('text-xs border w-fit', tierStyle.badge)}>
          {t(tierStyle.labelKey)}
        </Badge>
        <div className="justify-self-end">
          {finding.isWithinWaitingPeriod != null ? (
            <Badge
              variant="secondary"
              className={cn(
                'text-xs',
                finding.isWithinWaitingPeriod
                  ? 'bg-red-100 text-red-700'
                  : 'bg-emerald-100 text-emerald-700',
              )}
            >
              {finding.isWithinWaitingPeriod ? t('portal.preExisting.inWaiting') : t('portal.preExisting.clear')}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pl-[28px] space-y-2">
          {finding.reasoning && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">{t('portal.preExisting.reasoning')}</span>
              <p className="text-xs text-muted-foreground">{finding.reasoning}</p>
            </div>
          )}
          {evidenceDescriptions.length > 0 && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">{t('portal.preExisting.evidence')}</span>
              <div className="space-y-0.5">
                {evidenceDescriptions.map((desc, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{desc}</p>
                ))}
              </div>
            </div>
          )}
          {typeof finding.evidence === 'string' && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">{t('portal.preExisting.evidence')}</span>
              <p className="text-xs text-muted-foreground">{finding.evidence}</p>
            </div>
          )}
          {finding.icdCodes && finding.icdCodes.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">{t('portal.preExisting.icd')}</span>
              <div className="flex gap-1">
                {finding.icdCodes.map((code) => (
                  <span key={code} className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-muted-foreground">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PreExistingView({ data }: PreExistingViewProps) {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ShieldAlert className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">{t('portal.preExisting.noData')}</p>
      </div>
    );
  }

  const riskStyle = getRiskStyle(data.overallNonDisclosureRisk);
  const findings = (data.findings ?? []) as PreExistingFinding[];
  const riskLevel = data.overallNonDisclosureRisk?.toLowerCase() ?? '';
  const isHighRisk = riskLevel.includes('high');

  // Count findings by assessment tier
  const tierCounts = findings.reduce<Record<string, number>>((acc, f) => {
    const key = (f.assessmentTier ?? f.risk_level ?? 'unknown').toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Sort findings worst-first
  const sortedFindings = [...findings].sort((a, b) => {
    const aKey = (a.assessmentTier ?? (a as Record<string, unknown>).risk_level as string ?? '').toLowerCase();
    const bKey = (b.assessmentTier ?? (b as Record<string, unknown>).risk_level as string ?? '').toLowerCase();
    return (TIER_SORT_ORDER[aKey] ?? 99) - (TIER_SORT_ORDER[bKey] ?? 99);
  });

  return (
    <div className="space-y-2">
      {/* Section 1 — Compact Hero + Stats */}
      <div className={cn('rounded-lg border-2 px-4 py-3', riskStyle.border, riskStyle.bg)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className={cn('text-sm px-3 py-0.5 font-bold border', riskStyle.badge)}
            >
              {t(riskStyle.labelKey)}
            </Badge>
            {findings.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {(['confirmed', 'suspected', 'unlikely'] as const).map((tier) => {
                  const count = tierCounts[tier] ?? 0;
                  if (count === 0) return null;
                  const s = TIER_STYLES[tier] ?? DEFAULT_TIER_STYLE;
                  return (
                    <span key={tier} className={cn('font-semibold', s.text)}>
                      {count} {t(s.labelKey)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {data.completedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(data.completedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Section 2 — High Risk Alert (compact) */}
      {isHighRisk && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm font-semibold text-red-800">
            {t('portal.preExisting.highRiskAlert')}
          </p>
        </div>
      )}

      {/* Section 3 — Findings (expandable rows) */}
      {sortedFindings.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">
              {t('portal.preExisting.findings')}
              <span className="text-muted-foreground font-normal ml-2">({sortedFindings.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="grid grid-cols-[20px_1fr_100px_120px] items-center gap-x-2 px-3 pb-2 border-b text-xs font-medium text-muted-foreground">
              <span />
              <span>{t('portal.preExisting.condition')}</span>
              <span>{t('portal.preExisting.assessment')}</span>
              <span className="text-right">{t('portal.preExisting.waitingPeriod')}</span>
            </div>
            {sortedFindings.map((finding, i) => (
              <FindingRow key={i} finding={finding} />
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
