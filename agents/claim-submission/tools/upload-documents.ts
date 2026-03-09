import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../../shared/graphql-client.ts";

export interface DocumentInfo {
  /** S3 URL of the document file */
  fileUrl: string;
  /** Original file name */
  fileName: string;
  /** MIME type (e.g. application/pdf, image/jpeg) */
  fileType?: string;
  /** Document classification (e.g. Prescription, Bill, MedicalCertificate) */
  documentType?: string;
  /** S3 bucket name */
  bucket?: string;
  /** S3 object key */
  key?: string;
}

/**
 * Creates an uploadDocuments tool that inserts claim_documents + files
 * on the Apple v2 endpoint, linking them to the submitted claim case.
 *
 * The documents array is captured from the handler input — the agent
 * only needs to provide the claimCaseId after a successful submitClaim call.
 */
export function createUploadDocumentsTool(documents: DocumentInfo[]): AgentTool {
  return {
    name: "uploadDocuments",
    label: "Upload Documents",
    description:
      `Attach ${documents.length} document(s) to a submitted claim. ` +
      "Call this AFTER submitClaim succeeds, passing the claimCaseId from the result. " +
      "This inserts document records and links the uploaded files to the claim.",
    parameters: Type.Object({
      claimCaseId: Type.String({ description: "The claim case ID (UUID) returned by submitClaim" }),
    }),
    execute: async (toolCallId, { claimCaseId }) => {
      if (documents.length === 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, message: "No documents to upload.", count: 0 }) }],
          details: { count: 0 },
        };
      }

      const client = getClient();
      const results: Array<{ success: boolean; fileName: string; documentId?: string; error?: string }> = [];

      for (const doc of documents) {
        try {
          const { data } = await client.mutate({
            mutation: graphql(`
              mutation InsertClaimDocumentWithFile($input: claim_documents_insert_input!) {
                insert_claim_documents_one(object: $input) {
                  id
                  claim_case_id
                  type
                  file { id url }
                }
              }
            `),
            variables: {
              input: {
                claim_case_id: claimCaseId,
                type: doc.documentType ?? "OtherPaper",
                source: "AGENT_CARE_APP",
                file: {
                  data: {
                    name: doc.fileName,
                    url: doc.fileUrl,
                    // bucket_name is required (NOT NULL) — legacy composite "bucket/prefix" format
                    bucket_name: doc.bucket ?? "banyan-portal-documents",
                    bucket_name_v2: doc.bucket ?? "banyan-portal-documents",
                    bucket_object_key: doc.key ?? null,
                    mime_type: doc.fileType ?? null,
                  },
                },
              },
            },
          });

          const inserted = (data as any)?.insert_claim_documents_one;
          results.push({
            success: true,
            fileName: doc.fileName,
            documentId: inserted?.id,
          });
        } catch (error) {
          console.error(`[uploadDocuments] Failed to insert document ${doc.fileName}:`, error instanceof Error ? error.message : error);
          results.push({
            success: false,
            fileName: doc.fileName,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      return {
        content: [{ type: "text", text: JSON.stringify({
          success: successCount === documents.length,
          totalUploaded: successCount,
          total: documents.length,
          results,
        }) }],
        details: { uploaded: successCount, total: documents.length },
      };
    },
  };
}
