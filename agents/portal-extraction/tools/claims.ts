import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getDocumentProxy, extractText, renderPageAsImage, createIsomorphicCanvasFactory } from "unpdf";
import { gqlQuery } from "../../shared/graphql-client.ts";
import { reconcileToTotal, batchLookupIcd9, lookupIcd9FromIcd10 } from "../../shared/csv-data.ts";

// ─── S3 Client ───────────────────────────────────────────────────────────────

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-southeast-1" });
  }
  return _s3;
}

const S3_BUCKET = process.env.PORTAL_S3_BUCKET ?? "banyan-portal-documents";

// ─── GraphQL Queries & Mutations ─────────────────────────────────────────────

const FETCH_CLAIM_QUERY = `
  query FetchClaimForExtraction($id: Uuid!) {
    claimsById(id: $id) {
      id
      claimNumber
      status
      claimantName
      amountClaimed
      currency
      dateOfService
      providerName
      aiSummary
      claimDocuments {
        id
        documentType
        fileName
        fileUrl
      }
    }
  }
`;

const UPDATE_AI_SUMMARY_MUTATION = `
  mutation UpdateAiSummary($id: Uuid!, $updateColumns: UpdateClaimsByIdUpdateColumnsInput!) {
    updateClaimsById(keyId: $id, updateColumns: $updateColumns) {
      affectedRows
    }
  }
`;

// ─── Helper: Incremental JSON Update via aiSummary ──────────────────────────
// TODO: Switch back to extractedData (jsonb) once the field is deployed to DDN.
// Using aiSummary (text) as a temporary JSON store for inter-agent communication.

// Write queue per claim — serializes concurrent writes to prevent race conditions
// when parallel agents (assessment + medical necessity) write to the same claim.
const claimWriteQueues = new Map<string, Promise<void>>();

async function mergeExtractedData(
  claimId: string,
  patch: Record<string, unknown>,
  namespace?: string,
): Promise<void> {
  // Chain writes for the same claim through a promise queue
  const prev = claimWriteQueues.get(claimId) ?? Promise.resolve();
  const next = prev.then(async () => {
    // Read current aiSummary, parse as JSON
    const data = await gqlQuery<{ claimsById: { aiSummary: string | null } }>(
      `query ReadAiSummary($id: Uuid!) { claimsById(id: $id) { aiSummary } }`,
      { id: claimId },
    );
    let current: Record<string, unknown> = {};
    if (data.claimsById?.aiSummary) {
      try { current = JSON.parse(data.claimsById.aiSummary); } catch { /* not JSON yet */ }
    }

    if (namespace) {
      // Namespace-isolated merge: only touches the agent's own key
      const existing = (current[namespace] as Record<string, unknown>) ?? {};
      current[namespace] = { ...existing, ...patch };
    } else {
      // Legacy flat merge (for _pipelineStatus and backward compat)
      Object.assign(current, patch);
    }

    await gqlQuery(UPDATE_AI_SUMMARY_MUTATION, {
      id: claimId,
      updateColumns: {
        aiSummary: { set: JSON.stringify(current) },
      },
    });
  }).catch((err) => {
    console.error(`[mergeExtractedData] Failed for claim ${claimId}, namespace ${namespace}:`, err);
    throw err;
  });
  claimWriteQueues.set(claimId, next.catch(() => {})); // prevent queue from breaking on error
  await next;
}

/** Parse aiSummary text field as JSON extracted data object */
function parseExtractedData(aiSummary: unknown): Record<string, unknown> {
  if (typeof aiSummary === "string" && aiSummary) {
    try { return JSON.parse(aiSummary); } catch { /* not JSON */ }
  }
  if (aiSummary && typeof aiSummary === "object") return aiSummary as Record<string, unknown>;
  return {};
}

/**
 * Read a field from parsed aiSummary, checking namespaced location first then flat fallback.
 * Supports reading from `data[namespace][field]` (new) or `data[field]` (legacy).
 */
function getExtractedField(data: Record<string, unknown>, namespace: string, field: string): unknown {
  const ns = data[namespace] as Record<string, unknown> | undefined;
  if (ns && field in ns) return ns[field];
  return data[field]; // flat fallback
}

// ─── Tool Factory ────────────────────────────────────────────────────────────

export function createExtractionTools(claimId: string) {

// ─── Tool 1: Fetch Claim ─────────────────────────────────────────────────────

const fetchClaimTool: AgentTool = {
  name: "fetch_claim",
  label: "Fetch Claim",
  description: "Retrieve claim details and attached documents for extraction",
  parameters: Type.Object({
    claimId: Type.String({ description: "The claim ID to fetch" }),
  }),
  async execute(_toolCallId, params) {
    const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
      FETCH_CLAIM_QUERY,
      { id: params.claimId },
    );

    const docs = (data.claimsById as any)?.claimDocuments ?? [];
    return {
      content: [{ type: "text", text: `${JSON.stringify(data.claimsById, null, 2)}\n\n→ NEXT STEP: Call read_document for each document with a fileUrl (${docs.length} document(s) found).` }],
      details: { claimId: params.claimId },
    };
  },
};

