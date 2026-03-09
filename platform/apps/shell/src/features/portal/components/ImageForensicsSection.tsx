import { useState } from 'react';
import { Shield, ShieldAlert, ShieldX, ChevronDown, FileSearch, Eye } from 'lucide-react';
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  MarkdownRenderer,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  cn,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { ImageForensicsResult, ImageForensicsVerdict, ImageForensicsDocumentFinding } from '../types';

interface ImageForensicsSectionProps {
  data: ImageForensicsResult | null | undefined;
}

const VERDICT_STYLES: Record<ImageForensicsVerdict, { bg: string; border: string; text: string; badgeClass: string; ring: string }> = {
  AUTHENTIC: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badgeClass: 'bg-emerald-100 text-emerald-800', ring: 'ring-emerald-400' },
  SUSPICIOUS: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badgeClass: 'bg-amber-100 text-amber-800', ring: 'ring-amber-400' },
  TAMPERED: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badgeClass: 'bg-red-100 text-red-800', ring: 'ring-red-400' },
};

const SEVERITY_STYLES: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
};

function VerdictIcon({ verdict, className }: { verdict: ImageForensicsVerdict; className?: string }) {
  switch (verdict) {
    case 'AUTHENTIC': return <Shield className={cn('text-emerald-600', className)} />;
    case 'SUSPICIOUS': return <ShieldAlert className={cn('text-amber-600', className)} />;
    case 'TAMPERED': return <ShieldX className={cn('text-red-600', className)} />;
  }
}

function getScoreColor(score: number): string {
  if (score <= 0.3) return 'text-emerald-600';
  if (score <= 0.6) return 'text-amber-600';
  return 'text-red-600';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ─── Document Finding Card ──────────────────────────────────────────────────

function DocumentFindingCard({ finding }: { finding: ImageForensicsDocumentFinding }) {
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const style = VERDICT_STYLES[finding.verdict];
  const hasEnrichedData = finding.overallScore != null;

  return (
    <div className={cn('rounded-lg border p-4', style.bg, style.border)}>
      {/* Header: doc type + verdict + risk */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <VerdictIcon verdict={finding.verdict} className="h-4 w-4" />
          <span className="text-sm font-semibold">{finding.documentType}</span>
          <Badge variant="secondary" className={cn('text-xs font-bold', style.badgeClass)}>
            {finding.verdict}
          </Badge>
          {finding.riskLevel && (
            <Badge variant="outline" className="text-xs capitalize">
              {finding.riskLevel} risk
            </Badge>
          )}
        </div>
        {finding.pageNumbers.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Pages {finding.pageNumbers.join(', ')}
          </span>
        )}
      </div>

      {/* Stats row — score, heatmap, fields */}
      {hasEnrichedData && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-md bg-background/60 p-2 text-center">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Score</p>
            <p className={cn('text-lg font-bold tabular-nums', getScoreColor(finding.overallScore!))}>
              {formatPercent(finding.overallScore!)}
            </p>
          </div>
          {finding.truforGlobalScore != null && (
            <div className="rounded-md bg-background/60 p-2 text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Heatmap</p>
              <p className={cn('text-lg font-bold tabular-nums', getScoreColor(finding.truforGlobalScore))}>
                {finding.truforGlobalScore.toFixed(3)}
              </p>
            </div>
          )}
          {finding.fieldsAnalyzed != null && (
            <div className="rounded-md bg-background/60 p-2 text-center">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Fields</p>
              <p className="text-lg font-bold tabular-nums text-muted-foreground">
                {finding.fieldsAnalyzed}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Top risky fields */}
      {finding.topRiskyFields && finding.topRiskyFields.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Top Risky Fields
          </p>
          <div className="space-y-1">
            {finding.topRiskyFields.map((field, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={cn(
                  'w-12 text-right font-mono font-bold tabular-nums',
                  getScoreColor(field.anomalyScore),
                )}>
                  {(field.anomalyScore * 100).toFixed(0)}%
                </span>
                <Badge variant="outline" className="text-[10px] px-1 py-0">{field.type}</Badge>
                <span className="text-muted-foreground truncate">&ldquo;{field.text}&rdquo;</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anomalies */}
      {finding.anomalies.length > 0 && (
        <div className="space-y-1.5 mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Anomalies ({finding.anomalies.length})
          </p>
          {finding.anomalies.map((anomaly, j) => (
            <div key={j} className="flex items-start gap-2">
              <Badge variant="secondary" className={cn('text-xs shrink-0 mt-0.5', SEVERITY_STYLES[anomaly.severity] ?? '')}>
                {anomaly.severity}
              </Badge>
              <div>
                <span className="text-xs font-medium text-muted-foreground">{anomaly.type}</span>
                <p className="text-xs text-muted-foreground">{anomaly.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Heatmap — collapsible inline image */}
      {finding.heatmapBase64 && (
        <Collapsible open={heatmapOpen} onOpenChange={setHeatmapOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Eye className="h-3 w-3" />
              {heatmapOpen ? 'Hide' : 'View'} Forensics Heatmap
              <ChevronDown className={cn('h-3 w-3 transition-transform', heatmapOpen && 'rotate-180')} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-md overflow-hidden border">
              <img
                src={`data:image/jpeg;base64,${finding.heatmapBase64}`}
                alt={`Forensics heatmap for ${finding.documentType}`}
                className="w-full"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ImageForensicsSection({ data }: ImageForensicsSectionProps) {
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);

  if (!data) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <FileSearch className="h-5 w-5 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{t('portal.imageForensics.noData')}</p>
        </CardContent>
      </Card>
    );
  }

  const style = VERDICT_STYLES[data.overallVerdict];

  return (
    <div className="space-y-3">
      {/* Verdict Hero Card */}
      <Card className={cn('border-2', style.border, style.bg)}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-full ring-4', style.ring)}>
              <VerdictIcon verdict={data.overallVerdict} className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">{t('portal.imageForensics.title')}</span>
                <Badge variant="secondary" className={cn('font-bold', style.badgeClass)}>
                  {data.overallVerdict}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{data.summary}</p>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="text-2xl font-bold tabular-nums">{data.confidenceScore}%</p>
            <p className="text-xs text-muted-foreground">confidence</p>
            <p className="text-sm text-muted-foreground">
              {t('portal.imageForensics.documentsAnalyzed', { count: data.totalDocumentsAnalyzed })}
            </p>
            {data.totalAnomaliesFound > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('portal.imageForensics.anomaliesFound', { count: data.totalAnomaliesFound })}
              </p>
            )}
            {data.completedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(data.completedAt).toLocaleString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-Document Findings */}
      {data.documentFindings.length > 0 && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">{t('portal.imageForensics.documentFindings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-2.5">
            {data.documentFindings.map((finding, i) => (
              <DocumentFindingCard key={i} finding={finding} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Collapsible Full Report */}
      {data.reportMarkdown && (
        <Collapsible open={reportOpen} onOpenChange={setReportOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between p-6 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm font-semibold">{t('portal.imageForensics.forensicsReport')}</span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    reportOpen && 'rotate-180',
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t px-6 pb-6 pt-4">
                <MarkdownRenderer content={data.reportMarkdown} />
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
