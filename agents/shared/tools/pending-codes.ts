import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";
import dedent from "dedent";

import { getClient } from "../graphql-client.ts";

const client = getClient();

const DOCUMENT_TYPE_TO_PENDING_CODE: Record<string, string> = {
  InvoicePaper: "P01", VATInvoice: "P01", Receipt: "P01",
  PrescriptionPaper: "P02",
  POLST: "P03",
  TestResult: "P04", MedicalTestResult: "P04", XRayImage: "P04", UltrasoundImage: "P04",
  AccidentReport: "P05", AccidentProof: "P05",
  PoliceReport: "P06", PoliceRelatedPaper: "P06",
  MedicalReport: "P07", AdmissionNote: "P07", MedicalRecord: "P07",
  CertificateOfSurgery: "P08", SurgeryProof: "P08",
  DischargeNote: "P09", DischargePaper: "P09",
  DeathCertificate: "P10",
  DentalExamForm: "P38",
  OtherPaper: "P99",
};

const PENDING_TEMPLATES: Record<string, { title: string; content: string; en_content: string }> = {
  P01: { title: "Hóa đơn tài chính", content: "Quý khách vui lòng cung cấp Hóa đơn/Phiếu thu tiền khám chữa bệnh tại <CSYT> vào ngày <Event date>.", en_content: "Please provide Invoice/Receipt for medical expenses at <CSYT> on <Event date>." },
  P02: { title: "Toa thuốc", content: "Quý khách vui lòng cung cấp Toa thuốc/Đơn thuốc điều trị tại <CSYT> vào ngày <Event date>.", en_content: "Please provide Prescription for treatment at <CSYT> on <Event date>." },
  P03: { title: "Bảng kê chi phí", content: "Quý khách vui lòng cung cấp Bảng kê chi tiết chi phí khám chữa bệnh tại <CSYT> từ ngày <Ngày nhập viện> đến ngày <Ngày ra viện>.", en_content: "Please provide Itemized bill for medical expenses at <CSYT> from <Ngày nhập viện> to <Ngày ra viện>." },
  P04: { title: "Kết quả xét nghiệm", content: "Quý khách vui lòng cung cấp Kết quả xét nghiệm/Phiếu kết quả cận lâm sàng tại <CSYT> vào ngày <Event date>.", en_content: "Please provide Test results/Lab results at <CSYT> on <Event date>." },
  P05: { title: "Biên bản tai nạn", content: "Quý khách vui lòng cung cấp Biên bản tai nạn/Tường trình tai nạn mô tả chi tiết diễn biến sự việc xảy ra vào ngày <Event date>.", en_content: "Please provide Accident report describing the incident that occurred on <Event date>." },
  P06: { title: "Biên bản công an", content: "Quý khách vui lòng cung cấp Biên bản vi phạm hành chính/Biên bản công an liên quan đến sự việc ngày <Event date>.", en_content: "Please provide Police report related to the incident on <Event date>." },
  P07: { title: "Tóm tắt bệnh án", content: "Quý khách vui lòng cung cấp Tóm tắt bệnh án/Hồ sơ bệnh án điều trị tại <CSYT> từ ngày <Ngày nhập viện> đến ngày <Ngày ra viện>.", en_content: "Please provide Medical summary for treatment at <CSYT> from <Ngày nhập viện> to <Ngày ra viện>." },
  P08: { title: "Giấy chứng nhận phẫu thuật", content: "Quý khách vui lòng cung cấp Giấy chứng nhận phẫu thuật/Biên bản phẫu thuật tại <CSYT> vào ngày <Event date>.", en_content: "Please provide Surgery certificate at <CSYT> on <Event date>." },
  P09: { title: "Giấy ra viện", content: "Quý khách vui lòng cung cấp Giấy ra viện/Giấy xuất viện tại <CSYT> ngày <Ngày ra viện>.", en_content: "Please provide Discharge note from <CSYT> on <Ngày ra viện>." },
  P10: { title: "Trích lục khai tử", content: "Quý khách vui lòng cung cấp Trích lục khai tử/Giấy chứng tử.", en_content: "Please provide Death certificate." },
  P38: { title: "Phiếu điều trị Nha khoa", content: "Quý khách vui lòng cung cấp Phiếu điều trị Nha khoa/Bệnh án Nha khoa tại <CSYT> vào ngày <Event date>.", en_content: "Please provide Dental treatment form at <CSYT> on <Event date>." },
  P99: { title: "Chứng từ khác", content: "Quý khách vui lòng cung cấp chứng từ bổ sung theo yêu cầu.", en_content: "Please provide additional documents as requested." },
};