// ─── Tool 2: Read Document ───────────────────────────────────────────────────

const readDocumentTool: AgentTool = {
  name: "read_document",
  label: "Read Document",
  description: "Download and read an uploaded document (PDF or image) from S3 storage. Returns the actual file content for analysis.",
  parameters: Type.Object({
    fileUrl: Type.String({ description: "The fileUrl of the document (from fetch_claim results)" }),
    fileName: Type.String({ description: "The filename for context" }),
  }),
  async execute(_toolCallId, params) {
    try {
      const url = new URL(params.fileUrl);
      const key = decodeURIComponent(url.pathname.slice(1));
      const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
      const response = await getS3().send(command);
      const s3Body = await response.Body?.transformToByteArray();
      if (!s3Body) {
        return {
          content: [{ type: "text", text: `Failed to read document: ${params.fileName} — empty response` }],
          details: { error: "Empty S3 response" },
        };
      }
      const body = s3Body;
      const contentType = response.ContentType ?? "application/octet-stream";

      if (body.length > 10 * 1024 * 1024) {
        return {
          content: [{ type: "text", text: `Document ${params.fileName} is too large (${(body.length / 1024 / 1024).toFixed(1)}MB). Only metadata is available.` }],
          details: { fileName: params.fileName, size: body.length },
        };
      }

      const base64 = Buffer.from(body).toString("base64");

      // Image files — return as pi-ai ImageContent
      if (contentType.startsWith("image/")) {
        return {
          content: [
            { type: "text", text: `Document: ${params.fileName} (${contentType}, ${(body.length / 1024).toFixed(0)}KB)\n→ NEXT STEP: After reading ALL documents, call classify_documents to classify each page type.` },
            { type: "image", data: base64, mimeType: contentType },
          ],
          details: { fileName: params.fileName, contentType, size: body.length },
        };
      }

      // PDF files — extract text + render pages as images for visual analysis
      if (contentType === "application/pdf") {
        const pdfData = new Uint8Array(body);
        let extractedText = "";
        let pageCount = 0;

        // Create proxy once with canvasFactory — passing it (instead of raw bytes) to
        // extractText and renderPageAsImage avoids Bun structuredClone errors, and
        // including canvasFactory prevents pdfjs from falling back to NodePackages.get("canvas")
        const canvasFactory = await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"));
        const proxy = await getDocumentProxy(pdfData, { canvasFactory });
        pageCount = proxy.numPages;

        // Text extraction via unpdf's serverless pdfjs build
        try {
          const textResult = await extractText(proxy, { mergePages: true });
          extractedText = textResult.text?.trim() ?? "";
        } catch (err) {
          console.warn(`[read_document] ${params.fileName}: text extraction failed:`, err instanceof Error ? err.message : err);
        }

        const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

        // Render pages as images
        try {
          const pagesToRender = Math.min(pageCount, 10);

          const header = extractedText.length > 50
            ? `Document: ${params.fileName} (PDF, ${pageCount} pages, ${(body.length / 1024).toFixed(0)}KB)\n\n--- Extracted Text ---\n${extractedText}`
            : `Document: ${params.fileName} (PDF, ${pageCount} pages, ${(body.length / 1024).toFixed(0)}KB)`;
          content.push({ type: "text", text: `${header}\n\n→ NEXT STEP: After reading ALL documents, call classify_documents to classify each page type.` });

          for (let i = 1; i <= pagesToRender; i++) {
            const imgBuffer = await renderPageAsImage(proxy, i, {
              canvas: () => import("@napi-rs/canvas"),
              width: 800,
            });
            const pageBase64 = Buffer.from(imgBuffer).toString("base64");
            console.log(`[read_document] Page ${i}: ${(pageBase64.length * 0.75 / 1024 / 1024).toFixed(2)}MB`);
            content.push({ type: "image", data: pageBase64, mimeType: "image/png" });
          }
        } catch (err) {
          console.warn(`[read_document] ${params.fileName}: page rendering failed:`, err instanceof Error ? err.message : err);
          // Fall back to text-only
          if (extractedText.length > 50) {
            content.push({ type: "text", text: `Document: ${params.fileName} (PDF, ${pageCount} pages, ${(body.length / 1024).toFixed(0)}KB)\n\n--- Extracted Text ---\n${extractedText}\n\n→ NEXT STEP: After reading ALL documents, call classify_documents to classify each page type.` });
          } else {
            content.push({ type: "text", text: `Document: ${params.fileName} (PDF) — Could not extract text or render images. Proceed with claim metadata.\n\n→ NEXT STEP: After reading ALL documents, call classify_documents to classify each page type.` });
          }
        }

        return {
          content,
          details: { fileName: params.fileName, contentType, size: body.length, pages: pageCount },
        };
      }

      if (contentType.startsWith("text/")) {
        const text = new TextDecoder().decode(body);
        return {
          content: [{ type: "text", text: `Document: ${params.fileName}\n\n${text}` }],
          details: { fileName: params.fileName, contentType, size: body.length },
        };
      }

      return {
        content: [{ type: "text", text: `Document ${params.fileName} has type ${contentType} which cannot be read directly. Use the metadata from fetch_claim instead.` }],
        details: { fileName: params.fileName, contentType },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return {
        content: [{ type: "text", text: `Error reading document ${params.fileName}: ${message}` }],
        details: { error: message },
      };
    }
  },
};

// ─── Tool 3: Classify Documents ──────────────────────────────────────────────

const classifyDocumentsTool: AgentTool = {
  name: "classify_documents",
  label: "Classifying Documents",
  description:
    "Classify uploaded claim document pages into types (Bill, ClaimForm, DischargePaper, " +
    "MedicalCertificate, Prescription, OPDCard, SurgicalReport, LabTestReport, etc.). " +
    "Also identifies detail bill pages with itemized line items. " +
    "Call this AFTER reading documents and BEFORE extraction.",
  parameters: Type.Object({
    classifiedDocuments: Type.Array(
      Type.Object({
        type: Type.String({ description: "Document type name (e.g., Bill, ClaimForm, DischargePaper, MedicalCertificate, Prescription, OPDCard, SurgicalReport, LabTestReport)" }),
        pageNumbers: Type.Array(Type.Number(), { description: "1-indexed page numbers belonging to this document type" }),
        summary: Type.Union([Type.String(), Type.Null()], { description: "Brief summary of this document's content (patient name, dates, key findings)" }),
        duplicatedPages: Type.Union([Type.Array(Type.Number()), Type.Null()], { description: "Page numbers that appear to be duplicates. null if no duplicates." }),
        readabilityScore: Type.Number({ description: "Document readability: 1=illegible, 2=poor, 3=fair, 4=good, 5=excellent" }),
        readabilityIssues: Type.Array(Type.String(), { description: "Specific quality issues: e.g. 'Handwritten text', 'Blurry scan', 'Faded thermal paper', 'Stamp occlusion', 'Low resolution', 'Skewed pages'" }),
      }),
      { description: "Structured classification results from analyzing the documents." },
    ),
  }),
  async execute(_toolCallId, params) {
    await mergeExtractedData(claimId, {
      classifiedDocuments: params.classifiedDocuments,
    }, "extraction");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          documentCount: params.classifiedDocuments.length,
          documents: params.classifiedDocuments,
        }, null, 2),
      }],
      details: { claimId, documentCount: params.classifiedDocuments.length },
    };
  },
};

