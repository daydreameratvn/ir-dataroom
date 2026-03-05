import { useState } from 'react';
import { Stethoscope, AlertTriangle, ChevronDown, ChevronRight, Pill, Syringe, TestTube, BedDouble } from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { formatNumber } from '../utils/format';
import type { MedicalNecessityResult, MedicalNecessityItem, MedicalNecessityAttentionSummary } from '../types';

interface MedicalNecessityViewProps {
  data: MedicalNecessityResult | null;
}

// ─── Tier Styles ─────────────────────────────────────────────────────────────

const TIER_STYLES: Record<string, { labelKey: string; badge: string; bg: string; border: string; text: string }> = {
  clearly_necessary: {
    labelKey: 'portal.medicalNecessity.tier.clearlyNecessary',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  likely_necessary: {
    labelKey: 'portal.medicalNecessity.tier.likelyNecessary',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
  },
  questionable: {
    labelKey: 'portal.medicalNecessity.tier.questionable',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  not_necessary: {
    labelKey: 'portal.medicalNecessity.tier.notNecessary',
    badge: 'bg-red-100 text-red-800 border-red-300',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
  },
};

const DEFAULT_TIER_STYLE = {
  labelKey: 'portal.medicalNecessity.tier.unknown',
  badge: 'bg-gray-100 text-gray-700 border-gray-300',
  bg: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-700',
};

// ─── Item Type Config ────────────────────────────────────────────────────────

const DEFAULT_ITEM_TYPE = { labelKey: 'portal.medicalNecessity.itemType.other', className: 'bg-gray-100 text-gray-700', icon: Stethoscope };

const ITEM_TYPE_CONFIG: Record<string, { labelKey: string; className: string; icon: typeof Pill }> = {
  drug: { labelKey: 'portal.medicalNecessity.itemType.drug', className: 'bg-purple-100 text-purple-700', icon: Pill },
  procedure: { labelKey: 'portal.medicalNecessity.itemType.procedure', className: 'bg-blue-100 text-blue-700', icon: Syringe },
  diagnostic: { labelKey: 'portal.medicalNecessity.itemType.diagnostic', className: 'bg-cyan-100 text-cyan-700', icon: TestTube },
  los: { labelKey: 'portal.medicalNecessity.itemType.los', className: 'bg-indigo-100 text-indigo-700', icon: BedDouble },
  other: DEFAULT_ITEM_TYPE,
};

// ─── Flag Styles ─────────────────────────────────────────────────────────────

const FLAG_STYLES: Record<string, string> = {
  contraindicated: 'bg-red-100 text-red-700',
  extremely_over_price: 'bg-red-100 text-red-700',
  red_flag: 'bg-red-100 text-red-700',
  duplicate: 'bg-orange-100 text-orange-700',
  unnecessary: 'bg-amber-100 text-amber-700',
  unrelated_drug: 'bg-amber-100 text-amber-700',
};

// ─── Tier Sort Order (worst first) ───────────────────────────────────────────

const TIER_SORT_ORDER: Record<string, number> = {
  not_necessary: 0,
  questionable: 1,
  likely_necessary: 2,
  clearly_necessary: 3,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTierKey(tier: string): string {
  return tier.toLowerCase().replace(/\s+/g, '_');
}

function getTierStyle(tier: string) {
  return TIER_STYLES[getTierKey(tier)] ?? DEFAULT_TIER_STYLE;
}

function formatFlagLabel(flag: string): string {
  return flag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAttentionSummary(
  raw: MedicalNecessityResult['attention_summary'],
): MedicalNecessityAttentionSummary | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { needs_attention: true, flagged_count: 0, summary_text: raw };
  }
  if (typeof raw === 'object' && 'needs_attention' in raw) {
    return raw;
  }
  return null;
}

// ─── Derive tier from [OVERALL] verdict in finding ──────────────────────────

const OVERALL_VERDICT_RE = /\[OVERALL\]\s*(Clearly Necessary|Likely Necessary|Questionable|Not Necessary)/i;

function deriveTier(item: MedicalNecessityItem): string {
  const match = OVERALL_VERDICT_RE.exec(item.finding ?? '');
  if (match?.[1]) return match[1].toLowerCase().replace(/\s+/g, '_');
  return item.tier;
}

// ─── Item Row (expandable, stacked layout) ───────────────────────────────────

function ItemRow({ item }: { item: MedicalNecessityItem }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const effectiveTier = deriveTier(item);
  const itemTierStyle = getTierStyle(effectiveTier);
  const typeConfig = ITEM_TYPE_CONFIG[item.item_type] ?? DEFAULT_ITEM_TYPE;
  const TypeIcon = typeConfig.icon;
  const hasFlags = item.flags && item.flags.length > 0;
  const isWorst = getTierKey(effectiveTier) === 'not_necessary';

  return (
    <div
      className={cn(
        'border-b border-border/50 last:border-0',
        isWorst && 'bg-red-50/50',
        hasFlags && !isWorst && 'bg-amber-50/30',
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        {/* Row 1: name + amount */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-medium flex-1 min-w-0">{item.item_name}</span>
          <span className="text-sm tabular-nums text-muted-foreground shrink-0">
            {formatNumber(item.amount_claimed)}
          </span>
        </div>
        {/* Row 2: badges */}
        <div className="flex items-center gap-1.5 mt-1.5 ml-[22px] flex-wrap">
          <Badge variant="secondary" className={cn('text-[11px] gap-1 w-fit', typeConfig.className)}>
            <TypeIcon className="h-3 w-3" />
            {t(typeConfig.labelKey)}
          </Badge>
          <Badge variant="secondary" className={cn('text-[11px] border w-fit', itemTierStyle.badge)}>
            {t(itemTierStyle.labelKey)}
          </Badge>
          {hasFlags && item.flags!.map((flag) => (
            <Badge
              key={flag}
              variant="secondary"
              className={cn('text-[11px]', FLAG_STYLES[flag] ?? 'bg-gray-100 text-gray-700')}
            >
              {formatFlagLabel(flag)}
            </Badge>
          ))}
        </div>
      </button>
      {isOpen && (
        <div className="px-3 pb-3 ml-[22px] space-y-2">
          {item.reference_range && (
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">{t('portal.medicalNecessity.reference')}</span>
              <span className="text-sm text-muted-foreground">{item.reference_range}</span>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">{t('portal.medicalNecessity.finding')}</span>
            <p className="text-sm text-muted-foreground">{item.finding}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MedicalNecessityView({ data }: MedicalNecessityViewProps) {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Stethoscope className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">{t('portal.medicalNecessity.noData')}</p>
      </div>
    );
  }

  const tierStyle = getTierStyle(data.overall_tier);
  const attention = parseAttentionSummary(data.attention_summary);
  const items = (data.adjustedItems ?? []) as MedicalNecessityItem[];

  // Sort items worst-first (using finding-derived tier for consistency)
  const sortedItems = [...items].sort((a, b) => {
    const aOrder = TIER_SORT_ORDER[getTierKey(deriveTier(a))] ?? 99;
    const bOrder = TIER_SORT_ORDER[getTierKey(deriveTier(b))] ?? 99;
    return aOrder - bOrder;
  });

  // Tier counts for stats (using finding-derived tier)
  const tierCounts = items.reduce<Record<string, number>>((acc, item) => {
    const key = getTierKey(deriveTier(item));
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-2">
      {/* Section 1 — Compact Hero + Stats */}
      <div className={cn('rounded-lg border-2 px-4 py-3', tierStyle.border, tierStyle.bg)}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className={cn('text-sm px-3 py-0.5 font-bold border', tierStyle.badge)}
            >
              {t(tierStyle.labelKey)}
            </Badge>
            {items.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {(['clearly_necessary', 'likely_necessary', 'questionable', 'not_necessary'] as const).map((tier) => {
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

      {/* Section 2 — Attention Alert (compact, severity-grouped) */}
      {attention?.needs_attention && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-amber-800">{t('portal.medicalNecessity.attention')}</span>
          <div className="flex items-center gap-1.5">
            {(attention.not_necessary_count ?? 0) > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs">
                {t('portal.medicalNecessity.notNecessaryCount', { count: attention.not_necessary_count })}
                {attention.not_necessary_amount != null && ` (${formatNumber(attention.not_necessary_amount)})`}
              </Badge>
            )}
            {(attention.questionable_count ?? 0) > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                {t('portal.medicalNecessity.questionableCount', { count: attention.questionable_count })}
                {attention.questionable_amount != null && ` (${formatNumber(attention.questionable_amount)})`}
              </Badge>
            )}
            {!(attention.not_necessary_count || attention.questionable_count) && attention.flagged_count > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                {t('portal.medicalNecessity.flaggedCount', { count: attention.flagged_count })}
              </Badge>
            )}
          </div>
          <p className="text-xs text-amber-700 flex-1 min-w-0">{attention.summary_text}</p>
        </div>
      )}

      {/* Section 3 — Items (expandable rows) */}
      {sortedItems.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">
              {t('portal.medicalNecessity.reviewedItems')}
              <span className="text-muted-foreground font-normal ml-2">({sortedItems.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {sortedItems.map((item, i) => (
              <ItemRow key={i} item={item} />
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
