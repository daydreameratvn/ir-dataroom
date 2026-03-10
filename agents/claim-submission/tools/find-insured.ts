import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../../shared/graphql-client.ts";

export const findInsuredTool: AgentTool = {
  name: "findInsured",
  label: "Find Insured Person",
  description:
    "Search for insured persons by name, phone number, or citizen ID (CCCD/CMND). " +
    "Returns matching insured persons with their active certificates.",
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
    const data = await gqlQuery<{ insuredCertificates: any[] }>(
      `query FindInsuredPersons($where: InsuredCertificatesBoolExp!) {
        insuredCertificates(where: $where, limit: 20) {
          insuredCertificateId
          effectiveDate
          expiryDate
          phone
          plan { planId }
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
      personMap.get(p.insuredPersonId)!.insured_certificates.push({
        insuredCertificateId: cert.insuredCertificateId,
        effectiveDate: cert.effectiveDate,
        expiryDate: cert.expiryDate,
        phone: cert.phone,
        plan: cert.plan,
        id: cert.insuredCertificateId,
      });
    }
    const mapped = { insured_persons: [...personMap.values()] };

    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      details: { matchCount: data.insuredPersons?.length ?? 0 },
    };
  },
};
