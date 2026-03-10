import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../graphql-client.ts";

export const medicalProviderTool: AgentTool = {
  name: "medicalProvider",
  label: "Searching Medical Providers",
  description: "Get the medical provider by name and address",
  parameters: Type.Object({
    name: Type.String({ description: "The name of the medical provider" }),
    address: Type.String({ description: "The address of the medical provider" }),
  }),
  execute: async (toolCallId, { name, address }) => {
    const data = await gqlQuery<{ mpMedicalProviders: any[] }>(
      `query MedicalProvider($where: MpMedicalProvidersBoolExp!) {
        mpMedicalProviders(where: $where) { medicalProviderId name address }
      }`,
      { where: { address: { _ilike: `%${address}%` }, name: { _ilike: `%${name}%` } } },
    );

    const mapped = {
      mp_medical_providers: data.mpMedicalProviders?.map((p: any) => ({ ...p, id: p.medicalProviderId })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
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
    const data = await gqlQuery<{ mpMedicalProviders: any[] }>(
      `query MedicalProviders($where: MpMedicalProvidersBoolExp, $limit: Int!, $offset: Int!) {
        mpMedicalProviders(where: $where, limit: $limit, offset: $offset) {
          medicalProviderId name address
        }
      }`,
      { limit, offset, where },
    );

    const mapped = {
      mp_medical_providers: data.mpMedicalProviders?.map((p: any) => ({ ...p, id: p.medicalProviderId })),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      details: { limit, offset },
    };
  },
};
