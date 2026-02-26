import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../graphql-client.ts";

const client = getClient();

const MedicalProviderDocument = graphql(`
  query MedicalProviderV2($where: mp_medical_providers_bool_exp!) {
    mp_medical_providers(where: $where) { id name address }
  }
`);

const MedicalProvidersDocument = graphql(`
  query MedicalProvidersV2($where: mp_medical_providers_bool_exp, $limit: Int!, $offset: Int!) {
    mp_medical_providers(where: $where, limit: $limit, offset: $offset, order_by: [{ claim_cases_aggregate: { count: desc } }]) {
      id name address
    }
  }
`);

export const medicalProviderTool: AgentTool = {
  name: "medicalProvider",
  label: "Searching Medical Providers",
  description: "Get the medical provider by name and address",
  parameters: Type.Object({
    name: Type.String({ description: "The name of the medical provider" }),
    address: Type.String({ description: "The address of the medical provider" }),
  }),
  execute: async (toolCallId, { name, address }) => {
    const { data } = await client.query({
      query: MedicalProviderDocument,
      variables: { where: { address: { _ilike: `%${address}%` }, name: { _ilike: `%${name}%` } } },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { name, address },
    };
  },
};

export const medicalProvidersTool: AgentTool = {
  name: "medicalProviders",
  label: "List Medical Providers",
  description: "Get list of medical providers, should not get more than 200 per request",
  parameters: Type.Object({
    limit: Type.Number({ description: "The limit of the medical providers, should not get more than 20 per request" }),
    offset: Type.Number({ description: "The offset of the medical providers" }),
    where: Type.Object({
      _or: Type.Array(
        Type.Object({
          address: Type.Optional(Type.Object({
            _ilike: Type.String({ description: "The address of the medical provider, case insensitive" }),
          })),
          name: Type.Optional(Type.Object({
            _ilike: Type.String({ description: "The name of the medical provider, case insensitive" }),
          })),
        }),
        { description: "The where clause for the medical providers" },
      ),
    }),
  }),
  execute: async (toolCallId, { limit, offset, where }) => {
    const { data } = await client.query({
      query: MedicalProvidersDocument,
      variables: { limit, offset, where: { ...where, deleted_at: { _is_null: true } } },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { limit, offset },
    };
  },
};
