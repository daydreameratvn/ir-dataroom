import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../../shared/graphql-client.ts";

export const lastBankInfoTool: AgentTool = {
  name: "lastBankInfo",
  label: "Last Bank Info",
  description:
    "Get the most recently used bank account for insured certificates. " +
    "Use this to auto-fill payment details so the user doesn't have to re-enter bank info.",
  parameters: Type.Object({
    insuredCertificateIds: Type.Array(Type.String(), { description: "Insured certificate IDs to check" }),
  }),
  execute: async (toolCallId, { insuredCertificateIds }) => {
    const data = await gqlQuery<{ claimCaseBeneficiaries: any[] }>(
      `query LastBankInfo($certIds: [Uuid_1!]!) {
        claimCaseBeneficiaries(
          where: {
            claimCases: {
              insuredCertificateId: { _in: $certIds }
            }
          }
          order_by: { createdAt: Desc }
          limit: 1
        ) {
          id
          bankAccountNumber
          bankName
          bankId
          bankBranch
          bankCity
          beneficiaryName
          bank { id enName shortName }
        }
      }`,
      { certIds: insuredCertificateIds },
    );

    const beneficiary = data.claimCaseBeneficiaries?.[0];
    if (!beneficiary) {
      return {
        content: [{ type: "text", text: JSON.stringify({ found: false, message: "No previous bank info found." }) }],
        details: { found: false },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        found: true,
        bankId: beneficiary.bank?.id ?? beneficiary.bankId,
        bankName: beneficiary.bank?.enName ?? beneficiary.bankName,
        bankShortName: beneficiary.bank?.shortName,
        accountNumber: beneficiary.bankAccountNumber,
        accountName: beneficiary.beneficiaryName,
        bankBranch: beneficiary.bankBranch,
        bankCity: beneficiary.bankCity,
      }) }],
      details: { found: true },
    };
  },
};
