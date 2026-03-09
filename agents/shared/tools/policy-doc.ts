import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../graphql-client.ts";
import { downloadDocumentPages, listPolicyDocuments } from "../services/google-drive.ts";

const client = getClient();

// ============================================================================
// GraphQL: Resolve claim code → insurer/company/policy context
// ============================================================================

const ClaimPolicyContextDocument = graphql(`
  query ClaimPolicyContextV2($code: String!) {
    claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
      id
      insured_certificate {
        id
        policy {
          id
          policy_number
          insurer_company {
            company_id
            name
          }
        }
      }
    }
  }
`);

// ============================================================================
// Tools
// ============================================================================

export const policyDocSearchTool: AgentTool = {
  name: "policyDocSearch",
  label: "Search Policy Documents",
  description:
    "Search for policy documents (contracts, T&C, amendments, member lists, blacklists) in the shared Drive. " +
    "Navigates the folder hierarchy by insurer name and company name. " +
    "Returns a categorized file listing with file IDs that can be fetched with policyDocFetch. " +
    "Use claimCode to auto-resolve insurer/company/policy from the database, or provide names directly.",
  parameters: Type.Object({
    claimCode: Type.Optional(
      Type.String({ description: "Claim code to auto-resolve insurer, company, and policy number from the database" }),
    ),
    insurerName: Type.Optional(
      Type.String({ description: "Name of the insurer (e.g. 'Bảo Việt', 'PVI'). Required if claimCode is not provided." }),
    ),
    companyName: Type.Optional(
      Type.String({ description: "Name of the insured company (e.g. 'CÔNG TY TNHH ABC')" }),
    ),
    policyNumber: Type.Optional(
      Type.String({ description: "Policy number to narrow down to a specific policy folder" }),
    ),
  }),
  execute: async (toolCallId, params) => {
    let insurerName = params.insurerName;
    let companyName = params.companyName;
    let policyNumber = params.policyNumber;

    // Auto-resolve from claim code if provided
    if (params.claimCode) {
      const { data } = await client.query({
        query: ClaimPolicyContextDocument,
        variables: { code: params.claimCode },
      });
      const claim = data?.claim_cases?.[0];
      if (!claim) {
        return {
          content: [{ type: "text", text: `ERROR: Claim code "${params.claimCode}" not found.` }],
          details: { error: true },
          isError: true,
        };
      }
      const cert = claim.insured_certificate;
      const policy = cert?.policy;
      const insurer = policy?.insurer_company;

      if (insurer?.name && !insurerName) insurerName = insurer.name;
      if (policy?.policy_number && !policyNumber) policyNumber = policy.policy_number;
    }

    if (!insurerName) {
      return {
        content: [{ type: "text", text: "ERROR: insurerName is required. Provide it directly or use claimCode to auto-resolve." }],
        details: { error: true },
        isError: true,
      };
    }

    try {
      const result = await listPolicyDocuments({
        insurerName,
        companyName,
        policyNumber,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: {
          insurerName: result.insurerName,
          companyName: result.companyName,
          fileCount: result.files.length,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `ERROR: ${message}` }],
        details: { error: true },
        isError: true,
      };
    }
  },
};

export const policyDocFetchTool: AgentTool = {
  name: "policyDocFetch",
  label: "Fetch Policy Document",
  description:
    "Download a PDF document from Drive and return its pages as images for visual analysis. " +
    "Use the file ID from policyDocSearch results. These are scanned documents — read the images " +
    "to extract terms, conditions, coverage details, exclusions, and other policy information. " +
    "Returns up to 20 pages. Results are cached for 24 hours.",
  parameters: Type.Object({
    fileId: Type.String({ description: "Google Drive file ID of the document to fetch (from policyDocSearch results)" }),
    fileName: Type.Optional(Type.String({ description: "File name for logging/display purposes" })),
  }),
  execute: async (toolCallId, { fileId, fileName }) => {
    try {
      const pages = await downloadDocumentPages(fileId);
      return {
        content: pages.map((p) => ({ type: "image" as const, data: p.data, mimeType: p.mimeType })),
        details: {
          fileId,
          fileName: fileName ?? null,
          pageCount: pages.length,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `ERROR: Failed to fetch document ${fileId}${fileName ? ` (${fileName})` : ""}: ${message}` }],
        details: { error: true, fileId },
        isError: true,
      };
    }
  },
};
