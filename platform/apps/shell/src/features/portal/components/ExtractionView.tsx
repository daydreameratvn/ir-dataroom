import { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { formatDate, formatNumber } from '../utils/format';
import type { ExtractionResult, ExtractionSourceRef, ExpenseItem, DocumentClassification } from '../types';
import { getDocTypeStyle, READABILITY_DOT_STYLES, getReadabilityDotLevel } from '../utils/docStyles';

interface ExtractionViewProps {
  data: ExtractionResult | null;
  onNavigateToPage?: (page: number, sourceRef?: ExtractionSourceRef) => void;
}

const TREATMENT_TYPE_STYLES: Record<string, string> = {
  INPATIENT: 'bg-purple-100 text-purple-700 border-purple-300',
  OUTPATIENT: 'bg-cyan-100 text-cyan-700 border-cyan-300',
  DENTAL: 'bg-lime-100 text-lime-700 border-lime-300',
};

// ─── Readability Helpers ─────────────────────────────────────────────────────

function computeReadabilityLevel(docs: DocumentClassification[]): {
  score: number;
  level: 'high' | 'medium' | 'low';
  key: string;
} | null {
  const scored = docs.filter(d => d.readabilityScore != null);
  if (scored.length === 0) return null;
  const avg = scored.reduce((sum, d) => sum + d.readabilityScore!, 0) / scored.length;
  if (avg >= 4) return { score: avg, level: 'high', key: 'portal.extraction.readabilityHigh' };
  if (avg >= 3) return { score: avg, level: 'medium', key: 'portal.extraction.readabilityMedium' };
  return { score: avg, level: 'low', key: 'portal.extraction.readabilityLow' };
}

const READABILITY_BADGE_STYLES: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-700',
};

// ─── Source Badge ────────────────────────────────────────────────────────────

function SourceBadge({
  fieldPath,
  sources,
  onPageClick,
}: {
  fieldPath: string;
  sources?: Record<string, ExtractionSourceRef>;
  onPageClick?: (page: number, sourceRef?: ExtractionSourceRef) => void;
}) {
  const ref = sources?.[fieldPath];
  if (!ref || ref.pages.length === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/80 transition-colors"
      title={ref.text ?? `Source: ${ref.docType} p.${ref.pages.join(',')}`}
      onClick={(e) => {
        e.stopPropagation();
        const firstPage = ref.pages[0];
        if (firstPage != null) onPageClick?.(firstPage, ref);
      }}
    >
      <FileText className="h-2.5 w-2.5" />
      p.{ref.pages.join(',')}
    </span>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ExpandableSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 py-2.5 text-left text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        {title}
      </button>
      {isOpen && <div className="pb-3">{children}</div>}
    </div>
  );
}

// ─── Expense Grouping ────────────────────────────────────────────────────────

interface ExpenseGroup {
  summary: ExpenseItem;
  details: ExpenseItem[];
}

function buildExpenseGroups(items: ExpenseItem[]): { groups: ExpenseGroup[]; orphans: ExpenseItem[] } {
  const summaryMap = new Map<string, ExpenseGroup>();
  const orphans: ExpenseItem[] = [];

  // First pass: index all summary items
  for (const item of items) {
    if (item.itemLevel === 'summary') {
      summaryMap.set(item.id, { summary: item, details: [] });
    }
  }

  // Second pass: attach detail items to their parent summary
  for (const item of items) {
    if (item.itemLevel === 'detail') {
      if (item.parentId && summaryMap.has(item.parentId)) {
        summaryMap.get(item.parentId)!.details.push(item);
      } else {
        orphans.push(item);
      }
    }
  }

  // Preserve original order of summary items
  const groups: ExpenseGroup[] = [];
  for (const item of items) {
    if (item.itemLevel === 'summary' && summaryMap.has(item.id)) {
      groups.push(summaryMap.get(item.id)!);
    }
  }

  return { groups, orphans };
}

