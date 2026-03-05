import { Card, CardHeader, CardContent } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { FWAAnalyticsSummary, FWAClassificationItem } from '../types';
import { FWA_CLASSIFICATION_CONFIG } from '../types';
import { formatTHBShort } from '../utils/format';

interface FWAResolutionSummaryProps {
  summary: FWAAnalyticsSummary;
  classification?: FWAClassificationItem[];
}

export default function FWAResolutionSummary({ summary, classification }: FWAResolutionSummaryProps) {
  const { t } = useTranslation();
  const totalCases = summary.casesIdentified + summary.casesConfirmed;
  const identifiedPct = totalCases > 0 ? (summary.casesIdentified / totalCases) * 100 : 0;
  const confirmedPct = totalCases > 0 ? (summary.casesConfirmed / totalCases) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.resolutionSummary')}</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resolution funnel */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{t('portal.fwaAnalytics.identified')}</span>
            <div className="flex h-6 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="flex items-center justify-center rounded-full bg-blue-500 text-xs font-medium text-white transition-all"
                style={{ width: `${Math.max(identifiedPct, 8)}%` }}
              >
                {summary.casesIdentified}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{t('portal.fwaAnalytics.confirmed')}</span>
            <div className="flex h-6 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="flex items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white transition-all"
                style={{ width: `${Math.max(confirmedPct, 8)}%` }}
              >
                {summary.casesConfirmed}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('portal.fwaAnalytics.confirmationRateLabel')}{' '}
            <span className="font-medium text-foreground">
              {totalCases > 0 ? ((summary.casesConfirmed / summary.casesIdentified) * 100).toFixed(1) : 0}%
            </span>
          </p>
        </div>

        {/* Classification breakdown */}
        {classification && classification.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">{t('portal.fwaAnalytics.byClassification')}</h4>
            <div className="space-y-2">
              {classification.map((item) => {
                const cfg = FWA_CLASSIFICATION_CONFIG[item.type];
                return (
                  <div key={item.type} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg?.color }} />
                      <span className="text-sm font-medium">{cfg?.label ?? item.type}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{t('portal.fwaAnalytics.identifiedCount', { count: item.identified })}</span>
                      <span>{t('portal.fwaAnalytics.confirmedCount', { count: item.confirmed })}</span>
                      <span className="font-medium text-foreground">{formatTHBShort(item.deniedValue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
