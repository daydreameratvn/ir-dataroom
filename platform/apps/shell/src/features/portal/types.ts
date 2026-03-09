// ─── Tenant Configuration ────────────────────────────────────────────────────

export type PortalModuleId = 'extraction' | 'assessment' | 'medical_necessity' | 'pre_existing' | 'image_forensics' | 'fwa';

export type PortalTenantModules = {
  /** Always required — runs first, output feeds downstream modules */
  extraction: true;
  /** Coverage detection + benefit grouping + recommendation */
  assessment: boolean;
  /** Medical necessity review */
  medical_necessity: boolean;
  /** Pre-existing condition & non-disclosure risk detection */
  pre_existing: boolean;
  /** Document image forensics — tampering detection */
  image_forensics: boolean;
  /** Fraud, Waste & Abuse detection */
  fwa: boolean;
};

export type PortalTenantConfig = {
  tenantId: string;
  tenantName: string;
  market: string;
  modules: PortalTenantModules;
  assessmentConfig?: {
    benefitSchemaType: 'TOYOTA_TSUSHO' | 'IA';
  };
  medicalNecessityConfig?: {
    useProModel: boolean;
    thinkingLevel: 'low' | 'medium' | 'high';
  };
};

// ─── Claim Types ─────────────────────────────────────────────────────────────

export type PortalClaimStatus =
  | 'SUBMITTED'
  | 'PROCESSING'
  | 'IN_REVIEW'
  | 'WAITING_FOR_APPROVAL'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PENDING'
  | 'SUCCESS'
  | 'ERROR'
  // Lowercase DB values returned by the API
  | 'submitted'
  | 'under_review'
  | 'ai_processing'
  | 'awaiting_approval'
  | 'adjudicated'
  | 'approved'
  | 'partially_approved'
  | 'denied'
  | 'appealed'
  | 'settled'
  | 'closed';

export type PortalClaimType =
  | 'INPATIENT'
  | 'OUTPATIENT'
  | 'DENTAL'
  | 'DAY_CASE'
  | 'MATERNITY';

export interface PortalClaimDocument {
  id: string;
  type: string;
  pageCount: number | null;
  file: {
    name: string;
    url: string;
  } | null;
}

export interface PortalClaimProcess {
  id: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
}

export interface PortalInsuredPerson {
  name: string | null;
  dob: string | null;
  gender: string | null;
}