// ─── Tool 4: Validate Document Completeness ──────────────────────────────────

const validateDocumentCompletenessTool: AgentTool = {
  name: "validate_document_completeness",
  label: "Validating Document Completeness",
  description:
    "Check if all required documents are present for the given treatment type. " +
    "INPATIENT requires: Bill/Invoice, DischargePaper, MedicalCertificate. " +
    "OUTPATIENT requires: Bill/Invoice, Prescription or MedicalCertificate. " +
    "DENTAL requires: Bill/Invoice, DentalRecord or MedicalCertificate.",
  parameters: Type.Object({
    treatmentType: Type.Union([
      Type.Literal("INPATIENT"),
      Type.Literal("OUTPATIENT"),
      Type.Literal("DENTAL"),
    ], { description: "Treatment type" }),
    classifiedDocumentTypes: Type.Array(Type.String(), {
      description: "List of document types found in classification",
    }),
  }),
  async execute(_toolCallId, params) {
    const types = new Set(params.classifiedDocumentTypes.map(t => t.toLowerCase()));

    const missingDocs: { type: string; severity: "CRITICAL" | "WARNING"; description: string }[] = [];

    if (!types.has("bill") && !types.has("invoice") && !types.has("receipt") && !types.has("billpages")) {
      missingDocs.push({
        type: "Bill/Invoice",
        severity: "CRITICAL",
        description: "No medical bill or invoice found. This is required for all claim types.",
      });
    }

    if (params.treatmentType === "INPATIENT") {
      if (!types.has("dischargedpaper") && !types.has("dischargepaper") && !types.has("dischargedpaperpages")) {
        missingDocs.push({
          type: "DischargePaper",
          severity: "CRITICAL",
          description: "No discharge paper found. Required for inpatient claims.",
        });
      }
      if (!types.has("medicalcertificate") && !types.has("medicalcertificatepages")) {
        missingDocs.push({
          type: "MedicalCertificate",
          severity: "WARNING",
          description: "No medical certificate found. Recommended for inpatient claims.",
        });
      }
    }

    if (params.treatmentType === "OUTPATIENT") {
      const hasPrescription = types.has("prescription") || types.has("prescriptionpages");
      const hasMedCert = types.has("medicalcertificate") || types.has("medicalcertificatepages");
      if (!hasPrescription && !hasMedCert) {
        missingDocs.push({
          type: "Prescription or MedicalCertificate",
          severity: "WARNING",
          description: "No prescription or medical certificate found. At least one is recommended for outpatient claims.",
        });
      }
    }

    if (params.treatmentType === "DENTAL") {
      const hasDental = types.has("dentalrecord");
      const hasMedCert = types.has("medicalcertificate") || types.has("medicalcertificatepages");
      if (!hasDental && !hasMedCert) {
        missingDocs.push({
          type: "DentalRecord or MedicalCertificate",
          severity: "WARNING",
          description: "No dental record or medical certificate found. Recommended for dental claims.",
        });
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          isComplete: missingDocs.filter(d => d.severity === "CRITICAL").length === 0,
          missingDocuments: missingDocs,
          documentTypesFound: params.classifiedDocumentTypes,
        }, null, 2),
      }],
      details: { treatmentType: params.treatmentType, isComplete: missingDocs.filter(d => d.severity === "CRITICAL").length === 0 },
    };
  },
};

