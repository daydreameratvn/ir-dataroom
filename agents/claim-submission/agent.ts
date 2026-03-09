import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";
import dedent from "dedent";

import { bedrockSonnet } from "../shared/model.ts";
import { insuredTool, icdTool, medicalProviderTool, medicalProvidersTool } from "../shared/tools/index.ts";
import {
  banksTool,
  verifyBankAccountTool,
  findInsuredTool,
  lastBankInfoTool,
  saveAssessedDiagnosesTool,
  sendOtpTool,
  submitClaimTool,
  createUploadDocumentsTool,
} from "./tools/index.ts";
import type { DocumentInfo } from "./tools/index.ts";

type ClaimSubmissionAgentParams = {
  allowedCertificateIds?: string[];
  documentAnalysis?: string;
  documents?: DocumentInfo[];
  pageCount?: number;
  /** Pre-downloaded image blocks for vision analysis (avoids re-downloading on each turn) */
  imageBlocks?: ImageContent[];
  /** Pre-filled messages for session resumption */
  resumeMessages?: AgentMessage[];
};

/**
 * Download document images and convert to pi-ai ImageContent blocks.
 * Call this once at session creation and cache the result.
 */
export async function downloadDocumentImages(documents: DocumentInfo[]): Promise<ImageContent[]> {
  const blocks: ImageContent[] = [];
  for (const doc of documents) {
    try {
      const response = await fetch(doc.fileUrl);
      if (!response.ok) {
        console.warn(`[agent] Failed to download ${doc.fileUrl}: ${response.status}`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      blocks.push({
        type: "image",
        data: Buffer.from(buffer).toString("base64"),
        mimeType: doc.fileType || "image/jpeg",
      });
    } catch (err) {
      console.warn(`[agent] Error downloading ${doc.fileUrl}:`, err instanceof Error ? err.message : err);
    }
  }
  return blocks;
}

/**
 * Creates a claim submission agent that extracts information from documents
 * and submits claims using the AI agent.
 */
export async function createClaimSubmissionAgent({
  allowedCertificateIds,
  documentAnalysis,
  documents = [],
  pageCount,
  imageBlocks,
  resumeMessages,
}: ClaimSubmissionAgentParams) {
  const effectivePageCount = pageCount ?? documents.length;
  const certificateRestriction = allowedCertificateIds?.length
    ? `\n      **Certificate Restriction**:
        - You can ONLY submit claims for the following insured certificate IDs: ${allowedCertificateIds.join(", ")}
        - If the found certificate ID is not in this list, inform the user and DO NOT submit the claim`
    : "";

  const hasDocuments = documents.length > 0;
  const documentUploadInstruction = hasDocuments
    ? `\n      7. After EACH claim is submitted, call uploadDocuments with the claimCaseId to attach documents.`
    : "";

  const systemPrompt = dedent`
    **Role**:
      - You are an insurance claim submission specialist with expertise in extracting information from medical documents.
      - Your task is to analyze the provided medical documents and submit claims with accurate information.
      - Responses should be in Vietnamese.

    **Goal**: Extract information from the provided medical documents, identify ALL distinct claims, and submit each one separately.

    **Document Analysis**:
      - Prescription papers (Đơn thuốc): Extract diagnosis, treatment method, medications, patient name, patient ID (CCCD/CMND)
      - VAT Invoices (Hóa đơn VAT): Extract total amounts, service details
      - Medical test results: Extract test types and results
      - Receipts/Payment lists (Bảng kê/Phiếu thu): Extract itemized costs

    **Key Fields to Extract**:
      - Patient: name, CCCD/CMND, date of birth
      - Medical: provider, examination date, diagnosis, ICD codes, treatment method
      - Financial: request amount, benefit type (OutPatient/InPatient)
      - Payment: bank name, account number, account holder name

    **ICD Code Lookup** (CRITICAL):
      - From the diagnosis, determine the appropriate ICD-10 codes (e.g. M54.2 for cervicalgia, M43.5 for vertebral subluxation)
      - Call the \`icd\` tool with those code strings to get their UUIDs
      - Pass the UUIDs as \`icdCodeIds\` to \`submitClaim\` (these become input diagnoses)
      - After submitClaim succeeds, call \`saveAssessedDiagnoses\` with the same ICD UUIDs and the claimCaseId (these become assessed diagnoses)

    **Multi-Claim Grouping** (CRITICAL):
      - A "claim group" is a unique combination of: insured person + medical event date + medical provider.
      - Before submitting, present a summary listing all identified claim groups.

    **Document Pages**: The uploaded documents have ${effectivePageCount} pages (0-indexed).

    **Submission Order** (ALWAYS complete steps 1-5 in a SINGLE turn — do NOT stop and wait for user confirmation):
      1. Analyze ALL documents and identify ALL claim groups.
      2. For EACH unique insured person, call findInsured ONCE to look up by name, phone, or CCCD/CMND.
      3. For found certificates, call lastBankInfo to auto-retrieve previously used bank account.
      4. Determine ICD-10 codes from the diagnosis and call \`icd\` to get their UUIDs.
      5. Send OTP ONCE (call sendOtp with the insured person's email or phone). STOP and wait for user to provide the OTP code.
      6. After the user provides the OTP, submit claims one by one using submitClaim — include \`icdCodeIds\`.${documentUploadInstruction}
      ${hasDocuments ? "8. After uploading documents, call saveAssessedDiagnoses with the ICD UUIDs and claim case ID." : "7. After submitClaim, call saveAssessedDiagnoses with the ICD UUIDs and claim case ID."}
      ${hasDocuments ? "9" : "8"}. After ALL claims are submitted, provide a final summary.

    **Rules**:
      - NEVER submit a claim without a valid insured certificate ID
      - NEVER submit a claim without icdCodeIds — always look up ICD codes first
      - Always verify amounts match between prescription and invoice
      - Ensure dates are in ISO format (YYYY-MM-DD)
      - After submitClaim succeeds, ALWAYS call uploadDocuments to attach documents to the claim
      - After uploadDocuments succeeds, ALWAYS call saveAssessedDiagnoses with the same ICD UUIDs${certificateRestriction}
  `;

  // Build tools list — uploadDocuments is a factory that captures the documents array
  const uploadDocumentsTool = createUploadDocumentsTool(documents);

  // If resuming, skip document injection (it's already in the messages)
  let documentInjected = (resumeMessages?.length ?? 0) > 0;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockSonnet,
      tools: [
        findInsuredTool,
        insuredTool,
        lastBankInfoTool,
        banksTool,
        verifyBankAccountTool,
        icdTool,
        medicalProviderTool,
        medicalProvidersTool,
        saveAssessedDiagnosesTool,
        sendOtpTool,
        submitClaimTool,
        uploadDocumentsTool,
      ],
      thinkingLevel: "medium",
      messages: resumeMessages ?? [],
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const result = [...messages];

      if (!documentInjected) {
        const userMessageCount = messages.filter((m) => "role" in m && m.role === "user").length;
        if (userMessageCount <= 1) {
          documentInjected = true;

          if (documentAnalysis) {
            // Inject pre-analyzed text
            result.push({
              role: "user",
              content: `[DOCUMENT ANALYSIS]\n\n${documentAnalysis}\n\n[END DOCUMENT ANALYSIS]\n\nPlease analyze the above medical documents and extract all information needed to submit insurance claims.`,
              timestamp: Date.now(),
            });
          } else if (imageBlocks && imageBlocks.length > 0) {
            // Inject document images for vision analysis
            result.push({
              role: "user",
              content: [
                ...imageBlocks,
                {
                  type: "text" as const,
                  text: `These are ${imageBlocks.length} medical document images. Analyze them thoroughly and extract all information needed to submit insurance claims. Extract: patient name, ID, DOB, medical provider, examination dates, diagnoses, treatment methods, amounts, and any ICD codes.`,
                },
              ],
              timestamp: Date.now(),
            });
          }
        }
      }

      return result;
    },
  });

  return agent;
}
