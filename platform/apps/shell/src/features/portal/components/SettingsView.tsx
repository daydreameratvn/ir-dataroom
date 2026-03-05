import { PageHeader, Card, CardHeader, CardContent, Badge } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { usePortalConfig } from '../hooks/usePortalConfig';

export default function SettingsView() {
  const { t } = useTranslation();
  const config = usePortalConfig((s) => s.config);

  return (
    <div className="space-y-6">
      <PageHeader title={t('portal.settings.title')} subtitle={t('portal.settings.subtitle')} />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold">{t('portal.settings.tenantInfo')}</h3>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">{t('portal.settings.tenant')}</dt>
              <dd className="text-sm font-medium">{config?.tenantName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">{t('portal.settings.market')}</dt>
              <dd className="text-sm font-medium">{config?.market ?? '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold">{t('portal.settings.activeModules')}</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('portal.settings.extraction')}</span>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">{t('portal.settings.alwaysActive')}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('portal.settings.assessment')}</span>
              <Badge variant="secondary" className={config?.modules.assessment ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>
                {config?.modules.assessment ? t('portal.settings.active') : t('portal.settings.inactive')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('portal.settings.medicalNecessity')}</span>
              <Badge variant="secondary" className={config?.modules.medical_necessity ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>
                {config?.modules.medical_necessity ? t('portal.settings.active') : t('portal.settings.inactive')}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">{t('portal.settings.fraudWasteAbuse')}</span>
              <Badge variant="secondary" className={config?.modules.fwa ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}>
                {config?.modules.fwa ? t('portal.settings.active') : t('portal.settings.inactive')}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {config?.assessmentConfig && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.settings.assessmentConfig')}</h3>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('portal.settings.benefitSchemaType')}</span>
              <span className="text-sm font-medium">{config.assessmentConfig.benefitSchemaType}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {config?.medicalNecessityConfig && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold">{t('portal.settings.medicalNecessityConfig')}</h3>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">{t('portal.settings.proModel')}</dt>
                <dd className="text-sm font-medium">{config.medicalNecessityConfig.useProModel ? t('portal.settings.enabled') : t('portal.settings.disabled')}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">{t('portal.settings.thinkingLevel')}</dt>
                <dd className="text-sm font-medium capitalize">{config.medicalNecessityConfig.thinkingLevel}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
