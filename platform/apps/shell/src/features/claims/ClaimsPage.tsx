import { useTranslation } from 'react-i18next';
import { FileText, Plus } from 'lucide-react';
import {
  PageHeader,
  EmptyState,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@papaya/shared-ui';

export default function ClaimsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('claims.title')}
        subtitle={t('claims.subtitle')}
        action={
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t('claims.newClaim')}
          </Button>
        }
      />
      <Tabs defaultValue="intake">
        <TabsList>
          <TabsTrigger value="intake">{t('nav.claimsIntake')}</TabsTrigger>
          <TabsTrigger value="review">{t('nav.claimsReview')}</TabsTrigger>
          <TabsTrigger value="adjudication">{t('nav.claimsAdjudication')}</TabsTrigger>
          <TabsTrigger value="history">{t('nav.claimsHistory')}</TabsTrigger>
        </TabsList>
        <TabsContent value="intake" className="mt-4">
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={t('claims.intakeTitle')}
            description={t('claims.intakeDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={t('claims.reviewTitle')}
            description={t('claims.reviewDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="adjudication" className="mt-4">
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={t('claims.adjudicationTitle')}
            description={t('claims.adjudicationDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={t('claims.historyTitle')}
            description={t('claims.historyDesc')}
            action={<Button variant="outline">{t('common.getStarted')}</Button>}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
