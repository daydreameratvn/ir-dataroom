import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../../shared/graphql-client.ts";

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
    if (paper_id) conditions.push({ paper_id: { _eq: paper_id } });

    if (conditions.length === 0) {
      return {
        content: [{ type: "text", text: "Error: At least one search parameter (name, phone, or paper_id) is required." }],
        details: { error: true },
        isError: true,
      };
    }

    const { data } = await getClient().query({
      query: graphql(`
        query FindInsuredPersons($where: insured_persons_bool_exp!) {
          insured_persons(where: $where, limit: 10) {
            id
            name
            email
            phone
            dob
            paper_id
            insured_certificates(where: { deleted_at: { _is_null: true } }) {
              id
              effective_date
              expiry_date
              phone
              policy { id policy_number }
            }
          }
        }
      `),
      variables: {
        where: {
          _or: conditions,
          deleted_at: { _is_null: true },
        },
      },
    });

    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { matchCount: (data as any)?.insured_persons?.length ?? 0 },
    };
  },
};