function formatDateVi(dateString: string | null | undefined): string {
  if (!dateString) return "[chưa xác định]";
  try { return new Date(dateString).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  catch { return "[chưa xác định]"; }
}

function formatCurrencyVi(amount: number | null | undefined): string {
  if (amount == null) return "[chưa xác định]";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

const GetClaimContextDocument = graphql(`
  query GetClaimContextForPendingV2($claimCode: String!) {
    claim_cases(where: { code_v2: { _eq: $claimCode } }, limit: 1) {
      id claim_case_id code diagnosis request_amount physical_examination_date admission_date discharge_date tenant_id
      insured_benefit_type { value comment }
      medical_provider { id name }
      insured_certificate {
        id
        insured_person { id name }
        policy { id insurer_company { company_id name } }
      }
    }
  }
`);

const GetPendingCodesDocument = graphql(`
  query GetPendingCodesV2($codes: [String!]!) {
    pending_codes(where: { code: { _in: $codes } }) { code description document_type }
  }
`);

const GetInsurerPendingCodeMappingDocument = graphql(`
  query GetInsurerPendingCodeMappingV2($insurerId: uuid!, $ppyCodes: [String!]!) {
    insurer_pending_codes_mapping(where: { insurer_id: { _eq: $insurerId }, ppy_pending_code: { _in: $ppyCodes } }) {
      id ppy_pending_code insurer_pending_code description product_code
    }
  }
`);

const InsertClaimPendingCodesDocument = graphql(`
  mutation InsertClaimPendingCodesV2($objects: [claim_pending_codes_insert_input!]!) {
    insert_claim_pending_codes(objects: $objects) {
      affected_rows
      returning { id claim_pending_code_id code status extended_text started_at }
    }
  }
`);

export const getPendingCodeMappingTool: AgentTool = {
  name: "getPendingCodeMapping",
  label: "Get Pending Code Mapping",
  description: dedent`Map document types to their corresponding pending codes. Use this to determine which pending codes (P01, P02, etc.) to issue when documents are missing.`,
  parameters: Type.Object({
    documentTypes: Type.Array(Type.String(), { description: "Array of document types to map (e.g., VATInvoice, PrescriptionPaper)" }),
  }),
  execute: async (toolCallId, { documentTypes }) => {
    const codes = [...new Set(documentTypes.map((dt: string) => DOCUMENT_TYPE_TO_PENDING_CODE[dt] ?? "P99"))];
    const { data } = await client.query({ query: GetPendingCodesDocument, variables: { codes } });
    const dbCodeMap = new Map((data?.pending_codes ?? []).map((pc) => [pc.code, pc]));
    const mappings = documentTypes.map((docType: string) => {
      const code = DOCUMENT_TYPE_TO_PENDING_CODE[docType] ?? "P99";
      const dbCode = dbCodeMap.get(code);
      return { documentType: docType, pendingCode: code, description: dbCode?.description ?? PENDING_TEMPLATES[code]?.title ?? "Chứng từ khác", templateTitle: PENDING_TEMPLATES[code]?.title };
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ mappings, summary: `Mapped ${documentTypes.length} document type(s) to ${codes.length} pending code(s): ${codes.join(", ")}` }) }],
      details: { mappings },
    };
  },
};

export const getClaimContextForTemplatesTool: AgentTool = {
  name: "getClaimContextForTemplates",
  label: "Get Claim Context for Templates",
  description: dedent`Get claim details needed to fill pending text template placeholders. Returns CSYT (medical provider), dates, amounts, and other context.`,
  parameters: Type.Object({
    claimCode: Type.String({ description: "The claim code to get context for (e.g., RE-XX-XXXXXX)" }),
  }),
  execute: async (toolCallId, { claimCode }) => {
    const { data } = await client.query({ query: GetClaimContextDocument, variables: { claimCode } });
    const claim = data?.claim_cases?.[0];
    if (!claim) return { content: [{ type: "text", text: JSON.stringify({ error: `Claim not found: ${claimCode}` }) }], details: { error: true } };
    const result = {
      claimCode, claimCaseId: claim.claim_case_id, tenantId: claim.tenant_id, benefitType: claim.insured_benefit_type?.value,
      CSYT: claim.medical_provider?.name ?? "[CSYT chưa xác định]",
      eventDate: formatDateVi(claim.physical_examination_date), admissionDate: formatDateVi(claim.admission_date), dischargeDate: formatDateVi(claim.discharge_date),
      requestAmount: formatCurrencyVi(claim.request_amount), diagnosis: claim.diagnosis,
      insuredName: claim.insured_certificate?.insured_person?.name,
      insurerId: claim.insured_certificate?.policy?.insurer_company?.company_id,
      insurerName: claim.insured_certificate?.policy?.insurer_company?.name,
    };
    return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
  },
};

