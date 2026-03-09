import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../../shared/graphql-client.ts";

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
    const { data } = await getClient().query({
      query: graphql(`
        query LastBankInfo($certIds: [uuid!]!) {
          claim_case_beneficiaries(
            where: {
              claim_case: {
                insured_certificate_id: { _in: $certIds }
                deleted_at: { _is_null: true }
              }
              deleted_at: { _is_null: true }
            }
            order_by: { created_at: desc }
            limit: 1
          ) {
            id
            bank_account_number
            bank_name
            bank_id
            bank_branch
            bank_city
            beneficiary_name
            bank { id en_name short_name }
          }
        }
      `),
      variables: { certIds: insuredCertificateIds },
    });

    const beneficiary = (data as any)?.claim_case_beneficiaries?.[0];
    if (!beneficiary) {
      return {
        content: [{ type: "text", text: JSON.stringify({ found: false, message: "No previous bank info found." }) }],
        details: { found: false },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        found: true,
        bankId: beneficiary.bank?.id ?? beneficiary.bank_id,
        bankName: beneficiary.bank?.en_name ?? beneficiary.bank_name,
        bankShortName: beneficiary.bank?.short_name,
        accountNumber: beneficiary.bank_account_number,
        accountName: beneficiary.beneficiary_name,
        bankBranch: beneficiary.bank_branch,
        bankCity: beneficiary.bank_city,
      }) }],
      details: { found: true },
    };
  },
};