export interface PortalClaim {
  id: string;
  claimNumber: string;
  status: PortalClaimStatus;
  type: PortalClaimType | null;
  diagnosis: string | null;
  icdCode: string | null;
  isDirectBilling: boolean;
  admissionDate: string | null;
  dischargeDate: string | null;
  hasSurgery: boolean;
  currency: string | null;
  totalRequestedAmount: number | null;
  totalCoveredAmount: number | null;
  totalPaidAmount: number | null;
  totalUncoveredAmount: number | null;
  totalShortfallAmount: number | null;
  insuredName: string | null;
  insuredPerson: PortalInsuredPerson | null;
  certificateCode: string | null;
  policyNumber: string | null;
  corporateName: string | null;
  providerName: string | null;
  documents: PortalClaimDocument[];
  processes: PortalClaimProcess[];
  extractedData: Record<string, unknown> | null;
  dateOfService: string | null;
  aiSummary: string | null;
  aiRecommendation: string | null;
  denialReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ─── Dashboard Types ─────────────────────────────────────────────────────────

export interface PortalDashboardStats {
  totalClaims: number;
  processing: number;
  awaitingApproval: number;
  approved: number;
  recentClaims: PortalClaimSummary[];
}

export interface PortalClaimSummary {
  id: string;
  claimNumber: string;
  status: PortalClaimStatus;
  type: PortalClaimType | null;
  insuredName: string | null;
  totalRequestedAmount: number | null;
  currency: string | null;
  createdAt: string;
  fwaRisk: { riskScore: number; riskLevel: string } | null;
}

// ─── Claims List Types ───────────────────────────────────────────────────────

export interface ListClaimsParams {
  page?: number;
  limit?: number;
  status?: PortalClaimStatus;
  search?: string;
}

export interface PaginatedClaims {
  data: PortalClaimSummary[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── FWA Case Types ──────────────────────────────────────────────────────────

export type FWACaseStatus = 'NEW' | 'UNDER_INVESTIGATION' | 'CONFIRMED_HIT' | 'CLEARED';

export type FWACaseEntityType = 'SINGLE_CLAIM' | 'INSURED_PERSON' | 'PROVIDER' | 'AGENCY_BROKER';

export type FWACaseActionType =
  | 'NOTE'
  | 'DOCUMENT_REQUEST'
  | 'ESCALATION'
  | 'STATUS_CHANGE'
  | 'CONFIRMATION'
  | 'CLEARANCE';

export interface FWAFlag {
  category: string;
  title: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description?: string;
  evidence?: string;
  classification?: 'FRAUD' | 'WASTE' | 'ABUSE';
}

export interface FWACaseLinkedClaim {
  id: string;
  claimCode: string;
  insuredName: string;
  providerName: string | null;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: 'CLEAR' | 'REVIEW' | 'INVESTIGATE';
  flags: FWAFlag[];
  requestedAmount: number;
  coveredAmount: number;
  createdAt: string;
  fwaConfirmed: boolean;
}

export interface FWACaseAction {
  id: string;
  caseId: string;
  type: FWACaseActionType;
  content: string;
  createdAt: string;
  createdBy: string;
}

export interface FWACase {
  id: string;
  caseCode: string;
  status: FWACaseStatus;
  entityType: FWACaseEntityType;
  entityName: string;
  entityId: string;
  linkedClaims: FWACaseLinkedClaim[];
  actions: FWACaseAction[];
  highestRiskScore: number;
  avgRiskScore: number;
  totalFlaggedAmount: number;
  flagSummary: Record<string, number>;
  aiSummary: string | null;
  aiNextSteps: string[] | null;
  aiPatterns: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface FlaggedQueueItem {
  id: string;
  claimCode: string;
  insuredName: string;
  insuredPersonId: string;
  providerName: string | null;
  providerId: string | null;
  brokerName: string | null;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation: 'CLEAR' | 'REVIEW' | 'INVESTIGATE';
  flags: FWAFlag[];
  flagCount: number;
  requestedAmount: number;
  createdAt: string;
  existingCaseId: string | null;
}

export interface FWACasesStats {
  totalFlagged: number;
  newCases: number;
  underInvestigation: number;
  confirmedHits: number;
  cleared: number;
}

export interface FWACasesResponse {
  flaggedQueue: FlaggedQueueItem[];
  cases: FWACase[];
  stats: FWACasesStats;
}

// ─── Pipeline Status Types ──────────────────────────────────────────────────

export type PipelineModuleId = 'extraction' | 'assessment' | 'medicalNecessity' | 'preExisting' | 'imageForensics' | 'fwa';

export interface PipelineModuleState {
  status: 'pending' | 'running' | 'completed' | 'error';
  startedAt?: string;
  completedAt?: string;
  error?: string;
  notes?: string;
  turnCount?: number;
  maxTurns?: number;
  currentTool?: string;
}

export type PipelineStatus = Partial<Record<PipelineModuleId | 'pipeline' | 'approval', PipelineModuleState>>;

// ─── Document Classification ─────────────────────────────────────────────────

export interface DocumentClassification {
  type: string;
  pageNumbers?: number[];
  summary: string | null;
  duplicatedPages: number[] | null;
  hasFile?: boolean;
  readabilityScore?: number;
  readabilityIssues?: string[];
}

// ─── Structured Result Types ────────────────────────────────────────────────

export interface TreatmentInfo {
  patientName: string | null;
  patientDOB: string | null;
  patientGender: 'MALE' | 'FEMALE' | null;
  patientAddress: string | null;
  treatmentType: 'INPATIENT' | 'OUTPATIENT' | 'DENTAL' | null;
  admissionDate: string | null;
  dischargeDate: string | null;
  diagnosis: string | null;
  icdCode: string | null;
  inferenceIcdCode: string | null;
  icd9Code: string | null;
  inferenceIcd9Code: string | null;
  medicalProviderName: string | null;
  totalPayableAmount: number | null;
  invoiceNumber: string | null;
  doctorNames: string[];
  surgeries: Array<{ date: string; operationName: string }>;
  treatmentSummary: string | null;
}

export interface MedicalReport {
  chiefComplaint: string | null;
  indicationForAdmission: string | null;
  causeOfInjury: string | null;
  initialDiagnosis: string | null;
  finalDiagnoses: Array<{
    name: string;
    icdCode: string | null;
    inferenceIcdCode?: string | null;
    icd9Code: string | null;
    inferenceIcd9Code?: string | null;
  }>;
  underlyingConditions: string | null;
  vitalSigns: Record<string, unknown> | null;
  treatmentPlan: string | null;
  hospitalCourse: string | null;
  investigations: string | null;
  treatments: string | null;
  treatmentOutcome: string | null;
}

export interface ExpenseItem {
  id: string;
  name: string;
  total_amount: number;
  gross_amount: number;
  discount_amount?: number;
  payable_amount?: number;
  is_covered: boolean;
  coverageReasoning?: string | null;
  itemLevel: 'summary' | 'detail';
  parentId: string | null;
  date?: string | null;
  type?: string | null;
  groupCategory?: string | null;
}

export interface ExpensesData {
  mode: 'summary' | 'detail' | 'combined';
  items: ExpenseItem[];
  totalPayable: number;
  totalGross: number;
}

export interface CoverageAnalysis {
  totalRequested: number;
  totalCovered: number;
  totalUncovered: number;
  coveredItemCount: number;
  uncoveredItemCount: number;
}

export interface BenefitGroup {
  benefitCode: string;
  benefitName: string;
  itemCount: number;
  totalAmount: number;
  items: Array<{ id: string; name: string; amount: number }>;
}

export interface AssessmentRecommendation {
  recommendation: 'APPROVE' | 'REVIEW' | 'REJECT';
  confidence: number;
  summary: string;
  completedAt: string;
}

export interface ExtractionSourceRef {
  pages: number[];
  docType: string;
  text?: string;
  bbox?: { x: number; y: number; w: number; h: number };
}

export interface ExtractionResult {
  classifiedDocuments?: DocumentClassification[];
  extractedTreatmentInfo?: TreatmentInfo;
  medicalReport?: MedicalReport;
  expenses?: ExpensesData;
  treatmentSummary?: string;
  _sources?: Record<string, ExtractionSourceRef>;
}

export interface AssessmentResult {
  expenses?: ExpensesData;
  coverageAnalysis?: CoverageAnalysis;
  benefitGrouping?: { benefitGroups: BenefitGroup[] };
  automationResult?: AssessmentRecommendation;
}

export interface MedicalNecessityItem {
  item_name: string;
  item_type: 'drug' | 'procedure' | 'diagnostic' | 'los' | 'other';
  tier: string;
  finding: string;
  flags?: string[];
  amount_claimed?: number;
  reference_range?: string;
}

export interface MedicalNecessityAttentionSummary {
  needs_attention: boolean;
  flagged_count: number;
  summary_text: string;
  not_necessary_count?: number;
  not_necessary_amount?: number;
  questionable_count?: number;
  questionable_amount?: number;
  total_flagged_amount?: number;
}

export interface MedicalNecessityResult {
  overall_tier: string;
  adjustedItems: MedicalNecessityItem[];
  attention_summary: string | MedicalNecessityAttentionSummary | null;
  recommendations: string | string[] | null;
  report_markdown: string | null;
  completedAt: string;
}

export interface PreExistingEvidence {
  source: 'claim_history' | 'current_document' | 'medication' | 'clinical_phrase';
  description: string;
  date: string | null;
  claimCode: string | null;
}

export interface PreExistingFinding {
  conditionName: string;
  icdCodes: string[];
  category: string;
  assessmentTier: 'CONFIRMED' | 'SUSPECTED' | 'UNLIKELY';
  reasoning: string;
  evidence: PreExistingEvidence[];
  firstAppearanceDate: string | null;
  policyEffectiveDate: string | null;
  daysSincePolicyStart: number | null;
  waitingPeriodDays: number;
  waitingPeriodType: 'general' | 'specific';
  isWithinWaitingPeriod: boolean;
  medicationEvidence: string[];
  documentPhraseEvidence: string[];
  [key: string]: unknown;
}

export interface PreExistingResult {
  findings: PreExistingFinding[];
  overallNonDisclosureRisk: string;
  nonDisclosureRiskScore: number;
  nonDisclosureReasoning: string;
  reportMarkdown: string | null;
  completedAt: string;
  timelineData?: Record<string, unknown>;
}

export type ImageForensicsVerdict = 'AUTHENTIC' | 'SUSPICIOUS' | 'TAMPERED';

export interface ImageForensicsAnomaly {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  location?: string;
}

export interface ImageForensicsRiskyField {
  type: string;
  text: string;
  anomalyScore: number;
}

export interface ImageForensicsDocumentFinding {
  documentType: string;
  pageNumbers: number[];
  verdict: ImageForensicsVerdict;
  anomalies: ImageForensicsAnomaly[];
  /** Raw 0-1 score from forensics engine (0 = authentic, 1 = tampered) */
  overallScore?: number;
  riskLevel?: string;
  truforGlobalScore?: number;
  fieldsAnalyzed?: number;
  /** Top risky fields sorted by anomaly score desc */
  topRiskyFields?: ImageForensicsRiskyField[];
  /** Base64-encoded heatmap summary image */
  heatmapBase64?: string | null;
}

export interface ImageForensicsResult {
  overallVerdict: ImageForensicsVerdict;
  confidenceScore: number;
  documentFindings: ImageForensicsDocumentFinding[];
  summary: string;
  reportMarkdown: string | null;
  totalDocumentsAnalyzed: number;
  totalAnomaliesFound: number;
  completedAt: string;
}

export interface FWAResultData {
  riskScore: number;
  riskLevel: string;
  flags: FWAFlag[];
  recommendation: string;
  summary: string;
  reportMarkdown: string | null;
  completedAt: string;
}

export interface ExtractedDataState {
  extraction: ExtractionResult | null;
  assessment: AssessmentResult | null;
  medicalNecessity: MedicalNecessityResult | null;
  preExisting: PreExistingResult | null;
  imageForensics: ImageForensicsResult | null;
  fwa: FWAResultData | null;
  pipelineStatus: PipelineStatus;
}

// ─── FWA Analytics Types ─────────────────────────────────────────────────────

export type FWAClassificationType = 'FRAUD' | 'WASTE' | 'ABUSE';

export type FWAResolutionStatus = 'IDENTIFIED' | 'CONFIRMED' | 'CLEARED';

export type FWAGroupBy = 'day' | 'week' | 'month';

export interface FWAAnalyticsSummary {
  totalAnalyzed: number;
  avgRiskScore: number;
  detectionRate: number;
  highCriticalCount: number;
  totalClaimsValue: number;
  totalValueSaved: number;
  totalFraudDeclined: number;
  totalWADenied: number;
  casesIdentified: number;
  casesConfirmed: number;
}

export interface FWAClassificationItem {
  type: FWAClassificationType;
  identified: number;
  confirmed: number;
  totalValue: number;
  deniedValue: number;
}

export interface FWAFinancialTrend {
  date: string;
  totalValue: number;
  flaggedValue: number;
  savedValue: number;
}

export interface FWATopFlaggedClaim {
  id: string;
  claimCode: string;
  insuredName: string;
  riskScore: number;
  riskLevel: string;
  recommendation: string;
  flagCount: number;
  flags: FWAFlag[];
  createdAt: string;
  requestedAmount: number;
  coveredAmount: number;
  fwaClassification?: FWAClassificationType;
  resolutionStatus?: FWAResolutionStatus;
}

export interface FWAHotspotProvince {
  name: string;
  nameTh: string;
  totalClaims: number;
  flaggedClaims: number;
  flaggedAmount: number;
  detectionRate: number;
  avgRiskScore: number;
}

export interface FWAHotspotEntry {
  name: string;
  province?: string;
  totalClaims: number;
  flaggedClaims: number;
  flaggedAmount: number;
  detectionRate: number;
}

export interface FWAAnalyticsData {
  summary: FWAAnalyticsSummary;
  riskDistribution: Array<{ riskLevel: string; count: number }>;
  flagsByCategory: Array<{ category: string; count: number }>;
  recommendations: Array<{ recommendation: string; count: number }>;
  riskTrends: Array<{ date: string; low: number; medium: number; high: number; critical: number }>;
  fwaClassification?: FWAClassificationItem[];
  financialTrends?: FWAFinancialTrend[];
  topFlaggedClaims: FWATopFlaggedClaim[];
  hotspots?: {
    byProvince: FWAHotspotProvince[];
    byCity: FWAHotspotEntry[];
    byProvider: FWAHotspotEntry[];
    byBroker: FWAHotspotEntry[];
  };
}

// ─── Display Constants ───────────────────────────────────────────────────────

export const CLAIM_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-100 text-blue-700' },
  PROCESSING: { label: 'Processing', className: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'In Review', className: 'bg-amber-100 text-amber-700' },
  WAITING_FOR_APPROVAL: { label: 'Awaiting Approval', className: 'bg-amber-100 text-amber-700' },
  AWAITING_APPROVAL: { label: 'Awaiting Approval', className: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  PENDING: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  SUCCESS: { label: 'Success', className: 'bg-emerald-100 text-emerald-700' },
  ERROR: { label: 'Error', className: 'bg-red-100 text-red-700' },
};

export const CLAIM_TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  INPATIENT: { label: 'Inpatient', className: 'bg-purple-100 text-purple-700' },
  OUTPATIENT: { label: 'Outpatient', className: 'bg-cyan-100 text-cyan-700' },
  DENTAL: { label: 'Dental', className: 'bg-lime-100 text-lime-700' },
  DAY_CASE: { label: 'Day Case', className: 'bg-blue-100 text-blue-700' },
  MATERNITY: { label: 'Maternity', className: 'bg-pink-100 text-pink-700' },
};

export const FWA_CASE_STATUS_CONFIG: Record<FWACaseStatus, { label: string; className: string }> = {
  NEW: { label: 'New', className: 'bg-blue-100 text-blue-700' },
  UNDER_INVESTIGATION: { label: 'Under Investigation', className: 'bg-amber-100 text-amber-700' },
  CONFIRMED_HIT: { label: 'Confirmed Hit', className: 'bg-red-100 text-red-700' },
  CLEARED: { label: 'Cleared', className: 'bg-emerald-100 text-emerald-700' },
};

export const RISK_LEVEL_CLASSES: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export const FWA_CLASSIFICATION_CONFIG: Record<FWAClassificationType, { label: string; color: string; className: string }> = {
  FRAUD: { label: 'Fraud', color: '#ef4444', className: 'bg-red-100 text-red-700' },
  WASTE: { label: 'Waste', color: '#f59e0b', className: 'bg-amber-100 text-amber-700' },
  ABUSE: { label: 'Abuse', color: '#f97316', className: 'bg-orange-100 text-orange-700' },
};

export const FWA_RESOLUTION_STATUS_CONFIG: Record<FWAResolutionStatus, { label: string; className: string }> = {
  IDENTIFIED: { label: 'Identified', className: 'bg-blue-100 text-blue-700' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-red-100 text-red-700' },
  CLEARED: { label: 'Cleared', className: 'bg-emerald-100 text-emerald-700' },
};

export const FWA_CATEGORY_COLORS: Record<string, string> = {
  'Billing Irregularities': '#ef4444',
  'Service Patterns': '#f97316',
  'Identity & Eligibility': '#8b5cf6',
  'Clinical Inconsistencies': '#3b82f6',
  'Provider Behavior': '#f59e0b',
  'Documentation Issues': '#6366f1',
  'Timing Anomalies': '#ec4899',
};

export const FWA_RECOMMENDATION_CONFIG: Record<string, { label: string; color: string; className: string }> = {
  CLEAR: { label: 'Clear', color: '#10b981', className: 'bg-emerald-100 text-emerald-700' },
  REVIEW: { label: 'Review', color: '#f59e0b', className: 'bg-amber-100 text-amber-700' },
  INVESTIGATE: { label: 'Investigate', color: '#ef4444', className: 'bg-red-100 text-red-700' },
};
