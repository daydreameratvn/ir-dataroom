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
    // Step 1: Get the most recent beneficiary (without bank relationship to avoid DDN cross-subgraph join bug)
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

    // Step 2: If we have a bankId, look up the bank name separately
    let bankEnName: string | null = null;
    let bankShortName: string | null = null;
    if (beneficiary.bankId) {
      try {
        const bankData = await gqlQuery<{ banksById: { enName: string; shortName: string } | null }>(
          `query BankById($id: Uuid_1!) {
            banksById(id: $id) { enName shortName }
          }`,
          { id: beneficiary.bankId },
        );
        bankEnName = bankData.banksById?.enName ?? null;
        bankShortName = bankData.banksById?.shortName ?? null;
      } catch {
        // Bank lookup is optional — fall back to bankName on the beneficiary row
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        found: true,
        bankId: beneficiary.bankId,
        bankName: bankEnName ?? beneficiary.bankName,
        bankShortName,
        accountNumber: beneficiary.bankAccountNumber,
        accountName: beneficiary.beneficiaryName,
        bankBranch: beneficiary.bankBranch,
        bankCity: beneficiary.bankCity,
      }) }],
      details: { found: true },
    };
  },
};
