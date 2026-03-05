import { useMemo } from 'react';
import type {
  PortalClaim,
  ExtractedDataState,
  ExtractionResult,
  AssessmentResult,
  MedicalNecessityResult,
  PreExistingResult,
  ImageForensicsResult,
  FWAResultData,
  PipelineStatus,
} from '../types';

function parseAiSummary(claim: PortalClaim): Record<string, unknown> {
  if (!claim.aiSummary) return {};
  try {
    return JSON.parse(claim.aiSummary);
  } catch {
    return {};
  }
}

/**
 * Read a field checking namespaced location first, then flat fallback.
 */
function getField(data: Record<string, unknown>, namespace: string, field: string): unknown {
  const ns = data[namespace] as Record<string, unknown> | undefined;
  if (ns && field in ns) return ns[field];
  return data[field];
}

/**
 * Parse claim.aiSummary JSON into typed ExtractedDataState.
 * Handles both namespaced (new) and flat (legacy) formats.
 */
export function useExtractedData(claim: PortalClaim | null | undefined): ExtractedDataState {
  return useMemo(() => {
    if (!claim) {
      return {
        extraction: null,
        assessment: null,
        medicalNecessity: null,
        preExisting: null,
        imageForensics: null,
        fwa: null,
        pipelineStatus: {},
      };
    }

    const data = parseAiSummary(claim);

    // Extraction: check namespace first, then flat keys
    const extraction: ExtractionResult | null = (() => {
      const ns = data.extraction as Record<string, unknown> | undefined;
      const classifiedDocuments = (ns?.classifiedDocuments ?? data.classifiedDocuments) as ExtractionResult['classifiedDocuments'];
      const extractedTreatmentInfo = (ns?.extractedTreatmentInfo ?? data.extractedTreatmentInfo) as ExtractionResult['extractedTreatmentInfo'];
      const medicalReport = (ns?.medicalReport ?? data.medicalReport) as ExtractionResult['medicalReport'];
      const expenses = (ns?.expenses ?? data.expenses) as ExtractionResult['expenses'];
      const treatmentSummary = (ns?.treatmentSummary ?? data.treatmentSummary) as string | undefined;
      const _sources = (ns?._sources ?? data._sources) as ExtractionResult['_sources'];
      if (!classifiedDocuments && !extractedTreatmentInfo && !medicalReport && !expenses) return null;
      return { classifiedDocuments, extractedTreatmentInfo, medicalReport, expenses, treatmentSummary, _sources };
    })();

    // Assessment: check namespace first, then flat keys
    const assessment: AssessmentResult | null = (() => {
      const ns = data.assessment as Record<string, unknown> | undefined;
      const expenses = (ns?.expenses ?? (ns ? undefined : data.expenses)) as AssessmentResult['expenses'];
      const coverageAnalysis = (ns?.coverageAnalysis ?? data.coverageAnalysis) as AssessmentResult['coverageAnalysis'];
      const benefitGrouping = (ns?.benefitGrouping ?? data.benefitGrouping) as AssessmentResult['benefitGrouping'];
      const automationResult = (ns?.automationResult ?? data.automationResult) as AssessmentResult['automationResult'];
      if (!coverageAnalysis && !automationResult) return null;
      return { expenses, coverageAnalysis, benefitGrouping, automationResult };
    })();

    // Medical Necessity: check namespace first, then _mnResult fallback
    const medicalNecessity: MedicalNecessityResult | null = (() => {
      const ns = data.medicalNecessity as Record<string, unknown> | undefined;
      if (ns?.overall_tier) return ns as unknown as MedicalNecessityResult;
      const legacy = data._mnResult as Record<string, unknown> | undefined;
      if (legacy?.overall_tier) return legacy as unknown as MedicalNecessityResult;
      return null;
    })();

    // Pre-Existing: check namespace first, then _preExResult fallback
    const preExisting: PreExistingResult | null = (() => {
      const ns = data.preExisting as Record<string, unknown> | undefined;
      if (ns?.overallNonDisclosureRisk) return ns as unknown as PreExistingResult;
      const legacy = data._preExResult as Record<string, unknown> | undefined;
      if (legacy?.overallNonDisclosureRisk) return legacy as unknown as PreExistingResult;
      return null;
    })();

    // Image Forensics: check namespace
    const imageForensics: ImageForensicsResult | null = (() => {
      const ns = data.imageForensics as Record<string, unknown> | undefined;
      if (ns?.overallVerdict) return ns as unknown as ImageForensicsResult;
      return null;
    })();

    // FWA: check namespace first, then _fwaResult fallback
    const fwa: FWAResultData | null = (() => {
      const ns = data.fwa as Record<string, unknown> | undefined;
      if (ns?.riskScore != null) return ns as unknown as FWAResultData;
      const legacy = data._fwaResult as Record<string, unknown> | undefined;
      if (legacy?.riskScore != null) return legacy as unknown as FWAResultData;
      return null;
    })();

    const pipelineStatus = (data._pipelineStatus as PipelineStatus) ?? {};

    return { extraction, assessment, medicalNecessity, preExisting, imageForensics, fwa, pipelineStatus };
  }, [claim]);
}
