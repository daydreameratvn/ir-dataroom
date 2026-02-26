import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import type { Message } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";
import BPromise from "bluebird";
import dedent from "dedent";
import { fileTypeFromStream } from "file-type";
import got from "got";

import { getClient } from "../shared/graphql-client.ts";
import { wrapToolForApproval } from "../shared/approval.ts";
import { bedrockOpus } from "../shared/model.ts";
import {
  approveTool,
  assessBenefitTool,
  balanceTool,
  benefitsTool,
  claimTool,
  createSignOffTool,
  getClaimContextForTemplatesTool,
  getInsurerPendingCodeMappingTool,
  getPendingCodeMappingTool,
  getPendingCodeTemplatesTool,
  googleSearchTool,
  icdTool,
  insuredTool,
  issuePendingCodesTool,
  medicalProviderTool,
  medicalProvidersTool,
  addSlackReactionTool,
  saveDetailFormTool,
  sendSlackMessageTool,
} from "../shared/tools/index.ts";
import { invokeComplianceAgentTool } from "./tools/index.ts";

export async function createClaimAssessorAgent(claimCode: string) {
  const client = getClient();

  // 1. Pre-fetch claim documents
  const { data } = await client.query({
    query: graphql(`
      query ClaimCaseDocumentsV2($where: claim_documents_bool_exp!) {
        claim_documents(where: $where) {
          id
          file { id bucket_name_v2 bucket_object_key url }
        }
      }
    `),
    variables: {
      where: {
        claim_case: { code: { _eq: claimCode } },
        file: { original_file_id: { _is_null: true } },
        type: { _nin: ["SignOffForm"] },
      },
    },
  });

  const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

  const files = await BPromise.map(
    data?.claim_documents ?? [],
    async (document) => {
      try {
        if (document.file?.url == null) return null;
        const fileType = await fileTypeFromStream(got.stream(document.file.url));
        if (fileType == null) return null;
        if (!SUPPORTED_IMAGE_TYPES.has(fileType.mime)) return null;
        const buffer = await got(document.file.url).buffer();
        const base64 = buffer.toString("base64");
        return { data: base64, mimeType: fileType.mime };
      } catch (error) {
        console.error(error);
        return null;
      }
    },
    { concurrency: 5 },
  );
  const validFiles = files.filter(Boolean) as { data: string; mimeType: string }[];

  // 2. Check if saveDetailForm fields are already populated
  const { data: claimData } = await client.query({
    query: graphql(`
      query ClaimCaseDetailCheckV2($code: bpchar!) {
        claim_cases(where: { code: { _eq: $code } }, limit: 1) {
          physical_examination_date
          treatment_method
        }
      }
    `),
    variables: { code: claimCode },
  });
  const claimCase = claimData?.claim_cases?.[0];
  const hasDetailData = !!(claimCase?.physical_examination_date && claimCase?.treatment_method);

  // 3. Build tool array (wrap approval tools)
  const allTools: AgentTool[] = [
    claimTool,
    assessBenefitTool,
    createSignOffTool,
    approveTool,
    insuredTool,
    benefitsTool,
    balanceTool,
    medicalProviderTool,
    medicalProvidersTool,
    icdTool,
    invokeComplianceAgentTool,
    getPendingCodeMappingTool,
    getClaimContextForTemplatesTool,
    getPendingCodeTemplatesTool,
    getInsurerPendingCodeMappingTool,
    issuePendingCodesTool,
    googleSearchTool,
    sendSlackMessageTool,
    addSlackReactionTool,
    ...(!hasDetailData ? [saveDetailFormTool] : []),
  ].map((t) => wrapToolForApproval(t as AgentTool & { _realExecute?: AgentTool["execute"] }));

  let documentsInjected = false;

  const systemPrompt = dedent`
    **Role**:
      - You are an insurance claim handler expert with 10 years of experience.
      - Responses and thoughts must be in Vietnamese.
      - You are currently working on claim code: **${claimCode}**. Always use this code when calling tools.

    **Document Compliance Check (FIRST STEP)**:
      Before starting assessment work, invoke the Document Compliance Agent:
      1. Call invokeComplianceAgent tool with the claim code
      2. Wait for the compliance report — it returns structured result with compliant, missingRequired, report
      3. The compliance sub-agent does NOT issue pending codes — only YOU (the assessor) issue them
      4. Show the user the compliance report summary
      5. If missingRequired is non-empty, YOU must issue pending codes using the pending code tools:
         a. Call getPendingCodeMapping with the missing document types from the compliance result
         b. Call getClaimContextForTemplates to get placeholder values (CSYT, dates, etc.)
         c. Call getPendingCodeTemplates to get base template text
         d. Fill placeholders and call issuePendingCodes to create the records
      6. Continue with the assessment workflow below regardless of compliance result
      7. Include compliance findings in the final assessment summary

    **Skills**:
    **Assessment** (proceed after compliance check):
      - Verify the request amount matches with the claim document.
      - Verify with at least 5 other claim cases to confirm the assessment.
      - Drugs/Medicines:
        1. Drugs must be valid for treatment of the diagnosis.
        2. Every drug on prescription must be present on invoice. This is for excluding drugs money that are not covered by the policy.
        3. Drugs that are covered must have their brand name registered in Vietnam with a valid registration number. Registered drugs can be found using googleSearch tool. Drugs paid by social insurance can be skipped.
        4. If a drug that is not covered or not registered and is not present on invoice, skip assessing this drug.
      - Document validation:
        - Prescriptions:
          - Prescription must be signed by a doctor.
          - Prescription must be signed on the date of the treatment.
        - VAT Invoices:
          - Invoice items must be able to explain prescription items and examination fees.
          - If invoice does not have item details, receipts or payment list must be present to explain the invoice.
        - Medical tests:
          - Medical tests must be valid for treatment of the diagnosis. Otherwise, these fees are not covered.
          - Medical test results must be present to explain the tests.
          - Positive test results are assessed as covered, bundled into physical examination benefits for Out Patient cases.
          - Tất cả chi phí cận lâm sàng kết quả dương tính sẽ được chi trả chung quyền lợi khám ngoại trú.

    **Assessment Workflow (MUST complete ALL steps, do NOT stop until approve)**:
      1. Skip saveDetailForm if claim already has diagnosis, medical_provider, and assessed_diagnoses populated. Only call it when these fields are missing.
      2. Assess benefits via assessBenefit for each applicable benefit type — this is the MOST IMPORTANT step.
      3. Create sign-off via createSignOff with full assessment summary
      4. Approve claim via approve
      You MUST call assessBenefit. Do NOT stop before calling it.

    **Results**: for provided claim
      - Return the assessment summary with explanations in markdown format. If similar cases provide none, skip this.
      - Treatment date.
      - List of icd codes.
      - Medical provider id with its name. You can retrieve this using medicalProviders tool and information from claim document.

    **Meta info**:
      - Slack:
        - Send slack messages when claim is approved, assessed
        - channelID: C0A9MDAUR6Y
  `;

  // 4. Create the Agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockOpus,
      tools: allTools,
      thinkingLevel: "medium",
    },

    convertToLlm: (messages: AgentMessage[]): Message[] => {
      return messages.filter((m) => {
        if (typeof m === "object" && "role" in m) {
          if (m.role === "approvalRequest" || m.role === "approvalResponse") return false;
          return true;
        }
        return true;
      }) as Message[];
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const result = [...messages];

      if (!documentsInjected && validFiles.length > 0) {
        const userMessageCount = messages.filter((m) => "role" in m && m.role === "user").length;
        if (userMessageCount <= 1) {
          documentsInjected = true;
          const imageContent = validFiles.map((f) => ({
            type: "image" as const,
            data: f.data,
            mimeType: f.mimeType,
          }));
          result.push({
            role: "user",
            content: imageContent,
            timestamp: Date.now(),
          });
        }
      }

      const hasToolCall = (name: string) =>
        messages.some((m) =>
          "role" in m && m.role === "assistant" && Array.isArray(m.content) &&
          m.content.some((c: any) => c.type === "toolCall" && c.name === name),
        );

      const hasClaim = hasToolCall("claim");
      const hasBenefits = hasToolCall("benefits");
      const hasInsured = hasToolCall("insured");
      const hasAssessBenefit = hasToolCall("assessBenefit");
      const hasCreateSignOff = hasToolCall("createSignOff");
      const hasApprove = hasToolCall("approve");

      const dataGatheringDone = hasClaim && (hasBenefits || hasInsured);

      if (dataGatheringDone && !hasAssessBenefit) {
        result.push({
          role: "user",
          content: "[SYSTEM] Data gathering is complete. You MUST now call the assessBenefit tool to assess the claim benefits. Do NOT skip this step.",
          timestamp: Date.now(),
        });
      } else if (hasAssessBenefit && !hasCreateSignOff) {
        result.push({
          role: "user",
          content: "[SYSTEM] Benefits assessed. You MUST now call createSignOff to create the assessment sign-off document.",
          timestamp: Date.now(),
        });
      } else if (hasCreateSignOff && !hasApprove) {
        result.push({
          role: "user",
          content: "[SYSTEM] Sign-off created. You MUST now call approve to approve the claim case.",
          timestamp: Date.now(),
        });
      }

      return result;
    },
  });

  return agent;
}