function ExpenseGroupRow({ group, sources, itemIndexMap, onPageClick }: {
  group: ExpenseGroup;
  sources?: Record<string, ExtractionSourceRef>;
  itemIndexMap: Map<string, number>;
  onPageClick?: (page: number, sourceRef?: ExtractionSourceRef) => void;
}) {
  const [isOpen, setIsOpen] = useState(group.details.length > 0);
  const hasDetails = group.details.length > 0;
  const { summary } = group;

  return (
    <>
      <tr
        className={cn(
          'border-b border-border/50 font-semibold bg-muted/30',
          hasDetails && 'cursor-pointer hover:bg-muted/50',
        )}
        onClick={hasDetails ? () => setIsOpen(!isOpen) : undefined}
      >
        <td className="py-1.5 pr-3">
          <div className="flex items-center gap-1.5">
            {hasDetails ? (
              isOpen ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              )
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span>{summary.name}</span>
            {hasDetails && (
              <span className="text-[10px] font-normal text-muted-foreground">({group.details.length})</span>
            )}
          </div>
        </td>
        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(summary.gross_amount)}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(summary.discount_amount ?? 0)}</td>
        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(summary.payable_amount ?? summary.total_amount)}</td>
      </tr>
      {isOpen &&
        group.details.map((detail) => (
          <tr key={detail.id} className="border-b border-border/30 last:border-0 text-muted-foreground">
            <td className="py-1 pr-3 pl-7">
              <span className="inline-flex items-center gap-1">
                {detail.name}
                <SourceBadge fieldPath={`expenses.items.${itemIndexMap.get(detail.id) ?? ''}`} sources={sources} onPageClick={onPageClick} />
              </span>
            </td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(detail.gross_amount)}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(detail.discount_amount ?? 0)}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(detail.payable_amount ?? detail.total_amount)}</td>
          </tr>
        ))}
    </>
  );
}