// ─── Tool 5: Lookup ICD Codes ─────────────────────────────────────────────────

const lookupIcdCodesTool: AgentTool = {
  name: "lookup_icd_codes",
  label: "Looking Up ICD Code Mappings",
  description:
    "Look up ICD-10 → ICD-9-CM mappings from the Thailand reference table. " +
    "Call this with all ICD-10 codes found in or inferred from the documents BEFORE calling extract_treatment_info or extract_medical_report. " +
    "Returns ICD-9-CM mappings for each code.",
  parameters: Type.Object({
    icd10Codes: Type.Array(Type.String(), {
      description: "Array of ICD-10 codes to look up (e.g. ['K35.80', 'J18.9', 'I10'])",
    }),
  }),
  async execute(_toolCallId, params) {
    const results = batchLookupIcd9(params.icd10Codes);
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      details: { codesQueried: params.icd10Codes.length },
    };
  },
};

// ─── Tool 6: Extract Treatment Info ──────────────────────────────────────────

const extractTreatmentInfoTool: AgentTool = {
  name: "extract_treatment_info",
  label: "Extracting Treatment Info",
  description:
    "Extract structured treatment data from classified documents: patient info, dates, " +
    "diagnosis, ICD codes, doctors, surgeries, lab tests, medicines, treatment summary. " +
    "Business rule: if admissionDate and dischargeDate differ by >=1 day -> treatmentType = INPATIENT. " +
    "Saves extracted data to the claim record.",
  parameters: Type.Object({
    patientName: Type.String({ description: "Patient's full name" }),
    patientDOB: Type.Union([Type.String(), Type.Null()], { description: "Patient DOB. Format yyyy-MM-dd" }),
    patientGender: Type.Union([Type.Literal("MALE"), Type.Literal("FEMALE"), Type.Null()], { description: "Patient gender" }),
    patientAddress: Type.String({ description: "Patient address" }),
    treatmentType: Type.Union([
      Type.Literal("INPATIENT"),
      Type.Literal("OUTPATIENT"),
      Type.Literal("DENTAL"),
    ], { description: "Treatment type" }),
    admissionDate: Type.Union([Type.String(), Type.Null()], { description: "Admission date. Format yyyy-MM-dd" }),
    dischargeDate: Type.Union([Type.String(), Type.Null()], { description: "Discharge date. Format yyyy-MM-dd" }),
    diagnosis: Type.Union([Type.String(), Type.Null()], { description: "Diagnosis of the treatment" }),
    icdCode: Type.Union([Type.String(), Type.Null()], { description: "ICD-10 diagnosis code extracted as-is. null if absent." }),
    inferenceIcdCode: Type.String({ description: "Inferred ICD-10 diagnosis code from diagnosis text" }),
    icd9Code: Type.Union([Type.String(), Type.Null()], { description: "ICD-9-CM code extracted from documents, null if not in documents" }),
    inferenceIcd9Code: Type.String({ description: "REQUIRED: ICD-9-CM code mapped from diagnosis and/or ICD-10 code" }),
    medicalProviderName: Type.Union([Type.String(), Type.Null()], { description: "Hospital/clinic name" }),
    totalPayableAmount: Type.Union([Type.Number(), Type.Null()], { description: "Total payable amount from bill" }),
    invoiceNumber: Type.Union([Type.String(), Type.Null()], { description: "Invoice/bill number" }),
    doctorNames: Type.Array(Type.String(), { description: "List of doctor names found in documents" }),
    surgeries: Type.Array(
      Type.Object({
        date: Type.String({ description: "Surgery date yyyy-MM-dd" }),
        operationName: Type.String({ description: "Operation name" }),
      }),
      { description: "List of surgeries" },
    ),
    treatmentSummary: Type.String({ description: "Summary of the treatment in markdown format" }),
  }),
  async execute(_toolCallId, params) {
    let finalTreatmentType = params.treatmentType;
    if (params.admissionDate && params.dischargeDate && params.admissionDate !== params.dischargeDate) {
      const admDate = new Date(params.admissionDate);
      const disDate = new Date(params.dischargeDate);
      const diffDays = Math.ceil((disDate.getTime() - admDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 1) {
        finalTreatmentType = "INPATIENT";
      }
    }

    // Auto-fill inferenceIcd9Code if the agent didn't provide it
    let inferenceIcd9Code = params.inferenceIcd9Code;
    if (!inferenceIcd9Code) {
      const icd10 = params.icdCode || params.inferenceIcdCode;
      if (icd10) {
        inferenceIcd9Code = lookupIcd9FromIcd10(icd10)?.icd9_code ?? "";
      }
    }

    const extractedTreatmentInfo = {
      patientName: params.patientName,
      patientDOB: params.patientDOB,
      patientGender: params.patientGender,
      patientAddress: params.patientAddress,
      treatmentType: finalTreatmentType,
      admissionDate: params.admissionDate,
      dischargeDate: params.dischargeDate,
      diagnosis: params.diagnosis,
      icdCode: params.icdCode,
      inferenceIcdCode: params.inferenceIcdCode,
      icd9Code: params.icd9Code,
      inferenceIcd9Code,
      medicalProviderName: params.medicalProviderName,
      totalPayableAmount: params.totalPayableAmount,
      invoiceNumber: params.invoiceNumber,
      doctorNames: params.doctorNames,
      surgeries: params.surgeries,
      treatmentSummary: params.treatmentSummary,
    };

    await mergeExtractedData(claimId, {
      extractedTreatmentInfo,
      treatmentSummary: params.treatmentSummary,
    }, "extraction");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          treatmentType: finalTreatmentType,
          patientName: params.patientName,
          diagnosis: params.diagnosis,
          icdCode: params.icdCode ?? params.inferenceIcdCode,
          icd9Code: params.icd9Code ?? params.inferenceIcd9Code ?? null,
          admissionDate: params.admissionDate,
          dischargeDate: params.dischargeDate,
          medicalProviderName: params.medicalProviderName,
          totalPayableAmount: params.totalPayableAmount,
          surgeryCount: params.surgeries.length,
          doctorCount: params.doctorNames.length,
        }, null, 2),
      }],
      details: { claimId, treatmentType: finalTreatmentType },
    };
  },
};

