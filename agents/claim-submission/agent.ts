import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import dedent from "dedent";

import { bedrockSonnet } from "../shared/model.ts";
import { insuredTool, icdTool, medicalProviderTool, medicalProvidersTool } from "../shared/tools/index.ts";
import { banksTool, verifyBankAccountTool, sendOtpTool } from "./tools/index.ts";

type ClaimSubmissionAgentParams = {
  allowedCertificateIds?: string[];
  documentAnalysis: string;
  pageCount: number;
};

/**
 * Creates a claim submission agent that extracts information from documents
 * and submits claims using the AI agent.
 */
export async function createClaimSubmissionAgent({
  allowedCertificateIds,
  documentAnalysis,
  pageCount,
}: ClaimSubmissionAgentParams) {
  const certificateRestriction = allowedCertificateIds?.length
    ? `\n      **Certificate Restriction**:
        - You can ONLY submit claims for the following insured certificate IDs: ${allowedCertificateIds.join(", ")}
        - If the found certificate ID is not in this list, inform the user and DO NOT submit the claim`
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

    **Multi-Claim Grouping** (CRITICAL):
      - A "claim group" is a unique combination of: insured person + medical event date + medical provider.
      - Before submitting, present a summary listing all identified claim groups.

    **Document Pages**: The uploaded documents have ${pageCount} pages (0-indexed).

    **Submission Order**:
      1. Analyze ALL documents and identify ALL claim groups.
      2. For EACH unique insured person, call findInsured ONCE.
      3. Check OTP requirements. If OTP is required, send it ONCE before any claim submission.
      4. Submit claims one by one.
      5. After ALL claims are submitted, provide a final summary.

    **Rules**:
      - NEVER submit a claim without a valid insured certificate ID
      - Always verify amounts match between prescription and invoice
      - Use source: "AI_SUBMISSION" for claims submitted through this agent
      - Ensure dates are in ISO format (YYYY-MM-DD)${certificateRestriction}
  `;

  let documentInjected = false;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockSonnet,
      tools: [
        banksTool,
        verifyBankAccountTool,
        sendOtpTool,
        insuredTool,
        icdTool,
        medicalProviderTool,
        medicalProvidersTool,
      ],
      thinkingLevel: "medium",
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const result = [...messages];

      if (!documentInjected && documentAnalysis) {
        const userMessageCount = messages.filter((m) => "role" in m && m.role === "user").length;
        if (userMessageCount <= 1) {
          documentInjected = true;
          result.push({
            role: "user",
            content: `[DOCUMENT ANALYSIS]\n\n${documentAnalysis}\n\n[END DOCUMENT ANALYSIS]\n\nPlease analyze the above medical documents and extract all information needed to submit insurance claims.`,
            timestamp: Date.now(),
          });
        }
      }

      return result;
    },
  });

  return agent;
}
