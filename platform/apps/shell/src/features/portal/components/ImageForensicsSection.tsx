import { useState } from 'react';
import { Shield, ShieldAlert, ShieldX, ChevronDown, FileSearch } from 'lucide-react';
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
import type { ImageForensicsResult, ImageForensicsVerdict } from '../types';

interface ImageForensicsSectionProps {
  data: ImageForensicsResult | null | undefined;
}

const VERDICT_STYLES: Record<ImageForensicsVerdict, { bg: string; border: string; text: string; badgeClass: string }> = {
  AUTHENTIC: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badgeClass: 'bg-emerald-100 text-emerald-800' },
  SUSPICIOUS: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badgeClass: 'bg-amber-100 text-amber-800' },
  TAMPERED: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badgeClass: 'bg-red-100 text-red-800' },
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
  const hasAnomalies = data.totalAnomaliesFound > 0;

  return (
    <div className="space-y-3">
      {/* Verdict Hero Card */}
      <Card className={cn('border-2', style.border, style.bg)}>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <VerdictIcon verdict={data.overallVerdict} className="h-8 w-8" />
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
            <p className="text-sm text-muted-foreground">
              {t('portal.imageForensics.documentsAnalyzed', { count: data.totalDocumentsAnalyzed })}
            </p>
            {hasAnomalies && (
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

      {/* Document Findings — only shown when anomalies exist */}
      {hasAnomalies && (
        <Card>
          <CardHeader className="pb-1.5 pt-2.5 px-3">
            <CardTitle className="text-sm">{t('portal.imageForensics.documentFindings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-2.5">
            {data.documentFindings
              .filter((doc) => doc.anomalies.length > 0)
              .map((doc, i) => {
                const docStyle = VERDICT_STYLES[doc.verdict];
                return (
                  <div key={i} className={cn('rounded-lg border p-3', docStyle.bg, docStyle.border)}>
                    <div className="flex items-center gap-3 mb-2">
                      <VerdictIcon verdict={doc.verdict} className="h-4 w-4" />
                      <span className="text-sm font-medium">{doc.documentType}</span>
                      <Badge variant="secondary" className={cn('text-xs', docStyle.badgeClass)}>
                        {doc.verdict}
                      </Badge>
                      {doc.pageNumbers.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t('portal.imageForensics.pages')} {doc.pageNumbers.join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5 ml-7">
                      {doc.anomalies.map((anomaly, j) => (
                        <div key={j} className="flex items-start gap-2">
                          <Badge variant="secondary" className={cn('text-xs shrink-0 mt-0.5', SEVERITY_STYLES[anomaly.severity] ?? '')}>
                            {anomaly.severity}
                          </Badge>
                          <div>
                            <span className="text-xs font-medium text-muted-foreground">{anomaly.type}</span>
                            <p className="text-sm text-muted-foreground">{anomaly.description}</p>
                            {anomaly.location && (
                              <p className="text-xs text-muted-foreground/70">{anomaly.location}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Collapsible Report */}
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
