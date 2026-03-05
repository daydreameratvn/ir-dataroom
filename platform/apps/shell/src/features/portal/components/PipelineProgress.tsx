import { useState, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import type { PipelineStatus, PipelineModuleId, PipelineModuleState } from '../types';

interface PipelineProgressProps {
  pipelineStatus: PipelineStatus;
  isProcessing: boolean;
}

interface StepDef {
  id: PipelineModuleId;
  labelKey: string;
}

const STEPS: StepDef[] = [
  { id: 'extraction', labelKey: 'portal.pipeline.extraction' },
  { id: 'assessment', labelKey: 'portal.pipeline.assessment' },
  { id: 'medicalNecessity', labelKey: 'portal.pipeline.medicalNecessity' },
  { id: 'preExisting', labelKey: 'portal.pipeline.preExisting' },
  // { id: 'imageForensics', labelKey: 'portal.pipeline.imageForensics' }, // hidden until forensic agent is integrated
  { id: 'fwa', labelKey: 'portal.pipeline.fwa' },
];

export const TOOL_DESCRIPTIONS: Record<string, string> = {
  // Extraction
  fetch_claim: 'portal.pipeline.tools.fetchClaim',
  read_document: 'portal.pipeline.tools.readDocuments',
  classify_documents: 'portal.pipeline.tools.classifyDocuments',
  validate_document_completeness: 'portal.pipeline.tools.validateCompleteness',
  extract_treatment_info: 'portal.pipeline.tools.extractTreatmentInfo',
  extract_medical_report: 'portal.pipeline.tools.extractMedicalReport',
  extract_expenses: 'portal.pipeline.tools.extractExpenses',
  // Assessment
  fetch_claim_for_assessment: 'portal.pipeline.tools.loadClaimData',
  detect_expense_coverage: 'portal.pipeline.tools.analyzeCoverage',
  group_expenses_by_benefit: 'portal.pipeline.tools.groupByBenefit',
  save_assessment_result: 'portal.pipeline.tools.saveResults',
  // Medical Necessity
  fetch_claim_for_mn: 'portal.pipeline.tools.loadClaimDataMn',
  th_check_diagnosis_drug_compatibility: 'portal.pipeline.tools.checkDrugCompatibility',
  th_check_duplicate_billing: 'portal.pipeline.tools.checkDuplicateBilling',
  th_compare_billing_amounts: 'portal.pipeline.tools.compareBillingAmounts',
  th_lookup_moph_guidelines: 'portal.pipeline.tools.lookupGuidelines',
  th_save_medical_necessity_report: 'portal.pipeline.tools.saveReport',
  // Pre-Existing
  fetch_claim_history: 'portal.pipeline.tools.fetchClaimHistory',
  fetch_certificate_and_policy_details: 'portal.pipeline.tools.loadPolicyDetails',
  lookup_chronic_condition_reference: 'portal.pipeline.tools.checkChronicConditions',
  save_pre_existing_result: 'portal.pipeline.tools.saveAnalysis',
  // Image Forensics
  fetch_documents_for_analysis: 'portal.pipeline.tools.fetchDocuments',
  save_image_forensics_result: 'portal.pipeline.tools.saveForensicsResult',
  // FWA
  fetch_claim_with_all_results: 'portal.pipeline.tools.loadAllResults',
  fetch_certificate_details: 'portal.pipeline.tools.loadCertificate',
  save_fwa_result: 'portal.pipeline.tools.saveFwaResult',
};

function snakeToTitleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function useElapsedTime(startedAt: string | undefined, isRunning: boolean): string | null {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt || !isRunning) {
      setElapsed(null);
      return;
    }

    function tick() {
      const diff = Math.floor((Date.now() - new Date(startedAt!).getTime()) / 1000);
      setElapsed(Math.max(0, diff));
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isRunning]);

  if (elapsed == null) return null;
  return formatElapsed(elapsed);
}