// ─── Tool 6: Extract Medical Report ──────────────────────────────────────────

const extractMedicalReportTool: AgentTool = {
  name: "extract_medical_report",
  label: "Extracting Medical Report",
  description:
    "Extract clinical data from Thai Medical Notice Forms or medical reports. " +
    "Captures chief complaint, diagnoses, vital signs, treatment plan, hospital course, " +
    "investigations, treatments given, and outcome. Extract text as-is (Thai or English).",
  parameters: Type.Object({
    chiefComplaint: Type.Union([Type.String(), Type.Null()], { description: "Chief complaint — why the patient came in" }),
    indicationForAdmission: Type.Union([Type.String(), Type.Null()], { description: "Indication / reason for admission" }),
    causeOfInjury: Type.Union([Type.String(), Type.Null()], { description: "Cause of injury or illness (ACCIDENT, ILLNESS, etc.)" }),
    initialDiagnosis: Type.Union([Type.String(), Type.Null()], { description: "Initial diagnosis on admission" }),
    finalDiagnoses: Type.Array(
      Type.Object({
        name: Type.String({ description: "Diagnosis name as-is from document" }),
        icdCode: Type.Union([Type.String(), Type.Null()], { description: "ICD-10 code if shown, otherwise null" }),
        inferenceIcdCode: Type.Union([Type.String(), Type.Null()], { description: "Inferred ICD-10 code from diagnosis text (null if icdCode was extracted)" }),
        icd9Code: Type.Union([Type.String(), Type.Null()], { description: "ICD-9-CM code if shown (usually null for Thai docs)" }),
        inferenceIcd9Code: Type.Union([Type.String(), Type.Null()], { description: "ICD-9-CM mapped from ICD-10 via lookup_icd_codes" }),
      }),
      { description: "Final diagnoses. Empty array if none." },
    ),
    underlyingConditions: Type.Union([Type.String(), Type.Null()], { description: "Underlying conditions / comorbidities" }),
    isAlcoholDrugRelated: Type.Union([Type.Boolean(), Type.Null()], { description: "Is illness related to alcohol/drug?" }),
    isPregnancyRelated: Type.Union([Type.Boolean(), Type.Null()], { description: "Is patient pregnant?" }),
    hivStatus: Type.Union([Type.String(), Type.Null()], { description: "Anti-HIV status" }),
    vitalSigns: Type.Union([
      Type.Object({
        temperature: Type.Union([Type.Number(), Type.Null()], { description: "Body temperature °C" }),
        heartRate: Type.Union([Type.Number(), Type.Null()], { description: "Heart rate bpm" }),
        bloodPressure: Type.Union([Type.String(), Type.Null()], { description: "Blood pressure (e.g. '93/53')" }),
        pulse: Type.Union([Type.Number(), Type.Null()], { description: "Pulse rate" }),
        respiration: Type.Union([Type.Number(), Type.Null()], { description: "Respiration rate/min" }),
      }),
      Type.Null(),
    ], { description: "Vital signs on admission. null if not on form." }),
    treatmentPlan: Type.Union([Type.String(), Type.Null()], { description: "Treatment plan / Surgery plan" }),
    hospitalCourse: Type.Union([Type.String(), Type.Null()], { description: "Hospital course" }),
    investigations: Type.Union([Type.String(), Type.Null()], { description: "Investigations ordered" }),
    treatments: Type.Union([Type.String(), Type.Null()], { description: "Treatments given" }),
    treatmentOutcome: Type.Union([Type.String(), Type.Null()], { description: "Treatment outcome" }),
    expectedLengthOfStay: Type.Union([Type.String(), Type.Null()], { description: "Expected LOS in days" }),
    otherComments: Type.Union([Type.String(), Type.Null()], { description: "Other comments from doctor" }),
  }),
  async execute(_toolCallId, params) {
    // Auto-fill inferenceIcd9Code for any diagnosis missing it
    const finalDiagnoses = params.finalDiagnoses.map(d => {
      if (!d.inferenceIcd9Code) {
        const icd10 = d.icdCode || d.inferenceIcdCode;
        if (icd10) {
          return { ...d, inferenceIcd9Code: lookupIcd9FromIcd10(icd10)?.icd9_code ?? null };
        }
      }
      return d;
    });
    const enrichedParams = { ...params, finalDiagnoses };

    await mergeExtractedData(claimId, { medicalReport: enrichedParams }, "extraction");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, ...enrichedParams }, null, 2),
      }],
      details: { claimId },
    };
  },
};

