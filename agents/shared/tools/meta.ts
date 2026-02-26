import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../graphql-client.ts";

const client = getClient();

const IcdMetadataDocument = graphql(`
  query IcdV2($where: metadata_bool_exp!, $limit: Int!, $offset: Int!) {
    metadata(where: $where, limit: $limit, offset: $offset) {
      id title value
    }
  }
`);

export const icdTool: AgentTool = {
  name: "icd",
  label: "Searching ICDs",
  description: "Get the icd by codes",
  parameters: Type.Object({
    codes: Type.Array(Type.String({ description: "The codes of the icds" })),
    limit: Type.Number({ description: "The limit of the icds" }),
    offset: Type.Number({ description: "The offset of the icds" }),
  }),
  execute: async (toolCallId, { codes, limit, offset }) => {
    const { data } = await client.query({
      query: IcdMetadataDocument,
      variables: { limit, offset, where: { locale: { _eq: "vi-VN" }, value: { _in: codes } } },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data?.metadata) }],
      details: { codes },
    };
  },
};
