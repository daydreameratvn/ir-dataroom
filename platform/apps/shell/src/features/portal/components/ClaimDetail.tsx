import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Loader2, ShieldAlert } from 'lucide-react';
import { cn, PageHeader, Button, Tabs, TabsList, TabsTrigger, TabsContent } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { usePortalClaim } from '../hooks/usePortalClaim';
import { usePortalConfig } from '../hooks/usePortalConfig';
import { useExtractedData } from '../hooks/useExtractedData';
import { reprocessClaim, reprocessFWA } from '../api';
import OverviewTab from './OverviewTab';
import DocumentViewer from './DocumentViewer';
import PipelineProgress from './PipelineProgress';
import { TOOL_DESCRIPTIONS } from './PipelineProgress';
import ExtractionView from './ExtractionView';
import AssessmentView from './AssessmentView';
import MedicalNecessityView from './MedicalNecessityView';
import PreExistingView from './PreExistingView';
import FWAView from './FWAView';
import ApprovalBar from './ApprovalBar';
import type { PipelineModuleState, ExtractionSourceRef } from '../types';
import { useState, useCallback } from 'react';

interface ViewerNavigation {
  page: number;
  sourceRef?: ExtractionSourceRef;
  ts: number;
}

export default function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMockClaim = id?.startsWith('mock-claim-') ?? false;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'overview';
  const { data: claim, isLoading, error, refetch } = usePortalClaim(id!, { enabled: !isMockClaim });
  const isModuleEnabled = usePortalConfig((s) => s.isModuleEnabled);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessingFwa, setReprocessingFwa] = useState(false);
  const [viewerNav, setViewerNav] = useState<ViewerNavigation | null>(null);

  const handleNavigateToPage = useCallback((page: number, sourceRef?: ExtractionSourceRef) => {
    setViewerNav({ page, sourceRef, ts: Date.now() });
  }, []);

  // Parse structured data from claim.aiSummary
  const extractedData = useExtractedData(claim);

  function setTab(tab: string) {
    setSearchParams({ tab }, { replace: true });
  }

  async function handleReprocess() {
    if (!id || reprocessing) return;
    setReprocessing(true);
    try {
      await reprocessClaim(id);
      refetch();
    } finally {
      setReprocessing(false);
    }
  }

  async function handleReprocessFwa() {
    if (!id || reprocessingFwa) return;
    setReprocessingFwa(true);
    try {
      await reprocessFWA(id);
      refetch();
    } finally {
      setReprocessingFwa(false);
    }
  }

  const handleStatusChange = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isMockClaim) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('common.back')}
        </Button>
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16">
          <ShieldAlert className="h-12 w-12 text-muted-foreground/50" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">{t('portal.claimDetail.mockTitle')}</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {t('portal.claimDetail.mockDescription')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/fwa/fwa-analytics')}>
              {t('portal.claimDetail.backToFWA')}
            </Button>
            <Button onClick={() => navigate('/fwa/claims/new')}>
              {t('portal.claimDetail.submitRealClaim')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/fwa/claims')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('portal.claimDetail.backToClaims')}
        </Button>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : t('common.somethingWentWrong')}
        </div>
      </div>
    );
  }

  const isProcessing = ['PROCESSING', 'SUBMITTED', 'PENDING', 'ai_processing', 'submitted'].includes(claim.status);
  const isAwaitingApproval = claim.status === 'awaiting_approval';
  const hasPipelineActivity = Object.keys(extractedData.pipelineStatus).length > 0;

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/fwa/claims')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t('portal.claimDetail.backToClaims')}
        </Button>
      </div>

      <PageHeader
        title={t('portal.claimDetail.claim', { number: claim.claimNumber })}
        subtitle={isProcessing ? t('portal.claimDetail.autoRefreshing') : undefined}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocessFwa}
              disabled={reprocessingFwa || isProcessing}
            >
              {reprocessingFwa ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Reprocess FWA Only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReprocess}
              disabled={reprocessing || isProcessing}
            >
              {reprocessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t('portal.claimDetail.reprocess')}
            </Button>
          </div>
        }
      />

      {/* Pipeline Progress — visible during/after processing */}
      {(isProcessing || hasPipelineActivity) && (
        <PipelineProgress
          pipelineStatus={extractedData.pipelineStatus}
          isProcessing={isProcessing}
        />
      )}

      {/* Split layout: 35% document viewer | 65% tab content — each panel scrolls independently */}
      <div className="flex gap-4" style={{ height: 'calc(100vh - 10rem)' }}>
        {/* Document Viewer — Left panel */}
        <div className={cn('w-[35%] flex-shrink-0 overflow-hidden rounded-lg border', claim.documents.length === 0 && 'hidden lg:block')}>
          <DocumentViewer
            documents={claim.documents}
            viewerNav={viewerNav}
            classifiedDocuments={extractedData.extraction?.classifiedDocuments}
          />
        </div>

        {/* Tab content — Right panel */}
        <div className="min-w-0 flex-1 flex flex-col">
          <Tabs value={activeTab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <TabsList className="shrink-0">
              <TabsTrigger value="overview">{t('portal.claimDetail.tabs.overview')}</TabsTrigger>
              <TabsTrigger value="extraction">{t('portal.claimDetail.tabs.extraction')}</TabsTrigger>
              {isModuleEnabled('assessment') && (
                <TabsTrigger value="assessment">{t('portal.claimDetail.tabs.assessment')}</TabsTrigger>
              )}
              {isModuleEnabled('medical_necessity') && (
                <TabsTrigger value="medical-necessity">{t('portal.claimDetail.tabs.medicalNecessity')}</TabsTrigger>
              )}
              {isModuleEnabled('pre_existing') && (
                <TabsTrigger value="pre-existing">{t('portal.claimDetail.tabs.preExisting')}</TabsTrigger>
              )}
              {isModuleEnabled('fwa') && (
                <TabsTrigger value="fwa">{t('portal.claimDetail.tabs.fwa')}</TabsTrigger>
              )}
            </TabsList>

            <div className="flex-1 overflow-auto mt-4">
              <TabsContent value="overview" className="mt-0">
                <OverviewTab claim={claim} />
              </TabsContent>

              <TabsContent value="extraction" className="mt-0">
                {extractedData.pipelineStatus.extraction?.status === 'running' ? (
                  <LoadingSkeleton label="Extraction" moduleState={extractedData.pipelineStatus.extraction} />
                ) : extractedData.pipelineStatus.extraction?.status === 'error' ? (
                  <ErrorState label="Extraction" error={extractedData.pipelineStatus.extraction.error} />
                ) : (
                  <ExtractionView data={extractedData.extraction} onNavigateToPage={handleNavigateToPage} />
                )}
              </TabsContent>

              <TabsContent value="assessment" className="mt-0">
                {extractedData.pipelineStatus.assessment?.status === 'running' ? (
                  <LoadingSkeleton label="Assessment" moduleState={extractedData.pipelineStatus.assessment} />
                ) : extractedData.pipelineStatus.assessment?.status === 'error' ? (
                  <ErrorState label="Assessment" error={extractedData.pipelineStatus.assessment.error} />
                ) : (
                  <AssessmentView data={extractedData.assessment} claimId={id} treatmentType={extractedData.extraction?.extractedTreatmentInfo?.treatmentType} onSaved={handleStatusChange} />
                )}
              </TabsContent>

              <TabsContent value="medical-necessity" className="mt-0">
                {extractedData.pipelineStatus.medicalNecessity?.status === 'running' ? (
                  <LoadingSkeleton label="Medical Necessity" moduleState={extractedData.pipelineStatus.medicalNecessity} />
                ) : extractedData.pipelineStatus.medicalNecessity?.status === 'error' ? (
                  <ErrorState label="Medical Necessity" error={extractedData.pipelineStatus.medicalNecessity.error} />
                ) : (
                  <MedicalNecessityView data={extractedData.medicalNecessity} />
                )}
              </TabsContent>

              <TabsContent value="pre-existing" className="mt-0">
                {extractedData.pipelineStatus.preExisting?.status === 'running' ? (
                  <LoadingSkeleton label="Pre-Existing" moduleState={extractedData.pipelineStatus.preExisting} />
                ) : extractedData.pipelineStatus.preExisting?.status === 'error' ? (
                  <ErrorState label="Pre-Existing" error={extractedData.pipelineStatus.preExisting.error} />
                ) : (
                  <PreExistingView data={extractedData.preExisting} />
                )}
              </TabsContent>

              <TabsContent value="fwa" className="mt-0">
                {extractedData.pipelineStatus.fwa?.status === 'running' ? (
                  <LoadingSkeleton label="FWA" moduleState={extractedData.pipelineStatus.fwa} />
                ) : extractedData.pipelineStatus.fwa?.status === 'error' ? (
                  <ErrorState label="FWA" error={extractedData.pipelineStatus.fwa.error} />
                ) : (
                  <FWAView data={extractedData.fwa} claimId={id} imageForensicsData={extractedData.imageForensics} />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {/* Approval Bar — shown when claim is awaiting approval */}
      {isAwaitingApproval && (
        <ApprovalBar claimId={id!} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}

function LoadingSkeleton({ label, moduleState }: { label: string; moduleState?: PipelineModuleState }) {
  const { t } = useTranslation();
  const toolDesc = moduleState?.currentTool
    ? (TOOL_DESCRIPTIONS[moduleState.currentTool] ?? moduleState.currentTool)
    : null;
  const turnInfo = moduleState?.turnCount != null && moduleState?.maxTurns != null
    ? t('portal.claimDetail.agentTurn', { current: moduleState.turnCount, max: moduleState.maxTurns }) : null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      <p className="text-sm text-muted-foreground">{t('portal.claimDetail.agentRunning', { label })}</p>
      {toolDesc && <p className="text-xs text-blue-500">{toolDesc}</p>}
      {turnInfo && <p className="text-xs text-muted-foreground">{turnInfo}</p>}
    </div>
  );
}

function ErrorState({ label, error }: { label: string; error?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <p className="font-medium">{t('portal.claimDetail.agentFailed', { label })}</p>
      {error && <p className="mt-1 text-xs">{error}</p>}
    </div>
  );
}