// ─── Tool 7: Extract Expenses ────────────────────────────────────────────────

const extractExpensesTool: AgentTool = {
  name: "extract_expenses",
  label: "Extracting Expenses",
  description:
    "Extract expense line items from bill pages of a Thai medical claim. " +
    "Supports two-pass extraction: mode='summary' for category headers (Pass 1), " +
    "mode='detail' for individual line items (Pass 2). " +
    "Number parsing: comma/dot + 3 digits = thousands separator, 1-2 digits = decimal. " +
    "Negative amounts in parentheses (920.00) = -920. Extract as separate line items.",
  parameters: Type.Object({
    mode: Type.Union([
      Type.Literal("summary"),
      Type.Literal("detail"),
      Type.Literal("combined"),
    ], { description: "'summary' = category headers only (Pass 1), 'detail' = line items (Pass 2), 'combined' = both" }),
    summaryItems: Type.Optional(
      Type.Array(
        Type.Object({
          id: Type.String({ description: "UUID of the summary item (from Pass 1)" }),
          name: Type.String({ description: "Summary category name" }),
          total_amount: Type.Number({ description: "Summary category NET payable amount" }),
          gross_amount: Type.Optional(Type.Number({ description: "Summary category GROSS amount (before discount)" })),
        }),
        { description: "Items from Pass 1. Required when mode='detail' and both bill types exist." },
      ),
    ),
    expenseItems: Type.Array(
      Type.Object({
        description: Type.String({ description: "Description of the service/item" }),
        date: Type.Union([Type.String(), Type.Null()], { description: "Date of service. Format yyyy-MM-dd" }),
        currency: Type.String({ description: "Currency (THB for Thailand)" }),
        type: Type.Union([Type.String(), Type.Null()], { description: "Type: SURGERY, DOCTOR_CONSULTATION, ROOM, MEDICAL_SUPPLIES, LAB_TEST, OTHER" }),
        groupCategory: Type.Union([Type.String(), Type.Null()], { description: "Group category from the document" }),
        grossAmount: Type.Number({ description: "Gross amount. Negative for credits/returns." }),
        discountAmount: Type.Number({ description: "Discount amount (0 if none)" }),
        taxAmount: Type.Number({ description: "Tax amount (0 if none)" }),
        payableAmount: Type.Number({ description: "Final payable amount. Negative for credits/returns." }),
        itemLevel: Type.Union([Type.Literal("summary"), Type.Literal("detail")], { description: "summary = category header, detail = individual charge" }),
        parentIndex: Type.Union([Type.Number(), Type.Null()], { description: "0-based index into summaryItems for detail items. null for summary items." }),
      }),
      { description: "Expense line items extracted from the bill." },
    ),
    totalPayableAmount: Type.Union([Type.Number(), Type.Null()], { description: "Total payable amount from bill summary" }),
  }),
  async execute(_toolCallId, params) {
    const { mode, summaryItems, expenseItems, totalPayableAmount } = params;

    // Force itemLevel based on mode
    const normalizedItems = expenseItems.map(item => ({
      ...item,
      itemLevel: mode === "summary" ? "summary" as const
        : mode === "detail" ? "detail" as const
        : item.itemLevel,
    }));

    // Assign IDs
    const itemsWithIds = normalizedItems.map((item, index) => ({
      ...item,
      id: crypto.randomUUID(),
      orderNumber: index + 1,
    }));

    // Resolve parentIndex → parentId
    const itemsWithParentIds = itemsWithIds.map(item => {
      let parentId: string | null = null;
      if (mode === "detail" && summaryItems && item.parentIndex != null) {
        parentId = summaryItems[item.parentIndex]?.id ?? null;
      } else if (mode === "combined" && item.parentIndex != null) {
        parentId = itemsWithIds[item.parentIndex]?.id ?? null;
      }
      return { ...item, parentId };
    });

    // Phase 1: Reconcile gross amounts
    if (mode === "detail" && summaryItems) {
      for (const summary of summaryItems) {
        const children = itemsWithParentIds.filter(i => i.parentId === summary.id);
        const categoryGross = summary.gross_amount ?? summary.total_amount;
        reconcileToTotal(children, "grossAmount", categoryGross);
      }
    }

    // Pro-rate category-level discounts across detail items
    if (mode === "detail" && summaryItems) {
      for (const summary of summaryItems) {
        const children = itemsWithParentIds.filter(i => i.parentId === summary.id);
        const positiveChildren = children.filter(i => i.grossAmount > 0);
        const categoryGross = summary.gross_amount ?? summary.total_amount;
        const categoryNet = summary.total_amount;
        const categoryDiscount = categoryGross - categoryNet;

        if (categoryDiscount > 0 && positiveChildren.length > 0) {
          const childrenWithDiscount = positiveChildren.filter(i => i.discountAmount !== 0);
          const hasPerItemDiscounts = childrenWithDiscount.length > positiveChildren.length * 0.3;

          if (hasPerItemDiscounts) {
            // Scenario A: Per-item discounts present
            for (const child of positiveChildren) {
              child.payableAmount = Math.round((child.grossAmount - child.discountAmount) * 100) / 100;
            }
          } else {
            // Scenario B: Pro-rate category discount
            const positiveGrossTotal = positiveChildren.reduce((s, i) => s + i.grossAmount, 0);
            for (const child of positiveChildren) {
              if (child.discountAmount === 0) {
                const proportion = positiveGrossTotal > 0 ? child.grossAmount / positiveGrossTotal : 0;
                child.discountAmount = Math.round(proportion * categoryDiscount * 100) / 100;
                child.payableAmount = child.grossAmount - child.discountAmount;
              }
            }
          }
        }
      }
    }

    // Phase 2: Reconcile payable amounts (fix rounding residuals)
    if (mode === "detail" && summaryItems) {
      for (const summary of summaryItems) {
        const children = itemsWithParentIds.filter(i => i.parentId === summary.id);
        const categoryGross = summary.gross_amount ?? summary.total_amount;
        const categoryNet = summary.total_amount;
        if (categoryGross === categoryNet || children.length === 0) continue;

        const payableSum = children.reduce((s, i) => s + i.payableAmount, 0);
        const residual = Math.round((categoryNet - payableSum) * 100) / 100;
        if (residual === 0 || Math.abs(residual) > 1) continue;

        let idx = 0;
        for (let i = 1; i < children.length; i++) {
          if (Math.abs(children[i].payableAmount) > Math.abs(children[idx].payableAmount)) idx = i;
        }
        children[idx].payableAmount = Math.round((children[idx].payableAmount + residual) * 100) / 100;
        children[idx].discountAmount = Math.round((children[idx].grossAmount - children[idx].payableAmount) * 100) / 100;
      }
    }

    // Calculate totals
    const totalsItems = mode === "summary"
      ? itemsWithParentIds
      : itemsWithParentIds.filter(i => (i.itemLevel ?? "detail") === "detail");
    const calculatedTotal = totalsItems.reduce((s, i) => s + i.payableAmount, 0);

    // Build items for extracted_data
    const allItemsForExtractedData = mode === "detail" && summaryItems
      ? [
          ...summaryItems.map(s => ({
            id: s.id,
            name: s.name,
            total_amount: s.total_amount,
            gross_amount: s.gross_amount ?? s.total_amount,
            is_covered: true,
            itemLevel: "summary" as const,
            parentId: null as string | null,
          })),
          ...itemsWithParentIds.map(item => ({
            id: item.id,
            name: item.description,
            total_amount: item.payableAmount,
            gross_amount: item.grossAmount,
            discount_amount: item.discountAmount,
            payable_amount: item.payableAmount,
            is_covered: true,
            itemLevel: (item.itemLevel ?? "detail") as "summary" | "detail",
            parentId: item.parentId,
          })),
        ]
      : itemsWithParentIds.map(item => ({
          id: item.id,
          name: item.description,
          total_amount: item.payableAmount,
          gross_amount: item.grossAmount,
          discount_amount: item.discountAmount,
          payable_amount: item.payableAmount,
          is_covered: true,
          itemLevel: (item.itemLevel ?? "detail") as "summary" | "detail",
          parentId: item.parentId,
        }));

    // Persist to extracted_data
    await mergeExtractedData(claimId, {
      expenses: {
        mode,
        items: allItemsForExtractedData,
        totalPayable: calculatedTotal,
        totalGross: totalsItems.reduce((s, i) => s + i.grossAmount, 0),
      },
    }, "extraction");

    // Category validation
    let categoryValidation: Array<{
      summaryId: string;
      summaryName: string;
      summaryGross: number;
      summaryNet: number;
      detailGrossSum: number;
      detailPayableSum: number;
      isValid: boolean;
    }> | undefined;

    if (mode === "detail" && summaryItems && summaryItems.length > 0) {
      categoryValidation = summaryItems.map(summary => {
        const childItems = itemsWithParentIds.filter(i => i.parentId === summary.id);
        const detailGrossSum = childItems.reduce((s, i) => s + i.grossAmount, 0);
        const detailPayableSum = childItems.reduce((s, i) => s + i.payableAmount, 0);
        const categoryGross = summary.gross_amount ?? summary.total_amount;
        return {
          summaryId: summary.id,
          summaryName: summary.name,
          summaryGross: categoryGross,
          summaryNet: summary.total_amount,
          detailGrossSum,
          detailPayableSum,
          isValid: Math.abs(categoryGross - detailGrossSum) < 1,
        };
      });
    }

    const result: Record<string, unknown> = {
      success: true,
      mode,
      itemCount: itemsWithParentIds.length,
      items: itemsWithParentIds.map(item => ({
        id: item.id,
        name: item.description,
        total_amount: item.payableAmount,
        gross_amount: item.grossAmount,
        discount_amount: item.discountAmount,
        payable_amount: item.payableAmount,
        is_covered: true,
        itemLevel: item.itemLevel ?? "detail",
        parentId: item.parentId,
      })),
      totalGross: totalsItems.reduce((s, i) => s + i.grossAmount, 0),
      totalDiscount: totalsItems.reduce((s, i) => s + i.discountAmount, 0),
      totalTax: totalsItems.reduce((s, i) => s + i.taxAmount, 0),
      totalPayable: calculatedTotal,
      totalPayableAmountValidation: {
        isValid: totalPayableAmount != null ? Math.abs(calculatedTotal - totalPayableAmount) < 1 : null,
        calculatedTotal,
        extractedTotal: totalPayableAmount,
      },
    };

    if (categoryValidation) {
      result.categoryValidation = categoryValidation;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: { claimId, mode, itemCount: itemsWithParentIds.length },
    };
  },
};

