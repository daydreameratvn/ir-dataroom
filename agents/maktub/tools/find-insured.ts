import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../../shared/graphql-client.ts";

function ageInYears(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export const findInsuredTool: AgentTool = {
  name: "findInsured",
  label: "Find Insured Person",
  description:
    "Search for insured persons by name, phone number, or citizen ID (CCCD/CMND). " +
    "Returns matching insured persons with their active certificates. " +
    "Each certificate includes OTP requirement fields: requiresOtp, requiresInsuredPersonOtp, otpPhone.",
  parameters: Type.Object({
    name: Type.Optional(Type.String({ description: "Full or partial name of the insured person" })),
    phone: Type.Optional(Type.String({ description: "Phone number of the insured person" })),
    paper_id: Type.Optional(Type.String({ description: "Citizen ID (CCCD/CMND) of the insured person" })),
  }),
  execute: async (toolCallId, { name, phone, paper_id }) => {
    const conditions: Record<string, unknown>[] = [];
    if (name) conditions.push({ name: { _ilike: `%${name}%` } });
    if (phone) conditions.push({ phone: { _eq: phone } });
    if (paper_id) conditions.push({ paperId: { _eq: paper_id } });

    if (conditions.length === 0) {
      return {
        content: [{ type: "text", text: "Error: At least one search parameter (name, phone, or paper_id) is required." }],
        details: { error: true },
        isError: true,
      };
    }

    // Query via insuredCertificates + insuredPerson relationship
    // (insuredPersons list query has a DDN connector bug with _is_null)
    // Include policy.policySettings for OTP requirements and parent certificate for phone resolution
    const data = await gqlQuery<{ insuredCertificates: any[] }>(
      `query FindInsuredPersons($where: InsuredCertificatesBoolExp!) {
        insuredCertificates(where: $where, limit: 20) {
          insuredCertificateId
          effectiveDate
          expiryDate
          phone
          parentInsuredCertificateId
          insuredCertificate { insuredCertificateId phone }
          plan { planId }
          policy {
            policyId
            policySettings { claimFormType }
          }
          insuredPerson {
            insuredPersonId name email phone dob paperId
          }
        }
      }`,
      {
        where: {
          insuredPerson: { _or: conditions },
        },
      },
    );

    // Group by insured person and map to stable field names
    const personMap = new Map<string, any>();
    for (const cert of data.insuredCertificates ?? []) {
      const p = cert.insuredPerson;
      if (!p) continue;
      if (!personMap.has(p.insuredPersonId)) {
        personMap.set(p.insuredPersonId, {
          ...p,
          id: p.insuredPersonId,
          insured_certificates: [],
        });
      }

      // Compute OTP requirements from policy settings
      const claimFormType = cert.policy?.policySettings?.[0]?.claimFormType;
      const requiresOtp = claimFormType === "OTP_VERIFICATION" || claimFormType === "OTP_VERIFICATION_BY_INSURED_PERSON";
      const requiresInsuredPersonOtp = claimFormType === "OTP_VERIFICATION_BY_INSURED_PERSON";

      // Resolve phone for insured person OTP
      let otpPhone: string | null = null;
      if (requiresInsuredPersonOtp) {
        const isDependent = cert.parentInsuredCertificateId != null;
        const dob = p.dob;
        const isMinor = dob ? ageInYears(dob) < 18 : false;

        if (isDependent && isMinor) {
          // Minor dependent → use parent certificate's phone
          otpPhone = cert.insuredCertificate?.phone ?? null;
        } else {
          // Adult or main insured → use their own certificate's phone
          otpPhone = cert.phone ?? null;
        }
      }

      personMap.get(p.insuredPersonId)!.insured_certificates.push({
        insuredCertificateId: cert.insuredCertificateId,
        effectiveDate: cert.effectiveDate,
        expiryDate: cert.expiryDate,
        phone: cert.phone,
        plan: cert.plan,
        id: cert.insuredCertificateId,
        requiresOtp,
        requiresInsuredPersonOtp,
        otpPhone,
      });
    }
    const mapped = { insured_persons: [...personMap.values()] };

    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      details: { matchCount: personMap.size },
    };
  },
};

export const updateCertificatePhoneTool: AgentTool = {
  name: "updateCertificatePhone",
  label: "Update Certificate Phone",
  description:
    "Update the phone number on an insured certificate. Use when the insured person's phone is missing " +
    "and the user provides one for OTP verification. The phone must be a valid Vietnamese phone number.",
  parameters: Type.Object({
    insuredCertificateId: Type.String({ description: "The insured certificate ID (UUID) to update" }),
    phone: Type.String({ description: "Vietnamese phone number (e.g. 0912345678 or +84912345678)" }),
  }),
  execute: async (toolCallId, { insuredCertificateId, phone }) => {
    // Normalize Vietnamese phone: strip +84 prefix, ensure leading 0
    let normalizedPhone = phone.replace(/[\s\-()]/g, "");
    if (normalizedPhone.startsWith("+84")) {
      normalizedPhone = "0" + normalizedPhone.slice(3);
    } else if (normalizedPhone.startsWith("84") && normalizedPhone.length > 9) {
      normalizedPhone = "0" + normalizedPhone.slice(2);
    }

    // Basic Vietnamese phone validation: 10 digits starting with 0
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      return {
        content: [{ type: "text", text: "Số điện thoại không hợp lệ. Vui lòng cung cấp số điện thoại Việt Nam hợp lệ (10 chữ số, bắt đầu bằng 0)." }],
        details: { error: true },
        isError: true,
      };
    }

    try {
      const data = await gqlQuery<{ updateInsuredCertificatesByInsuredCertificateId: { returning: any[] } }>(
        `mutation UpdateCertificatePhone($insuredCertificateId: Uuid!, $phone: String_1!) {
          updateInsuredCertificatesByInsuredCertificateId(
            insuredCertificateId: $insuredCertificateId,
            updateColumns: { phone: { set: $phone } }
          ) {
            returning { insuredCertificateId phone }
          }
        }`,
        { insuredCertificateId, phone: normalizedPhone },
      );

      const updated = data.updateInsuredCertificatesByInsuredCertificateId?.returning?.[0];
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: updated != null,
          phone: updated?.phone ?? normalizedPhone,
        }) }],
        details: { insuredCertificateId, phone: normalizedPhone },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Lỗi cập nhật số điện thoại: ${error instanceof Error ? error.message : "Unknown error"}` }],
        details: { error: true },
        isError: true,
      };
    }
  },
};
