import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery } from "../../shared/graphql-client.ts";

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
 * Creates an uploadDocuments tool that inserts files + claim_documents
 * via the sweetpotato DDN subgraph.
 *
 * DDN doesn't support nested inserts, so we insert the file first,
 * then insert the claim_document linking to it.
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

      const results: Array<{ success: boolean; fileName: string; documentId?: string; error?: string }> = [];

      for (const doc of documents) {
        try {
          // Step 1: Insert claim_document record
          const docData = await gqlQuery<{ insertClaimDocuments_1: { affectedRows: number; returning: any[] } }>(
            `mutation InsertClaimDocument($objects: [InsertClaimDocumentsObjectInput_1!]!) {
              insertClaimDocuments_1(objects: $objects) {
                affectedRows
                returning { claimDocumentId claimCaseId type }
              }
            }`,
            {
              objects: [{
                claimCaseId,
                type: doc.documentType ?? "OtherPaper",
                source: "AGENT_CARE_APP",
              }],
            },
          );

          const claimDocumentId = docData.insertClaimDocuments_1?.returning?.[0]?.claimDocumentId;
          if (!claimDocumentId) {
            results.push({ success: false, fileName: doc.fileName, error: "Failed to insert claim document" });
            continue;
          }

          // Step 2: Insert file record linked to the claim_document
          await gqlQuery<{ insertFiles: { affectedRows: number } }>(
            `mutation InsertFile($objects: [InsertFilesObjectInput!]!) {
              insertFiles(objects: $objects) {
                affectedRows
              }
            }`,
            {
              objects: [{
                claimDocumentId,
                name: doc.fileName,
                url: doc.fileUrl,
                bucketName: doc.bucket ?? "banyan-portal-documents",
                bucketNameV2: doc.bucket ?? "banyan-portal-documents",
                bucketObjectKey: doc.key ?? null,
                mimeType: doc.fileType ?? "application/octet-stream",
              }],
            },
          );

          results.push({
            success: true,
            fileName: doc.fileName,
            documentId: claimDocumentId,
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
