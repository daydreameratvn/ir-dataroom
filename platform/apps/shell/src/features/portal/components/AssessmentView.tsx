import { Check, X, ClipboardCheck, ChevronDown, ChevronRight, Loader2, Pencil } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { Badge, Card, CardHeader, CardTitle, CardContent, Button, cn } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { formatNumber } from '../utils/format';
import { saveExpenses, saveBenefitGrouping } from '../api';
import type { AssessmentResult, ExpenseItem, BenefitGroup } from '../types';

interface AssessmentViewProps {
  data: AssessmentResult | null;
  claimId?: string;
  treatmentType?: 'INPATIENT' | 'OUTPATIENT' | 'DENTAL' | null;
  onSaved?: () => void;
}

// ─── Benefit Hierarchy (IA Schema) ──────────────────────────────────────────

// Codes unique to one parent — used for auto-detection when treatmentType is unavailable
const IP_ONLY_CODES = new Set([
  'room_and_board', 'icu_iccu', 'physician_visit', 'surgery_fee',
  'hospital_supplies_and_services', 'ambulance_fee', 'implant_and_prosthesis_fee',
  'lodger_fee', 'rehabilitation',
]);
const OP_ONLY_CODES = new Set([
  'general_consultation', 'medication', 'lab_diagnostic', 'one_day_surgery',
  'physiotherapy', 'dental', 'preventive_care', 'medical_supplies', 'miscellaneous',
]);
// Codes that appear under both IP and OP — resolved by treatmentType or co-occurring codes
const SHARED_CODES = new Set([
  'emergency_treatment', 'cancer_care', 'dialysis', 'transplant', 'maternity', 'mental_health',
]);

// Parent label keys for i18n lookup
const PARENT_LABEL_KEYS: Record<string, string> = {
  INPATIENT: 'portal.assessment.parentLabels.IP',
  OUTPATIENT: 'portal.assessment.parentLabels.OP',
  DENTAL: 'portal.assessment.parentLabels.DENTAL',
  OTHER: 'portal.assessment.parentLabels.OTHER',
};

function resolveParentType(
  code: string,
  treatmentType: string | null | undefined,
  hasIpCodes: boolean,
): string {
  if (IP_ONLY_CODES.has(code)) return 'INPATIENT';
  if (OP_ONLY_CODES.has(code)) return 'OUTPATIENT';
  if (SHARED_CODES.has(code)) {
    if (treatmentType === 'INPATIENT') return 'INPATIENT';
    if (treatmentType === 'OUTPATIENT') return 'OUTPATIENT';
    if (treatmentType === 'DENTAL') return 'DENTAL';
    // Fallback: infer from other codes present
    return hasIpCodes ? 'INPATIENT' : 'OUTPATIENT';
  }
  // Unknown code — group by treatment type or "other"
  if (treatmentType) return treatmentType;
  return hasIpCodes ? 'INPATIENT' : 'OUTPATIENT';
}

interface ParentBenefitGroup {
  parentType: string;
  totalAmount: number;
  totalItems: number;
  children: BenefitGroup[];
}

function groupByParentType(
  groups: BenefitGroup[],
  treatmentType: string | null | undefined,
): ParentBenefitGroup[] {
  const hasIpCodes = groups.some((g) => IP_ONLY_CODES.has(g.benefitCode));

  const parentMap = new Map<string, ParentBenefitGroup>();
  // Maintain insertion order based on first occurrence
  const parentOrder: string[] = [];

  for (const group of groups) {
    const parentType = resolveParentType(group.benefitCode, treatmentType, hasIpCodes);
    let parent = parentMap.get(parentType);
    if (!parent) {
      parent = {
        parentType,
        totalAmount: 0,
        totalItems: 0,
        children: [],
      };
      parentMap.set(parentType, parent);
      parentOrder.push(parentType);
    }
    parent.children.push(group);
    parent.totalAmount += group.totalAmount;
    parent.totalItems += group.itemCount;
  }

  return parentOrder.map((pt) => parentMap.get(pt)!);
}

