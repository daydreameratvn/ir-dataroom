import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../graphql-client.ts";

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
    const data = await gqlQuery<{ metadata: any[] }>(
      `query Icd($where: MetadataBoolExp!, $limit: Int!, $offset: Int!) {
        metadata(where: $where, limit: $limit, offset: $offset) {
          metadataId title value
        }
      }`,
      { limit, offset, where: { locale: { _eq: "vi-VN" }, value: { _in: codes } } },
    );

    // Map metadataId → id for backward compatibility with agent prompts
    const mapped = data.metadata?.map((m: any) => ({ ...m, id: m.metadataId }));
    return {
      content: [{ type: "text", text: JSON.stringify(mapped) }],
      details: { codes },
    };
  },
};
