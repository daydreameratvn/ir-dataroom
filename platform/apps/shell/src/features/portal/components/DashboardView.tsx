import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, Plus, List } from 'lucide-react';
import { StatCard, PageHeader, Button, Badge } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { CLAIM_STATUS_CONFIG, CLAIM_TYPE_CONFIG } from '../types';
import type { PortalClaimSummary } from '../types';
import { formatDate } from '../utils/format';

export default function DashboardView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('portal.title')}
        subtitle={t('portal.subtitle')}
        action={
          <div className="flex gap-2">
            <Button onClick={() => navigate('/fwa/claims/new')}>
              <Plus className="mr-2 h-4 w-4" />
              {t('portal.dashboard.newClaim')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/fwa/claims')}>
              <List className="mr-2 h-4 w-4" />
              {t('portal.dashboard.viewAllClaims')}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('portal.dashboard.totalClaims')}
          value={isLoading ? '-' : (stats?.totalClaims ?? 0)}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.dashboard.processing')}
          value={isLoading ? '-' : (stats?.processing ?? 0)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.dashboard.awaitingApproval')}
          value={isLoading ? '-' : (stats?.awaitingApproval ?? 0)}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label={t('portal.dashboard.approved')}
          value={isLoading ? '-' : (stats?.approved ?? 0)}
          icon={<CheckCircle className="h-5 w-5" />}
        />
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold">{t('portal.dashboard.recentClaims')}</h3>
        <div className="rounded-md border">
          <table className="w-full">
            <thead>
              <tr>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.dashboard.claimNumber')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.dashboard.insuredName')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.dashboard.status')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.dashboard.type')}</th>
                <th className="border-b bg-muted/50 px-4 py-3 text-left text-sm font-medium">{t('portal.dashboard.created')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="h-24 text-center text-muted-foreground">{t('common.loading')}</td>
                </tr>
              ) : !stats?.recentClaims?.length ? (
                <tr>
                  <td colSpan={5} className="h-24 text-center text-muted-foreground">{t('common.noData')}</td>
                </tr>
              ) : (
                stats.recentClaims.map((claim: PortalClaimSummary) => {
                  const statusCfg = CLAIM_STATUS_CONFIG[claim.status];
                  const statusKey = claim.status.toLowerCase().replace(/ /g, '_');
                  const typeCfg = claim.type ? CLAIM_TYPE_CONFIG[claim.type] : null;
                  return (
                    <tr
                      key={claim.id}
                      className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                      onClick={() => navigate(`/fwa/claims/${claim.id}`)}
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
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(claim.createdAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
