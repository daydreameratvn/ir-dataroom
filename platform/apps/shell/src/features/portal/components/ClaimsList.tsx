import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { PageHeader, Button, Badge, EmptyState } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { usePortalClaims } from '../hooks/usePortalClaims';
import { formatDate, formatCurrency } from '../utils/format';
import { CLAIM_STATUS_CONFIG, CLAIM_TYPE_CONFIG, RISK_LEVEL_CLASSES } from '../types';
import type { PortalClaimStatus, PortalClaimSummary } from '../types';

export default function ClaimsList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const statusOptions = [
    { label: t('portal.claims.allStatuses'), value: '' },
    { label: t('portal.claims.statusSubmitted'), value: 'SUBMITTED' },
    { label: t('portal.claims.statusProcessing'), value: 'PROCESSING' },
    { label: t('portal.claims.statusInReview'), value: 'IN_REVIEW' },
    { label: t('portal.claims.statusApproved'), value: 'APPROVED' },
    { label: t('portal.claims.statusRejected'), value: 'REJECTED' },
    { label: t('portal.claims.statusPending'), value: 'PENDING' },
  ];

  const { data, isLoading } = usePortalClaims({
    page,
    limit: 30,
    status: statusFilter ? (statusFilter as PortalClaimStatus) : undefined,
    search: search || undefined,
  });

  const claims = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 30);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('portal.claims.title')}
        subtitle={t('portal.claims.totalClaims', { count: total })}
        action={
          <Button onClick={() => navigate('/portal/claims/new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('portal.dashboard.newClaim')}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={t('portal.claims.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {!isLoading && claims.length === 0 ? (
        <EmptyState
          title={t('portal.claims.noClaims')}
          description={search || statusFilter ? t('portal.claims.noClaimsFilterDesc') : t('portal.claims.noClaimsEmptyDesc')}
          action={
            !search && !statusFilter ? (
              <Button variant="outline" onClick={() => navigate('/portal/claims/new')}>
                <Plus className="mr-2 h-4 w-4" />
                {t('portal.claims.submitClaim')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.claims.claimNumber')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.claims.insuredName')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.claims.status')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.claims.type')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.claims.fwaRisk')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-right text-sm font-medium">{t('portal.claims.amount')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.claims.created')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="h-24 text-center text-muted-foreground">{t('common.loading')}</td>
                </tr>
              ) : (
                claims.map((claim: PortalClaimSummary) => {
                  const statusCfg = CLAIM_STATUS_CONFIG[claim.status];
                  const statusKey = claim.status.toLowerCase();
                  const typeCfg = claim.type ? CLAIM_TYPE_CONFIG[claim.type] : null;
                  return (
                    <tr
                      key={claim.id}
                      className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/portal/claims/${claim.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium font-mono">{claim.claimNumber}</td>
                      <td className="px-4 py-3 text-sm">{claim.insuredName ?? '—'}</td>
                      <td className="px-4 py-3 text-sm">
                        {statusCfg ? (
                          <Badge variant="secondary" className={statusCfg.className}>{t(`portal.claimStatus.${statusKey}`, statusCfg.label)}</Badge>
                        ) : (
                          <Badge variant="secondary">{claim.status}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {typeCfg ? (
                          <Badge variant="secondary" className={typeCfg.className}>{t(`portal.claimType.${claim.type}`, typeCfg.label)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">{claim.type ?? '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {claim.fwaRisk ? (
                          <Badge variant="secondary" className={RISK_LEVEL_CLASSES[claim.fwaRisk.riskLevel.toUpperCase()] ?? 'bg-gray-100 text-gray-700'}>
                            {claim.fwaRisk.riskLevel.toUpperCase()} ({claim.fwaRisk.riskScore})
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {formatCurrency(claim.totalRequestedAmount, claim.currency ?? 'THB')}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(claim.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('portal.claims.pagination', { page, totalPages, total })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
            >
              {t('common.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
            >
              {t('common.next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
