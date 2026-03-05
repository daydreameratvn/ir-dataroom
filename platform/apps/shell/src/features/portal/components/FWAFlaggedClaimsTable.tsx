import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardContent, Badge, cn } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { FWATopFlaggedClaim, FWAClassificationType, FWAResolutionStatus } from '../types';
import {
  RISK_LEVEL_CLASSES,
  FWA_CLASSIFICATION_CONFIG,
  FWA_RESOLUTION_STATUS_CONFIG,
  FWA_RECOMMENDATION_CONFIG,
} from '../types';
import { formatDate, formatTHBShort } from '../utils/format';

interface FWAFlaggedClaimsTableProps {
  claims: FWATopFlaggedClaim[];
}

const SEVERITY_CLASSES: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
};

export default function FWAFlaggedClaimsTable({ claims }: FWAFlaggedClaimsTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [classificationFilter, setClassificationFilter] = useState<FWAClassificationType | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<FWAResolutionStatus | 'ALL'>('ALL');

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = claims.filter((claim) => {
    if (classificationFilter !== 'ALL' && claim.fwaClassification !== classificationFilter) return false;
    if (statusFilter !== 'ALL' && claim.resolutionStatus !== statusFilter) return false;
    return true;
  });

  const hasClassification = claims.some((c) => c.fwaClassification);
  const hasStatus = claims.some((c) => c.resolutionStatus);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-sm font-semibold">{t('portal.fwaAnalytics.topFlaggedClaimsTitle')}</h3>
          <div className="flex gap-2">
            {hasClassification && (
              <select
                value={classificationFilter}
                onChange={(e) => setClassificationFilter(e.target.value as FWAClassificationType | 'ALL')}
                className="rounded-md border bg-transparent px-2 py-1 text-xs"
              >
                <option value="ALL">{t('portal.fwaAnalytics.allClassifications')}</option>
                {Object.entries(FWA_CLASSIFICATION_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            )}
            {hasStatus && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as FWAResolutionStatus | 'ALL')}
                className="rounded-md border bg-transparent px-2 py-1 text-xs"
              >
                <option value="ALL">{t('portal.fwaAnalytics.allStatuses')}</option>
                {Object.entries(FWA_RESOLUTION_STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {claims.length === 0 ? t('portal.fwaAnalytics.noFlaggedClaims') : t('portal.fwaAnalytics.noMatchingClaims')}
          </p>
        ) : (
          <div className="rounded-md border">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-8 border-b bg-muted/50 px-2 py-3" />
                  <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.claimCode')}</th>
                  <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.insured')}</th>
                  <th className="border-b bg-muted/50 px-3 py-3 text-right text-xs font-medium">{t('portal.fwaAnalytics.riskScore')}</th>
                  <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.riskLevel')}</th>
                  <th className="border-b bg-muted/50 px-3 py-3 text-right text-xs font-medium">{t('portal.fwaAnalytics.amount')}</th>
                  {hasClassification && (
                    <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.classification')}</th>
                  )}
                  {hasStatus && (
                    <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.status')}</th>
                  )}
                  <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.recommendation')}</th>
                  <th className="border-b bg-muted/50 px-3 py-3 text-right text-xs font-medium">{t('portal.fwaAnalytics.flags')}</th>
                  <th className="border-b bg-muted/50 px-3 py-3 text-left text-xs font-medium">{t('portal.fwaAnalytics.created')}</th>
                  <th className="w-10 border-b bg-muted/50 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((claim) => {
                  const isExpanded = expandedRows.has(claim.id);
                  const riskClass = RISK_LEVEL_CLASSES[claim.riskLevel] ?? '';
                  const classificationCfg = claim.fwaClassification
                    ? FWA_CLASSIFICATION_CONFIG[claim.fwaClassification]
                    : null;
                  const statusCfg = claim.resolutionStatus
                    ? FWA_RESOLUTION_STATUS_CONFIG[claim.resolutionStatus]
                    : null;
                  const recCfg = FWA_RECOMMENDATION_CONFIG[claim.recommendation];

                  return (
                    <>
                      <tr
                        key={claim.id}
                        className={cn(
                          'border-b transition-colors hover:bg-muted/50',
                          isExpanded && 'bg-muted/30',
                        )}
                      >
                        <td className="px-2 py-3">
                          <button
                            onClick={() => toggleRow(claim.id)}
                            className="rounded p-0.5 hover:bg-muted"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-xs font-medium font-mono">{claim.claimCode}</td>
                        <td className="px-3 py-3 text-xs">{claim.insuredName}</td>
                        <td className="px-3 py-3 text-right text-xs font-mono font-medium">{claim.riskScore}</td>
                        <td className="px-3 py-3 text-xs">
                          <Badge variant="secondary" className={riskClass}>{claim.riskLevel}</Badge>
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">{formatTHBShort(claim.requestedAmount)}</td>
                        {hasClassification && (
                          <td className="px-3 py-3 text-xs">
                            {classificationCfg ? (
                              <Badge variant="secondary" className={classificationCfg.className}>
                                {classificationCfg.label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        {hasStatus && (
                          <td className="px-3 py-3 text-xs">
                            {statusCfg ? (
                              <Badge variant="secondary" className={statusCfg.className}>
                                {statusCfg.label}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-3 text-xs">
                          {recCfg ? (
                            <Badge variant="secondary" className={recCfg.className}>{recCfg.label}</Badge>
                          ) : (
                            <span>{claim.recommendation}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-mono">{claim.flagCount}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(claim.createdAt)}</td>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => navigate(`/fwa/claims/${claim.id}`)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={t('portal.fwaAnalytics.investigate')}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${claim.id}-flags`} className="border-b bg-muted/20">
                          <td />
                          <td colSpan={hasClassification && hasStatus ? 11 : hasClassification || hasStatus ? 10 : 9} className="px-3 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground">{t('portal.fwaAnalytics.flagsCount', { count: claim.flags.length })}</p>
                              <div className="flex flex-wrap gap-1.5">
                                {claim.flags.map((flag, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1 rounded-md border bg-background px-2 py-1"
                                  >
                                    <Badge
                                      variant="secondary"
                                      className={cn('text-[10px] px-1 py-0', SEVERITY_CLASSES[flag.severity] ?? '')}
                                    >
                                      {flag.severity}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{flag.category}</span>
                                    <span className="text-xs font-medium">{flag.title}</span>
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
        )}
      </CardContent>
    </Card>
  );
}
