import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../../shared/graphql-client.ts";

export const saveAssessedDiagnosesTool: AgentTool = {
  name: "saveAssessedDiagnoses",
  label: "Save Assessed Diagnoses",
  description:
    "Save assessed ICD diagnoses for a submitted claim. Call this AFTER submitClaim succeeds, " +
    "using the ICD UUIDs obtained from the icd tool.",
  parameters: Type.Object({
    claimCaseId: Type.String({ description: "The claim case ID returned by submitClaim" }),
    icdIds: Type.Array(Type.String(), { description: "Array of ICD metadata UUIDs from the icd tool" }),
  }),
  execute: async (_toolCallId, params: any) => {
    try {
      const data = await gqlQuery<{ insertClaimCaseAssessedDiagnoses: { affectedRows: number } }>(
        `mutation SaveAssessedDiagnoses($objects: [InsertClaimCaseAssessedDiagnosesObjectInput!]!) {
          insertClaimCaseAssessedDiagnoses(objects: $objects) {
            affectedRows
          }
        }`,
        {
          objects: params.icdIds.map((icdId: string) => ({
            claimCaseId: params.claimCaseId,
            icdMetadataId: icdId,
          })),
        },
      );

      const affected = data.insertClaimCaseAssessedDiagnoses?.affectedRows ?? 0;
      return {
        content: [{ type: "text", text: JSON.stringify({ success: true, affected_rows: affected }) }],
        details: { claimCaseId: params.claimCaseId, icdCount: params.icdIds.length },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error saving assessed diagnoses: ${error instanceof Error ? error.message : "Unknown error"}` }],
        details: { error: true },
        isError: true,
      };
    }
  },
};