export const getPendingCodeTemplatesTool: AgentTool = {
  name: "getPendingCodeTemplates",
  label: "Get Pending Code Templates",
  description: dedent`Get pending text templates for the specified pending codes. Returns both Vietnamese and English templates with placeholders.`,
  parameters: Type.Object({
    pendingCodes: Type.Array(Type.String(), { description: "Array of pending codes (e.g., P01, P02, P03)" }),
  }),
  execute: async (toolCallId, { pendingCodes }) => {
    const templates = pendingCodes.map((code: string) => {
      const template = PENDING_TEMPLATES[code];
      if (!template) return { code, found: false, title: "Chứng từ khác", content: "Quý khách vui lòng cung cấp chứng từ theo yêu cầu.", en_content: "Please provide documents as requested." };
      return { code, found: true, ...template };
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ templates, placeholders: ["<CSYT>", "<Event date>", "<Ngày nhập viện>", "<Ngày ra viện>", "<Số tiền yêu cầu>"] }) }],
      details: { templates },
    };
  },
};

export const getInsurerPendingCodeMappingTool: AgentTool = {
  name: "getInsurerPendingCodeMapping",
  label: "Get Insurer Pending Code Mapping",
  description: dedent`Map PPY (internal) pending codes to insurer-specific pending codes.`,
  parameters: Type.Object({
    insurerId: Type.Optional(Type.String({ description: "The insurer company ID" })),
    ppyPendingCodes: Type.Array(Type.String(), { description: "Array of PPY pending codes to map" }),
  }),
  execute: async (toolCallId, { insurerId, ppyPendingCodes }) => {
    if (!insurerId) {
      return {
        content: [{ type: "text", text: JSON.stringify({ mappings: ppyPendingCodes.map((code: string) => ({ ppyCode: code, insurerCode: code, source: "ppy" })), note: "No insurer ID provided" }) }],
        details: {},
      };
    }
    const { data } = await client.query({ query: GetInsurerPendingCodeMappingDocument, variables: { insurerId, ppyCodes: ppyPendingCodes } });
    const mappingMap = new Map((data?.insurer_pending_codes_mapping ?? []).map((m) => [m.ppy_pending_code, m]));
    const mappings = ppyPendingCodes.map((ppyCode: string) => {
      const mapping = mappingMap.get(ppyCode);
      return { ppyCode, insurerCode: mapping?.insurer_pending_code ?? ppyCode, description: mapping?.description, source: mapping ? "insurer" : "ppy" };
    });
    return {
      content: [{ type: "text", text: JSON.stringify({ insurerId, mappings }) }],
      details: { mappings },
    };
  },
};

export const issuePendingCodesTool: AgentTool = {
  name: "issuePendingCodes",
  label: "Issue Pending Codes",
  description: dedent`Issue pending document request codes for a claim case. Creates records in the claim_pending_codes table.`,
  parameters: Type.Object({
    claimCaseId: Type.String({ description: "The claim case ID (UUID)" }),
    tenantId: Type.String({ description: "The tenant ID from the claim case" }),
    pendingCodes: Type.Array(
      Type.Object({
        code: Type.String({ description: "The pending code (P01, P02, etc.)" }),
        extendedText: Type.String({ description: "The processed pending text message with placeholders filled" }),
        status: Type.Optional(Type.String({ description: "Status: MISSING_DOCUMENT or O (Open)" })),
        remark: Type.Optional(Type.String({ description: "Additional internal remark" })),
      }),
      { description: "Array of pending codes to issue" },
    ),
  }),
  execute: async (toolCallId, { claimCaseId, tenantId, pendingCodes }) => {
    const objects = pendingCodes.map((pc: { code: string; extendedText: string; status?: string; remark?: string }) => ({
      claim_case_id: claimCaseId,
      code: pc.code,
      status: pc.status ?? "MISSING_DOCUMENT",
      extended_text: pc.extendedText,
      remark: pc.remark ?? null,
      started_at: new Date().toISOString(),
      tenant_id: tenantId,
    }));
    try {
      const { data } = await client.mutate({ mutation: InsertClaimPendingCodesDocument, variables: { objects } });
      const returning = data?.insert_claim_pending_codes?.returning ?? [];
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, issued: returning, count: returning.length }) }],
        details: { success: true },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed" }) }],
        details: { error: true },
      };
    }
  },
};