// ─── Tool 8: Save Extraction Sources ─────────────────────────────────────────

const saveExtractionSourcesTool: AgentTool = {
  name: "save_extraction_sources",
  label: "Saving Source References",
  description:
    "Save source references mapping each extracted field back to its source document page and text. " +
    "Call this AFTER all other extraction tools are complete. " +
    "Each key is a dotted field path (e.g. 'extractedTreatmentInfo.patientName', 'expenses.items.0').",
  parameters: Type.Object({
    sources: Type.Record(
      Type.String({ description: "Dotted field path (e.g. 'extractedTreatmentInfo.patientName', 'expenses.items.0')" }),
      Type.Object({
        pages: Type.Array(Type.Number(), { description: "1-indexed page numbers where this value was found" }),
        docType: Type.String({ description: "Document type (e.g. Bill, MedicalCertificate, DischargePaper)" }),
        text: Type.Optional(Type.String({ description: "Verbatim text excerpt from document (max ~200 chars)" })),
        bbox: Type.Optional(Type.Object({
          x: Type.Number({ description: "Left edge as fraction of page width (0.0–1.0)" }),
          y: Type.Number({ description: "Top edge as fraction of page height (0.0–1.0)" }),
          w: Type.Number({ description: "Width as fraction of page width (0.0–1.0)" }),
          h: Type.Number({ description: "Height as fraction of page height (0.0–1.0)" }),
        }, { description: "Bounding box of the source data on the page, using normalized 0–1 coordinates" })),
      }),
    ),
  }),
  async execute(_toolCallId, params) {
    await mergeExtractedData(claimId, { _sources: params.sources }, "extraction");

    const sourceCount = Object.keys(params.sources).length;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, sourceCount }, null, 2),
      }],
      details: { claimId, sourceCount },
    };
  },
};

  return {
    fetchClaimTool,
    readDocumentTool,
    classifyDocumentsTool,
    validateDocumentCompletenessTool,
    lookupIcdCodesTool,
    extractTreatmentInfoTool,
    extractMedicalReportTool,
    extractExpensesTool,
    saveExtractionSourcesTool,
  };
}

// Export helpers for downstream agents
export { mergeExtractedData, parseExtractedData, getExtractedField };