// ─── Recommendation Styles ──────────────────────────────────────────────────

const RECOMMENDATION_STYLES: Record<string, { badge: string; bg: string; border: string; text: string }> = {
  APPROVE: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  REVIEW: {
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
  },
  REJECT: {
    badge: 'bg-red-100 text-red-800 border-red-300',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
  },
};

const DEFAULT_REC_STYLE = {
  badge: 'bg-gray-100 text-gray-700 border-gray-300',
  bg: 'bg-gray-50',
  border: 'border-gray-200',
  text: 'text-gray-700',
};

// Recommendation label keys for i18n lookup
const RECOMMENDATION_LABEL_KEYS: Record<string, string> = {
  APPROVE: 'portal.assessment.recommend.approve',
  REVIEW: 'portal.assessment.recommend.review',
  REJECT: 'portal.assessment.recommend.reject',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatConfidence(value: number): number {
  // Confidence may arrive as 0–1 decimal or 0–100 integer
  return Math.round(value > 1 ? value : value * 100);
}

// ─── Benefit Group Row (expandable, optionally editable) ─────────────────────

interface BenefitGroupRowProps {
  group: BenefitGroup;
  editing?: boolean;
  benefitOptions?: Array<{ code: string; name: string }>;
  editedItems?: Set<string>;
  onReassign?: (itemId: string, targetCode: string) => void;
}

function BenefitGroupRow({ group, editing, benefitOptions, editedItems, onReassign }: BenefitGroupRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono font-medium shrink-0">
          {group.benefitCode}
        </span>
        <span className="text-sm font-medium min-w-0 truncate flex-1">{group.benefitName}</span>
        <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs shrink-0">
          {group.itemCount}
        </Badge>
        <span className="text-sm font-semibold tabular-nums shrink-0">
          {formatNumber(group.totalAmount)}
        </span>
      </button>
      {isOpen && group.items.length > 0 && (
        <div className="px-3 pb-2.5 pl-[28px]">
          {group.items.map((item) => {
            const isDirty = editedItems?.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-center justify-between gap-2 py-1 text-xs border-b border-border/30 last:border-0',
                  isDirty && 'border-l-2 border-l-amber-400 pl-1.5',
                )}
              >
                <span className="text-muted-foreground min-w-0 truncate flex-1">{item.name}</span>
                {editing && benefitOptions && onReassign ? (
                  <select
                    className="text-xs bg-background border border-border rounded px-1.5 py-0.5 focus:border-primary focus:outline-none shrink-0"
                    value={group.benefitCode}
                    onChange={(e) => onReassign(item.id, e.target.value)}
                  >
                    {benefitOptions.map((opt) => (
                      <option key={opt.code} value={opt.code}>{opt.code} — {opt.name}</option>
                    ))}
                  </select>
                ) : null}
                <span className="tabular-nums shrink-0">{formatNumber(item.amount)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Parent Benefit Section (collapsible, groups child benefits) ─────────────

interface ParentBenefitSectionProps {
  parent: ParentBenefitGroup;
  parentLabel: string;
  editing?: boolean;
  benefitOptions?: Array<{ code: string; name: string }>;
  editedItems?: Set<string>;
  onReassign?: (itemId: string, targetCode: string) => void;
}

function ParentBenefitSection({ parent, parentLabel, editing, benefitOptions, editedItems, onReassign }: ParentBenefitSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border-b border-border last:border-0">
      {/* Parent header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-semibold flex-1">{parentLabel}</span>
        <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs shrink-0">
          {parent.totalItems}
        </Badge>
        <span className="text-sm font-bold tabular-nums shrink-0">
          {formatNumber(parent.totalAmount)}
        </span>
      </button>
      {/* Child benefit groups */}
      {isOpen && (
        <div className="pl-3">
          {parent.children.map((group) => (
            <BenefitGroupRow
              key={group.benefitCode}
              group={group}
              editing={editing}
              benefitOptions={benefitOptions}
              editedItems={editedItems}
              onReassign={onReassign}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AssessmentView({ data, claimId, treatmentType, onSaved }: AssessmentViewProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Map<string, Partial<ExpenseItem>>>(new Map());
  const [saving, setSaving] = useState(false);

  const [benefitEditing, setBenefitEditing] = useState(false);
  // Map<itemId, targetBenefitCode> — tracks which items have been reassigned
  const [benefitEdits, setBenefitEdits] = useState<Map<string, string>>(new Map());
  const [benefitSaving, setBenefitSaving] = useState(false);

  const hasEdits = edits.size > 0;
  const hasBenefitEdits = benefitEdits.size > 0;

  // Build the effective items list (original + overrides)
  const effectiveItems = useMemo(() => {
    if (!data?.expenses?.items) return [];
    return data.expenses.items.map((item) => {
      const edit = edits.get(item.id);
      if (!edit) return item;
      return { ...item, ...edit };
    });
  }, [data?.expenses?.items, edits]);

  // Recalculate coverage stats from effective items
  const effectiveCoverage = useMemo(() => {
    if (!data?.coverageAnalysis) return data?.coverageAnalysis ?? null;
    if (!hasEdits) return data.coverageAnalysis;

    let totalCovered = 0;
    let totalUncovered = 0;
    let coveredCount = 0;
    let uncoveredCount = 0;

    for (const item of effectiveItems) {
      const amount = item.payable_amount ?? item.total_amount;
      if (item.is_covered) {
        totalCovered += amount;
        coveredCount++;
      } else {
        totalUncovered += amount;
        uncoveredCount++;
      }
    }

    return {
      totalRequested: data.coverageAnalysis.totalRequested,
      totalCovered,
      totalUncovered,
      coveredItemCount: coveredCount,
      uncoveredItemCount: uncoveredCount,
    };
  }, [data?.coverageAnalysis, effectiveItems, hasEdits]);

  const updateItem = useCallback((itemId: string, patch: Partial<ExpenseItem>) => {
    setEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId) ?? {};
      next.set(itemId, { ...existing, ...patch });
      return next;
    });
  }, []);

  const discardEdits = useCallback(() => {
    setEdits(new Map());
    setEditing(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!claimId || !data?.expenses?.items) return;
    setSaving(true);
    try {
      await saveExpenses(claimId, { items: effectiveItems });
      setEdits(new Map());
      setEditing(false);
      onSaved?.();
    } catch (err) {
      console.error('[AssessmentView] Failed to save expenses:', err);
    } finally {
      setSaving(false);
    }
  }, [claimId, data?.expenses?.items, effectiveItems, onSaved]);

  // ─── Benefit Grouping Edit Logic ────────────────────────────────────────────

  // Available benefit codes derived from the original data
  const benefitOptions = useMemo(() => {
    if (!data?.benefitGrouping?.benefitGroups) return [];
    return data.benefitGrouping.benefitGroups.map((g) => ({
      code: g.benefitCode,
      name: g.benefitName,
    }));
  }, [data?.benefitGrouping?.benefitGroups]);

  // Recompute benefit groups after applying edits (move items between groups)
  const effectiveBenefitGroups = useMemo((): BenefitGroup[] => {
    const groups = data?.benefitGrouping?.benefitGroups;
    if (!groups) return [];
    if (!hasBenefitEdits) return groups;

    // Build a lookup: code → group metadata
    const groupMeta = new Map(groups.map((g) => [g.benefitCode, { code: g.benefitCode, name: g.benefitName }]));

    // Collect all items with their effective benefit code
    const allItems: Array<{ id: string; name: string; amount: number; benefitCode: string }> = [];
    for (const group of groups) {
      for (const item of group.items) {
        const targetCode = benefitEdits.get(item.id) ?? group.benefitCode;
        allItems.push({ ...item, benefitCode: targetCode });
      }
    }

    // Rebuild groups
    const grouped = new Map<string, { meta: { code: string; name: string }; items: Array<{ id: string; name: string; amount: number }> }>();
    for (const item of allItems) {
      let entry = grouped.get(item.benefitCode);
      if (!entry) {
        const meta = groupMeta.get(item.benefitCode) ?? { code: item.benefitCode, name: item.benefitCode };
        entry = { meta, items: [] };
        grouped.set(item.benefitCode, entry);
      }
      entry.items.push({ id: item.id, name: item.name, amount: item.amount });
    }

    // Convert to BenefitGroup[], preserving original order
    const result: BenefitGroup[] = [];
    for (const group of groups) {
      const entry = grouped.get(group.benefitCode);
      if (entry && entry.items.length > 0) {
        result.push({
          benefitCode: entry.meta.code,
          benefitName: entry.meta.name,
          itemCount: entry.items.length,
          totalAmount: entry.items.reduce((sum, i) => sum + i.amount, 0),
          items: entry.items,
        });
        grouped.delete(group.benefitCode);
      }
    }
    // Append any remaining groups (shouldn't happen with current benefit options, but safe)
    for (const [, entry] of grouped) {
      if (entry.items.length > 0) {
        result.push({
          benefitCode: entry.meta.code,
          benefitName: entry.meta.name,
          itemCount: entry.items.length,
          totalAmount: entry.items.reduce((sum, i) => sum + i.amount, 0),
          items: entry.items,
        });
      }
    }
    return result;
  }, [data?.benefitGrouping?.benefitGroups, benefitEdits, hasBenefitEdits]);

  // Set of item IDs that have been edited (for highlighting)
  const benefitEditedItemIds = useMemo(() => new Set(benefitEdits.keys()), [benefitEdits]);

  const reassignItem = useCallback((itemId: string, targetCode: string) => {
    setBenefitEdits((prev) => {
      const next = new Map(prev);
      // Find the item's original group
      const originalCode = data?.benefitGrouping?.benefitGroups?.find(
        (g) => g.items.some((i) => i.id === itemId),
      )?.benefitCode;
      // If moving back to original group, remove the edit
      if (targetCode === originalCode) {
        next.delete(itemId);
      } else {
        next.set(itemId, targetCode);
      }
      return next;
    });
  }, [data?.benefitGrouping?.benefitGroups]);

  const discardBenefitEdits = useCallback(() => {
    setBenefitEdits(new Map());
    setBenefitEditing(false);
  }, []);

  const handleBenefitSave = useCallback(async () => {
    if (!claimId || !hasBenefitEdits) return;
    setBenefitSaving(true);
    try {
      await saveBenefitGrouping(claimId, { benefitGroups: effectiveBenefitGroups });
      setBenefitEdits(new Map());
      setBenefitEditing(false);
      onSaved?.();
    } catch (err) {
      console.error('[AssessmentView] Failed to save benefit grouping:', err);
    } finally {
      setBenefitSaving(false);
    }
  }, [claimId, hasBenefitEdits, effectiveBenefitGroups, onSaved]);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ClipboardCheck className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">{t('portal.assessment.noData')}</p>
      </div>
    );
  }

  const rec = data.automationResult;
  const recStyle = rec ? RECOMMENDATION_STYLES[rec.recommendation] ?? DEFAULT_REC_STYLE : null;
  const recLabelKey = rec ? RECOMMENDATION_LABEL_KEYS[rec.recommendation] : null;
  const coverage = effectiveCoverage;
  const coveragePct = coverage && coverage.totalRequested > 0
    ? Math.round((coverage.totalCovered / coverage.totalRequested) * 100)
    : null;

  return (
    <div className="space-y-2">
      {/* Section 1 — Compact Recommendation Hero */}
      {rec && recStyle && (
        <div className={cn('rounded-lg border-2 px-4 py-3', recStyle.border, recStyle.bg)}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className={cn('text-sm px-3 py-0.5 font-bold border', recStyle.badge)}
              >
                {recLabelKey ? t(recLabelKey) : t('portal.assessment.recommend.unknown')}
              </Badge>
              <span className={cn('text-sm font-bold tabular-nums', recStyle.text)}>
                {t('portal.assessment.confidence', { percent: formatConfidence(rec.confidence) })}
              </span>
            </div>
            {rec.completedAt && (
              <span className="text-xs text-muted-foreground">
                {new Date(rec.completedAt).toLocaleString()}
              </span>
            )}
          </div>
          {rec.summary && (
            <p className="text-xs text-muted-foreground mt-1.5">{rec.summary}</p>
          )}
        </div>
      )}

      {/* Section 2 — Coverage Bar + Inline Stats */}
      {coverage && (
        <Card>
          <CardContent className="px-3 py-2.5">
            {coveragePct !== null && (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">
                    {t('portal.assessment.coverageRatio')}
                    {hasEdits && <span className="text-amber-500 ml-1">{t('portal.assessment.edited')}</span>}
                  </span>
                  <span className={cn(
                    'text-xs font-bold tabular-nums',
                    coveragePct >= 80 ? 'text-emerald-600' : coveragePct >= 50 ? 'text-amber-600' : 'text-red-600',
                  )}>
                    {coveragePct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      coveragePct >= 80 ? 'bg-emerald-500' : coveragePct >= 50 ? 'bg-amber-500' : 'bg-red-500',
                    )}
                    style={{ width: `${Math.min(coveragePct, 100)}%` }}
                  />
                </div>
              </>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs">
              <span className="text-muted-foreground">
                {t('portal.assessment.requested')} <span className="font-semibold text-foreground">{formatNumber(coverage.totalRequested)}</span>
              </span>
              <span className="text-muted-foreground">
                {t('portal.assessment.covered')} <span className="font-semibold text-emerald-600">{formatNumber(coverage.totalCovered)}</span>
                <span className="text-muted-foreground/70 ml-1">({coverage.coveredItemCount})</span>
              </span>
              <span className="text-muted-foreground">
                {t('portal.assessment.uncovered')} <span className="font-semibold text-red-600">{formatNumber(coverage.totalUncovered)}</span>
                <span className="text-muted-foreground/70 ml-1">({coverage.uncoveredItemCount})</span>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3 — Expense Coverage (editable) */}
      {data.expenses?.items && data.expenses.items.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {t('portal.assessment.expenseCoverage')}
                <span className="text-muted-foreground font-normal ml-2">({data.expenses.items.length})</span>
              </CardTitle>
              {!editing && claimId && (
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" />
                  {t('common.edit')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-2.5">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-1.5 pr-3 font-medium text-muted-foreground">{t('portal.assessment.item')}</th>
                    <th className="pb-1.5 pr-3 font-medium text-muted-foreground text-right">{t('portal.assessment.amount')}</th>
                    <th className="pb-1.5 pr-3 font-medium text-muted-foreground text-right w-[100px]">{t('portal.assessment.payable')}</th>
                    <th className="pb-1.5 pr-3 font-medium text-muted-foreground text-center">{t('portal.assessment.coveredLabel')}</th>
                    <th className="pb-1.5 font-medium text-muted-foreground">{t('portal.assessment.reasoning')}</th>
                  </tr>
                </thead>
                <tbody>
                  {effectiveItems.map((item) => {
                    const isDirty = edits.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'border-b border-border/50 last:border-0',
                          !item.is_covered && 'bg-red-50/40',
                          isDirty && 'border-l-2 border-l-amber-400',
                        )}
                      >
                        <td className="py-1.5 pr-3 font-medium">{item.name}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {formatNumber(item.total_amount)}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {editing ? (
                            <input
                              type="number"
                              step="0.01"
                              className="w-full text-right tabular-nums bg-background border border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={item.payable_amount ?? item.total_amount}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  updateItem(item.id, { payable_amount: val });
                                }
                              }}
                            />
                          ) : (
                            <span className="tabular-nums">{formatNumber(item.payable_amount ?? item.total_amount)}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-center">
                          {editing ? (
                            <button
                              type="button"
                              onClick={() => updateItem(item.id, { is_covered: !item.is_covered })}
                              className="inline-flex items-center"
                            >
                              {item.is_covered ? (
                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs gap-1 cursor-pointer hover:bg-emerald-200 transition-colors">
                                  <Check className="h-3 w-3" />
                                  {t('portal.assessment.coveredBadge')}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs gap-1 cursor-pointer hover:bg-red-200 transition-colors">
                                  <X className="h-3 w-3" />
                                  {t('portal.assessment.excludedBadge')}
                                </Badge>
                              )}
                            </button>
                          ) : (
                            item.is_covered ? (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs gap-1">
                                <Check className="h-3 w-3" />
                                {t('portal.assessment.coveredBadge')}
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-red-100 text-red-700 text-xs gap-1">
                                <X className="h-3 w-3" />
                                {t('portal.assessment.excludedBadge')}
                              </Badge>
                            )
                          )}
                        </td>
                        <td className="py-1.5">
                          {editing ? (
                            <input
                              type="text"
                              className="w-full bg-background border border-border focus:border-primary focus:outline-none rounded px-1.5 py-0.5 text-xs text-muted-foreground"
                              placeholder={t('portal.assessment.addReasoning')}
                              value={item.coverageReasoning ?? ''}
                              onChange={(e) => updateItem(item.id, { coverageReasoning: e.target.value || null })}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">{item.coverageReasoning || '—'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Bar — shown when edits exist */}
      {hasEdits && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
          <span className="text-sm text-muted-foreground">
            {t('portal.assessment.itemsModified', { count: edits.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={discardEdits} disabled={saving}>
              {t('portal.assessment.discard')}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !claimId}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t('portal.assessment.saveChanges')}
            </Button>
          </div>
        </div>
      )}

      {/* Section 4 — Benefit Groups (hierarchical, editable) */}
      {data.benefitGrouping?.benefitGroups &&
        data.benefitGrouping.benefitGroups.length > 0 && (
          <>
            <Card>
              <CardHeader className="pb-1.5 pt-2.5 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {t('portal.assessment.benefitGroups')}
                    <span className="text-muted-foreground font-normal ml-2">
                      ({effectiveBenefitGroups.length})
                      {hasBenefitEdits && <span className="text-amber-500 ml-1">{t('portal.assessment.edited')}</span>}
                    </span>
                  </CardTitle>
                  {!benefitEditing && claimId && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setBenefitEditing(true)}>
                      <Pencil className="h-3 w-3" />
                      {t('common.edit')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {groupByParentType(effectiveBenefitGroups, treatmentType).map((parent) => (
                  <ParentBenefitSection
                    key={parent.parentType}
                    parent={parent}
                    parentLabel={t(PARENT_LABEL_KEYS[parent.parentType] ?? parent.parentType)}
                    editing={benefitEditing}
                    benefitOptions={benefitOptions}
                    editedItems={benefitEditedItemIds}
                    onReassign={reassignItem}
                  />
                ))}
              </CardContent>
            </Card>

            {/* Benefit Save Bar */}
            {hasBenefitEdits && (
              <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
                <span className="text-sm text-muted-foreground">
                  {t('portal.assessment.itemsReassigned', { count: benefitEdits.size })}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={discardBenefitEdits} disabled={benefitSaving}>
                    {t('portal.assessment.discard')}
                  </Button>
                  <Button size="sm" onClick={handleBenefitSave} disabled={benefitSaving || !claimId}>
                    {benefitSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {t('portal.assessment.saveChanges')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}