function ExpensesTable({ expenses, sources, onPageClick }: {
  expenses: ExtractionResult['expenses'];
  sources?: Record<string, ExtractionSourceRef>;
  onPageClick?: (page: number, sourceRef?: ExtractionSourceRef) => void;
}) {
  const { t } = useTranslation();

  if (!expenses || expenses.items.length === 0) return null;

  const { groups, orphans } = buildExpenseGroups(expenses.items);
  const hasMixedLevels = groups.length > 0 && (groups.some((g) => g.details.length > 0) || orphans.length > 0);

  // Build item ID → original index map for source lookup
  const itemIndexMap = new Map<string, number>();
  expenses.items.forEach((item, idx) => itemIndexMap.set(item.id, idx));

  return (
    <Card>
      <CardHeader className="pb-1.5 pt-2.5 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            {t('portal.extraction.expenses')}
            <span className="text-muted-foreground font-normal ml-2">({expenses.items.length})</span>
          </CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">
              {t('portal.extraction.gross')} <span className="font-semibold text-foreground">{formatNumber(expenses.totalGross)}</span>
            </span>
            <span className="text-muted-foreground">
              {t('portal.extraction.payable')} <span className="font-semibold text-emerald-600">{formatNumber(expenses.totalPayable)}</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-2.5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-1.5 pr-3 font-medium text-muted-foreground">{t('portal.extraction.expenseDescription')}</th>
                <th className="pb-1.5 pr-3 font-medium text-muted-foreground text-right">{t('portal.extraction.expenseGross')}</th>
                <th className="pb-1.5 pr-3 font-medium text-muted-foreground text-right">{t('portal.extraction.expenseDiscount')}</th>
                <th className="pb-1.5 pr-3 font-medium text-muted-foreground text-right">{t('portal.extraction.expensePayable')}</th>
              </tr>
            </thead>
            <tbody>
              {hasMixedLevels ? (
                <>
                  {groups.map((group) => (
                    <ExpenseGroupRow key={group.summary.id} group={group} sources={sources} itemIndexMap={itemIndexMap} onPageClick={onPageClick} />
                  ))}
                  {orphans.map((item) => (
                    <tr key={item.id} className="border-b border-border/30 last:border-0 text-muted-foreground">
                      <td className="py-1 pr-3 pl-7">
                        <span className="inline-flex items-center gap-1">
                          {item.name}
                          <SourceBadge fieldPath={`expenses.items.${itemIndexMap.get(item.id) ?? ''}`} sources={sources} onPageClick={onPageClick} />
                        </span>
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(item.gross_amount)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(item.discount_amount ?? 0)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(item.payable_amount ?? item.total_amount)}</td>
                    </tr>
                  ))}
                </>
              ) : (
                expenses.items.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-b border-border/50 last:border-0',
                      item.itemLevel === 'summary' && 'font-semibold bg-muted/30',
                    )}
                  >
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 shrink-0" />
                        <span>{item.name}</span>
                        <SourceBadge fieldPath={`expenses.items.${idx}`} sources={sources} onPageClick={onPageClick} />
                      </div>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(item.gross_amount)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(item.discount_amount ?? 0)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(item.payable_amount ?? item.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="pt-2 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 shrink-0" />
                    <span>{t('portal.extraction.total')}</span>
                  </div>
                </td>
                <td className="pt-2 pr-3 text-right tabular-nums">{formatNumber(expenses.totalGross)}</td>
                <td className="pt-2 pr-3" />
                <td className="pt-2 pr-3 text-right tabular-nums">{formatNumber(expenses.totalPayable)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ExtractionView({ data, onNavigateToPage }: ExtractionViewProps) {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">{t('portal.extraction.noData')}</p>
      </div>
    );
  }

  const treatment = data.extractedTreatmentInfo;
  const medReport = data.medicalReport;
  const sources = data._sources;
  const totalPages = data.classifiedDocuments?.reduce((sum, d) => sum + (d.pageNumbers?.length ?? 0), 0) ?? 0;
  const duplicatePages = data.classifiedDocuments?.flatMap((d) => d.duplicatedPages ?? []) ?? [];
  const readability = data.classifiedDocuments ? computeReadabilityLevel(data.classifiedDocuments) : null;
  const treatmentTypeStyle = treatment?.treatmentType
    ? TREATMENT_TYPE_STYLES[treatment.treatmentType] ?? 'bg-gray-100 text-gray-700 border-gray-300'
    : null;

  // Build consolidated ICD codes from medicalReport.finalDiagnoses when available,
  // falling back to single TreatmentInfo fields. This ensures Treatment Details
  // and Medical Report Diagnoses show consistent codes.
  const consolidatedIcd10 = (() => {
    const dx = medReport?.finalDiagnoses;
    if (dx && dx.length > 0) {
      const codes = dx.map((d) => d.icdCode || d.inferenceIcdCode).filter(Boolean) as string[];
      if (codes.length > 0) return codes.join(', ');
    }
    return [treatment?.icdCode, treatment?.inferenceIcdCode ? `(${treatment.inferenceIcdCode})` : null]
      .filter(Boolean).join(' ') || null;
  })();

  const consolidatedIcd9 = (() => {
    const dx = medReport?.finalDiagnoses;
    if (dx && dx.length > 0) {
      const codes = dx.map((d) => d.icd9Code || d.inferenceIcd9Code).filter(Boolean) as string[];
      if (codes.length > 0) return codes.join(', ');
    }
    return [treatment?.icd9Code, treatment?.inferenceIcd9Code ? `(${treatment.inferenceIcd9Code})` : null]
      .filter(Boolean).join(' ') || null;
  })();

  const consolidatedDiagnosis = (() => {
    const dx = medReport?.finalDiagnoses;
    if (dx && dx.length > 1) {
      return dx.map((d) => d.name).join('; ');
    }
    return treatment?.diagnosis ?? null;
  })();

  return (
    <div className="space-y-2">
      {/* Section 1 — Compact Patient Hero */}
      {treatment && (
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{treatment.patientName ?? t('portal.extraction.unknownPatient')}</span>
              {treatment.patientGender && (
                <span className="text-xs text-muted-foreground">{treatment.patientGender}</span>
              )}
              {treatment.patientDOB && (
                <span className="text-xs text-muted-foreground">{t('portal.extraction.dob')} {formatDate(treatment.patientDOB)}</span>
              )}
              {treatment.treatmentType && treatmentTypeStyle && (
                <Badge variant="secondary" className={cn('text-xs border', treatmentTypeStyle)}>
                  {treatment.treatmentType}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              {consolidatedDiagnosis && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Dx:</span>
                  <span className="text-xs font-medium">{consolidatedDiagnosis}</span>
                  {consolidatedIcd10 && (
                    <span className="rounded bg-blue-100 px-1 py-0.5 text-xs font-mono text-blue-700">
                      {consolidatedIcd10}
                    </span>
                  )}
                  <SourceBadge fieldPath="extractedTreatmentInfo.diagnosis" sources={sources} onPageClick={onNavigateToPage} />
                </div>
              )}
              {treatment.totalPayableAmount != null && (
                <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-emerald-700">
                  {formatNumber(treatment.totalPayableAmount)}
                  <SourceBadge fieldPath="extractedTreatmentInfo.totalPayableAmount" sources={sources} onPageClick={onNavigateToPage} />
                </span>
              )}
            </div>
          </div>
          {/* Inline stats */}
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
            <span>{t('portal.extraction.docsPages', { docs: data.classifiedDocuments?.length ?? 0, pages: totalPages })}</span>
            {readability && (
              <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', READABILITY_BADGE_STYLES[readability.level])}>
                {t('portal.extraction.readability')} {t(readability.key)}
              </Badge>
            )}
            {treatment.admissionDate && (
              <span>
                {formatDate(treatment.admissionDate)}
                {treatment.dischargeDate ? ` — ${formatDate(treatment.dischargeDate)}` : ''}
              </span>
            )}
            {treatment.medicalProviderName && <span>{treatment.medicalProviderName}</span>}
            {treatment.doctorNames.length > 0 && <span>Dr. {treatment.doctorNames.join(', ')}</span>}
          </div>
        </div>
      )}

      {/* Duplicate Pages Warning */}
      {duplicatePages.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs font-semibold text-amber-800">{t('portal.extraction.duplicatePages')}</span>
          <span className="text-xs text-amber-700">{duplicatePages.join(', ')}</span>
        </div>
      )}

      {/* Low Readability Warning */}
      {readability?.level === 'low' && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-xs text-red-800">
            {t('portal.extraction.lowReadabilityWarning')}
          </span>
        </div>
      )}

      {/* Document Classification */}
      {data.classifiedDocuments && data.classifiedDocuments.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">
              {t('portal.extraction.documents')}
              <span className="text-muted-foreground font-normal ml-2">({data.classifiedDocuments.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2.5">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-1.5 pr-4 text-xs font-medium text-muted-foreground">{t('portal.extraction.docType')}</th>
                    <th className="pb-1.5 pr-4 text-xs font-medium text-muted-foreground">{t('portal.extraction.docPages')}</th>
                    <th className="pb-1.5 pr-4 text-xs font-medium text-muted-foreground">{t('portal.extraction.docSummary')}</th>
                    {data.classifiedDocuments!.some(d => d.readabilityScore != null) && (
                      <th className="pb-1.5 text-xs font-medium text-muted-foreground text-center w-16">{t('portal.extraction.docQuality')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.classifiedDocuments.map((doc, i) => (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-border/50 last:border-0',
                        doc.duplicatedPages && doc.duplicatedPages.length > 0 && 'bg-amber-50/50',
                      )}
                    >
                      <td className="py-1.5 pr-4">
                        <Badge variant="secondary" className={cn('text-xs', getDocTypeStyle(doc.type))}>
                          {doc.type}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground tabular-nums">
                        {doc.pageNumbers?.join(', ') ?? '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{doc.summary ?? '—'}</td>
                      {data.classifiedDocuments!.some(d => d.readabilityScore != null) && (
                        <td className="py-1.5 text-center">
                          {doc.readabilityScore != null ? (
                            <span
                              className="inline-flex items-center justify-center"
                              title={
                                doc.readabilityIssues && doc.readabilityIssues.length > 0
                                  ? `${doc.readabilityScore}/5 — ${doc.readabilityIssues.join(', ')}`
                                  : `${doc.readabilityScore}/5`
                              }
                            >
                              <span className={cn(
                                'inline-block h-2 w-2 rounded-full',
                                READABILITY_DOT_STYLES[getReadabilityDotLevel(doc.readabilityScore)],
                              )} />
                              <span className="ml-1 text-[10px] text-muted-foreground">{doc.readabilityScore}/5</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Treatment Details (collapsible — key info already in hero) */}
      {treatment && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">{t('portal.extraction.treatmentDetails')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2.5">
            <div className="space-y-0">
              {[
                // Group 1: Patient info
                [
                  { l: t('portal.extraction.patient'), v: treatment.patientName, p: 'extractedTreatmentInfo.patientName' },
                  { l: t('portal.extraction.dobLabel'), v: formatDate(treatment.patientDOB), p: 'extractedTreatmentInfo.patientDOB' },
                  { l: t('portal.extraction.gender'), v: treatment.patientGender, p: 'extractedTreatmentInfo.patientGender' },
                  { l: t('portal.extraction.type'), v: treatment.treatmentType, p: 'extractedTreatmentInfo.treatmentType' },
                ],
                // Group 2: Dates
                [
                  { l: t('portal.extraction.admission'), v: formatDate(treatment.admissionDate), p: 'extractedTreatmentInfo.admissionDate' },
                  { l: t('portal.extraction.discharge'), v: formatDate(treatment.dischargeDate), p: 'extractedTreatmentInfo.dischargeDate' },
                ],
                // Group 3: Diagnosis & codes
                [
                  { l: t('portal.extraction.diagnosis'), v: consolidatedDiagnosis, p: 'extractedTreatmentInfo.diagnosis' },
                  { l: t('portal.extraction.icd10'), v: consolidatedIcd10, p: 'extractedTreatmentInfo.icdCode' },
                  { l: t('portal.extraction.icd9'), v: consolidatedIcd9, p: 'extractedTreatmentInfo.icd9Code' },
                ],
                // Group 4: Provider info
                [
                  { l: t('portal.extraction.provider'), v: treatment.medicalProviderName, p: 'extractedTreatmentInfo.medicalProviderName' },
                  { l: t('portal.extraction.doctors'), v: treatment.doctorNames.length > 0 ? treatment.doctorNames.join(', ') : null, p: 'extractedTreatmentInfo.doctorNames' },
                ],
                // Group 5: Billing
                [
                  { l: t('portal.extraction.invoice'), v: treatment.invoiceNumber, p: 'extractedTreatmentInfo.invoiceNumber' },
                  { l: t('portal.extraction.totalPayable'), v: treatment.totalPayableAmount != null ? formatNumber(treatment.totalPayableAmount) : null, p: 'extractedTreatmentInfo.totalPayableAmount' },
                ],
              ]
                .map((group) => group.filter((f) => f.v && f.v !== '—'))
                .filter((group) => group.length > 0)
                .map((group, gi) => (
                  <div key={gi} className={cn('py-1.5', gi > 0 && 'border-t border-border/40')}>
                    {group.map((f) => (
                      <div key={f.l} className="flex items-baseline gap-2 py-0.5">
                        <span className="w-24 shrink-0 text-xs text-muted-foreground">{f.l}</span>
                        <span className="flex-1 text-xs font-medium inline-flex items-baseline gap-1 min-w-0">
                          <span className="break-words">{f.v}</span>
                          <SourceBadge fieldPath={f.p} sources={sources} onPageClick={onNavigateToPage} />
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>

            {treatment.surgeries.length > 0 && (
              <div className="mt-3 pt-2 border-t">
                <span className="text-xs text-muted-foreground">{t('portal.extraction.surgeries')}</span>
                <div className="space-y-0.5 mt-1">
                  {treatment.surgeries.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">{formatDate(s.date)}</span>
                      <span className="font-medium">{s.operationName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Medical Report */}
      {data.medicalReport && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">{t('portal.extraction.medicalReport')}</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2.5">
            {/* Chief Complaint — inline key-value row */}
            {data.medicalReport.chiefComplaint && (
              <div className="flex items-baseline gap-2 py-1.5">
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{t('portal.extraction.chiefComplaint')}</span>
                <span className="flex-1 text-xs font-medium inline-flex items-baseline gap-1 min-w-0">
                  <span className="break-words">{data.medicalReport.chiefComplaint}</span>
                  <SourceBadge fieldPath="medicalReport.chiefComplaint" sources={sources} onPageClick={onNavigateToPage} />
                </span>
              </div>
            )}

            {/* Diagnoses — always visible */}
            {data.medicalReport.finalDiagnoses && data.medicalReport.finalDiagnoses.length > 0 && (
              <div className={cn('py-1.5', data.medicalReport.chiefComplaint && 'border-t border-border/40')}>
                <span className="text-xs text-muted-foreground">{t('portal.extraction.diagnoses')}</span>
                <div className="mt-1 rounded-md border divide-y">
                  {data.medicalReport.finalDiagnoses.map((d, i) => (
                    <div key={i} className="px-2 py-1.5">
                      <div className="text-xs font-medium">{d.name}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {d.icdCode && (
                          <span className="rounded bg-blue-100 px-1 py-0.5 text-xs font-mono text-blue-700">
                            ICD-10: {d.icdCode}
                          </span>
                        )}
                        {!d.icdCode && d.inferenceIcdCode && (
                          <span className="rounded bg-blue-50 px-1 py-0.5 text-xs font-mono text-blue-600">
                            ICD-10: {d.inferenceIcdCode} {t('portal.extraction.inferred')}
                          </span>
                        )}
                        {(d.icd9Code?.trim() || d.inferenceIcd9Code?.trim()) && (
                          <span className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-muted-foreground">
                            ICD-9: {d.icd9Code?.trim() || d.inferenceIcd9Code?.trim()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expandable sections — long content */}
            <div className={cn((data.medicalReport.chiefComplaint || (data.medicalReport.finalDiagnoses && data.medicalReport.finalDiagnoses.length > 0)) && 'border-t border-border/40')}>
              {data.medicalReport.vitalSigns &&
                Object.keys(data.medicalReport.vitalSigns).length > 0 && (
                  <ExpandableSection title={t('portal.extraction.vitalSigns')}>
                    <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {Object.entries(data.medicalReport.vitalSigns).map(([key, val]) => (
                        <div key={key}>
                          <dt className="text-xs text-muted-foreground">{key}</dt>
                          <dd className="text-xs font-medium">{String(val)}</dd>
                        </div>
                      ))}
                    </dl>
                  </ExpandableSection>
                )}

              {data.medicalReport.hospitalCourse && (
                <ExpandableSection title={t('portal.extraction.hospitalCourse')}>
                  <p className="text-xs whitespace-pre-wrap">
                    {data.medicalReport.hospitalCourse}
                    {' '}<SourceBadge fieldPath="medicalReport.hospitalCourse" sources={sources} onPageClick={onNavigateToPage} />
                  </p>
                </ExpandableSection>
              )}

              {data.medicalReport.investigations && (
                <ExpandableSection title={t('portal.extraction.investigations')}>
                  <p className="text-xs whitespace-pre-wrap">
                    {data.medicalReport.investigations}
                    {' '}<SourceBadge fieldPath="medicalReport.investigations" sources={sources} onPageClick={onNavigateToPage} />
                  </p>
                </ExpandableSection>
              )}

              {data.medicalReport.treatments && (
                <ExpandableSection title={t('portal.extraction.treatments')}>
                  <p className="text-xs whitespace-pre-wrap">
                    {data.medicalReport.treatments}
                    {' '}<SourceBadge fieldPath="medicalReport.treatments" sources={sources} onPageClick={onNavigateToPage} />
                  </p>
                </ExpandableSection>
              )}
            </div>

            {/* Outcome — inline key-value row */}
            {data.medicalReport.treatmentOutcome && (
              <div className={cn('flex items-baseline gap-2 py-1.5', 'border-t border-border/40')}>
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{t('portal.extraction.outcome')}</span>
                <span className="flex-1 text-xs font-medium inline-flex items-baseline gap-1 min-w-0">
                  <span className="break-words whitespace-pre-wrap">{data.medicalReport.treatmentOutcome}</span>
                  <SourceBadge fieldPath="medicalReport.treatmentOutcome" sources={sources} onPageClick={onNavigateToPage} />
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Expenses */}
      {data.expenses && data.expenses.items.length > 0 && (
        <ExpensesTable expenses={data.expenses} sources={sources} onPageClick={onNavigateToPage} />
      )}

    </div>
  );
}