function formatDuration(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt || !completedAt) return null;
  const diff = Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  return formatElapsed(Math.max(0, diff));
}

function getStepStatus(pipelineStatus: PipelineStatus, stepId: PipelineModuleId) {
  return pipelineStatus[stepId]?.status ?? 'pending';
}

function StepIcon({ status, stepNumber }: { status: string; stepNumber: number }) {
  if (status === 'completed') {
    return <Check className="h-4 w-4 text-white" />;
  }
  if (status === 'error') {
    return <X className="h-4 w-4 text-white" />;
  }
  if (status === 'running') {
    return <Loader2 className="h-4 w-4 text-white animate-spin" />;
  }
  return <span className="text-xs font-semibold text-gray-500">{stepNumber}</span>;
}

function StepDetail({ moduleState }: { moduleState?: PipelineModuleState }) {
  const { t } = useTranslation();
  const isRunning = moduleState?.status === 'running';
  const elapsedStr = useElapsedTime(moduleState?.startedAt, isRunning);

  if (!moduleState) return null;

  if (isRunning) {
    const toolKey = moduleState.currentTool ? TOOL_DESCRIPTIONS[moduleState.currentTool] : null;
    const toolDesc = toolKey ? t(toolKey) : (moduleState.currentTool ? snakeToTitleCase(moduleState.currentTool) : null);
    const turnInfo = moduleState.turnCount != null && moduleState.maxTurns != null
      ? t('portal.pipeline.turn', { current: moduleState.turnCount, max: moduleState.maxTurns }) : null;

    return (
      <div className="mt-1 flex flex-col items-center gap-0.5">
        {elapsedStr && <span className="text-[10px] text-blue-500 tabular-nums">{elapsedStr}</span>}
        {toolDesc && <span className="text-[10px] text-blue-400 max-w-[100px] truncate text-center">{toolDesc}</span>}
        {turnInfo && <span className="text-[10px] text-gray-400 tabular-nums">{turnInfo}</span>}
      </div>
    );
  }

  if (moduleState.status === 'completed') {
    const duration = formatDuration(moduleState.startedAt, moduleState.completedAt);
    if (!duration) return null;
    return (
      <div className="mt-1 flex flex-col items-center">
        <span className="text-[10px] text-emerald-500 tabular-nums">{duration}</span>
      </div>
    );
  }

  return null;
}

export default function PipelineProgress({ pipelineStatus, isProcessing }: PipelineProgressProps) {
  const { t } = useTranslation();

  const hasActivity = Object.values(pipelineStatus).some(
    (mod) => mod && mod.status !== 'pending',
  );

  if (!isProcessing && !hasActivity) {
    return null;
  }

  return (
    <div className="w-full py-4">
      <div className="flex items-start justify-between">
        {STEPS.map((step, index) => {
          const status = getStepStatus(pipelineStatus, step.id);
          const moduleState = pipelineStatus[step.id];

          return (
            <div key={step.id} className="flex flex-1 items-start">
              {/* Step circle + label + detail */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                    status === 'pending' && 'border-gray-300 bg-white',
                    status === 'running' && 'border-blue-500 bg-blue-500 animate-pulse',
                    status === 'completed' && 'border-emerald-500 bg-emerald-500',
                    status === 'error' && 'border-red-500 bg-red-500',
                  )}
                >
                  <StepIcon status={status} stepNumber={index + 1} />
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center max-w-[80px]',
                    status === 'pending' && 'text-gray-400',
                    status === 'running' && 'text-blue-600',
                    status === 'completed' && 'text-emerald-600',
                    status === 'error' && 'text-red-600',
                  )}
                >
                  {t(step.labelKey)}
                </span>
                <StepDetail moduleState={moduleState} />
              </div>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div className="mt-4 flex-1 px-2">
                  <div
                    className={cn(
                      'h-0.5 w-full rounded',
                      status === 'completed' ? 'bg-emerald-400' : 'bg-gray-200',
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
