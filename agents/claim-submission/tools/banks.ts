import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery, appleQuery } from "../../shared/graphql-client.ts";

export const banksTool: AgentTool = {
  name: "banks",
  label: "Banks",
  description: "Get list of available banks",
  parameters: Type.Object({
    limit: Type.Number({ description: "The limit of banks to return" }),
    offset: Type.Number({ description: "The offset for pagination" }),
  }),
  execute: async (toolCallId, { limit, offset }) => {
    const data = await gqlQuery<{ banks: any[] }>(
      `query Banks($limit: Int!, $offset: Int!) {
        banks(limit: $limit, offset: $offset, order_by: { enName: Asc }) {
          id enName shortName
        }
      }`,
      { limit, offset },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { limit, offset },
    };
  },
};

// Custom action — must stay on Apple v2
export const verifyBankAccountTool: AgentTool = {
  name: "verifyBankAccount",
  label: "Verify Bank Account",
  description: "Verify bank account information and retrieve account holder name",
  parameters: Type.Object({
    bank_id: Type.String({ description: "The UUID of the bank" }),
    account_number: Type.String({ description: "The bank account number to verify" }),
  }),
  execute: async (toolCallId, { bank_id, account_number }) => {
    try {
      const data = await appleQuery<{ payout: { getBankAccountInfo: any } }>(
        `query BankAccountInfo($bankId: UUID!, $accountNumber: String!) {
          payout {
            getBankAccountInfo(bankId: $bankId, accountNumber: $accountNumber) {
              accountName accountNumber bankName
            }
          }
        }`,
        { bankId: bank_id, accountNumber: account_number },
      );
      const accountInfo = data?.payout?.getBankAccountInfo;
      if (accountInfo == null) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, message: "Failed to verify bank account." }) }],
          details: { bank_id },
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: true, verified: true,
          verified_account_name: accountInfo.accountName,
          verified_account_number: accountInfo.accountNumber,
          bank_name: accountInfo.bankName,
        }) }],
        details: { bank_id },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: JSON.stringify({ success: false, message: `Verification failed: ${error instanceof Error ? error.message : "Unknown error"}` }) }],
        details: { error: true },
      };
    }
  },
};
