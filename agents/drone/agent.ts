import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import { graphql } from "@papaya/graphql/sdk";
import { generateText } from "ai";
import { vertex } from "@ai-sdk/google-vertex";
import BPromise from "bluebird";
import dedent from "dedent";
import { fileTypeFromStream } from "file-type";
import got from "got";

import { getClient } from "../shared/graphql-client.ts";
import { bedrockOpus } from "../shared/model.ts";
import {
  assessBenefitTool,
  balanceTool,
  benefitsTool,
  claimTool,
  createSignOffTool,
  googleSearchTool,
  icdTool,
  insuredTool,
  medicalProviderTool,
  medicalProvidersTool,
  saveDetailFormTool,
} from "../shared/tools/index.ts";
import { invokeComplianceAgentTool } from "../claim-assessor/tools/document-compliance.ts";

/**
 * Drone Agent — Pi-mono Agent with Bedrock Opus for Tier 1 chronic drug-only claims.
 * Fully autonomous (no approval wrapping). Stops after createSignOff.
 */
export async function createDroneAgent(claimCode: string) {
  const client = getClient();

  // 1. Pre-fetch claim documents
  const { data } = await client.query({
    query: graphql(`
      query DroneClaimDocumentsV2($where: claim_documents_bool_exp!) {
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

  const BEDROCK_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);
  const GEMINI_SUPPORTED_TYPES = new Set([
    "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
    "application/pdf",
  ]);

  // Detect file types
  const fileInfos = (await BPromise.map(
    data?.claim_documents ?? [],
    async (document) => {
      try {
        if (document.file?.url == null) return null;
        const fileType = await fileTypeFromStream(got.stream(document.file.url));
        if (fileType == null) return null;
        return { url: document.file.url, mimeType: fileType.mime, id: document.id };
      } catch {
        return null;
      }
    },
    { concurrency: 5 },
  )).filter(Boolean) as { url: string; mimeType: string; id: string }[];

  const geminiFiles = fileInfos.filter((f) => GEMINI_SUPPORTED_TYPES.has(f.mimeType));
  const bedrockImageInfos = fileInfos.filter((f) => BEDROCK_IMAGE_TYPES.has(f.mimeType));
  const bedrockImages = (await BPromise.map(
    bedrockImageInfos,
    async (f) => {
      try {
        const buffer = await got(f.url).buffer();
        return { data: buffer.toString("base64"), mimeType: f.mimeType };
      } catch {
        return null;
      }
    },
    { concurrency: 5 },
  )).filter(Boolean) as { data: string; mimeType: string }[];

  console.log(`[Drone] ${claimCode} files: ${fileInfos.length} detected, ${bedrockImages.length} images for Bedrock, ${geminiFiles.length} for Gemini`);

  // 2. Pre-analyze documents with Gemini Flash
  let documentAnalysis = "";
  if (geminiFiles.length > 0) {
    console.log(`[Drone] ${claimCode} pre-analyzing ${geminiFiles.length} documents with Gemini Flash...`);
    try {
      const fileParts = geminiFiles.map((f) => ({
        type: "file" as const,
        data: f.url,
        mediaType: f.mimeType,
      }));

      const result = await generateText({
        model: vertex("gemini-2.5-flash"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: dedent`You are a Vietnamese medical document analyst and insurance claim auditor. Analyze ALL the following claim documents comprehensively.

                  Extract ALL of the following in a single structured response:

                  ## 1. Invoice/Receipt Line Items (Hóa đơn/Bảng kê)
                  List EVERY line item with: item name, type (drug/test/infusion/consultation/other), cost in VND.
                  Format as a table: | Item | Type | Cost (VND) |

                  ## 2. Prescription Items (Đơn thuốc)
                  List ALL prescribed items with: drug name, dosage, quantity, usage instructions.
                  Note which doctor signed and the date.

                  ## 3. Diagnostic Test Results (Kết quả xét nghiệm)
                  For EACH test: test name, result value, reference range, interpretation (positive/negative/normal/abnormal).

                  ## 4. Doctor's Orders/Indications (Chỉ định điều trị)
                  List all treatment indications, procedures ordered, and medical notes.

                  ## 5. Cross-check: Invoice vs Prescription
                  Compare invoice line items against prescription. Flag any invoice item that does NOT have a corresponding prescription or doctor's indication.

                  ## 6. EXCLUSION VERDICT (CRITICAL)
                  Apply these insurance rules to determine the verdict for each item:
                  - **Rule A**: Diagnostic test with NEGATIVE result that does NOT serve the treatment → EXCLUDE.
                  - **Rule B**: Invoice item WITHOUT matching prescription or doctor's indication → SUPPLEMENTARY (yêu cầu bổ sung chỉ định). Do NOT exclude immediately.
                  - **Rule C**: Drug unrelated to the diagnosis → EXCLUDE.

                  Format as: | Item | Cost (VND) | Verdict (PAID/EXCLUDED/SUPPLEMENTARY) | Rule & Reason |
                  List EVERY invoice item with its verdict.
                  - Sum the total EXCLUDED amount (only items with EXCLUDE verdict).
                  - List SUPPLEMENTARY items separately.

                  **Instructions**:
                  - Read ALL text including fine print and handwritten notes
                  - Be precise with numbers, amounts, and drug names
                  - Include ALL items — do not summarize or skip any
                  - Respond in Vietnamese`,
              },
              ...fileParts,
            ],
          },
        ],
      });

      documentAnalysis = result.text;
      console.log(`[Drone] ${claimCode} Gemini pre-analysis done (${documentAnalysis.length} chars)`);
    } catch (error) {
      console.error(`[Drone] ${claimCode} Gemini pre-analysis error:`, error);
      documentAnalysis = "⚠️ Document pre-analysis failed. The agent must rely on other data sources.";
    }
  }

  // 3. Check if saveDetailForm fields are already populated
  const { data: claimData } = await client.query({
    query: graphql(`
      query DroneClaimDetailCheckV2($code: bpchar!) {
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

  // 4. Build tool array — NO approval wrapping, drone is fully autonomous
  const allTools: AgentTool[] = [
    claimTool,
    assessBenefitTool,
    createSignOffTool,
    insuredTool,
    benefitsTool,
    balanceTool,
    medicalProviderTool,
    medicalProvidersTool,
    icdTool,
    invokeComplianceAgentTool,
    googleSearchTool,
    ...(!hasDetailData ? [saveDetailFormTool] : []),
  ];

  let documentsInjected = false;

  const systemPrompt = dedent`
    **Role**:
      - You are an insurance claim handler specializing in chronic disease drug-only outpatient claims.
      - Responses and thoughts must be in Vietnamese.
      - You are currently working on claim code: **${claimCode}**. Always use this code when calling tools.

    **Document Compliance Check (FIRST STEP)**:
      Before starting assessment work, invoke the Document Compliance Agent:
      1. Call invokeComplianceAgent tool with the claim code
      2. Wait for the compliance report
      3. Show the compliance report summary
      4. If compliance fails (documents missing), STOP IMMEDIATELY. Do NOT call assessBenefit, createSignOff, or any other assessment tool.
      5. If compliance passes, continue with the assessment workflow below.

    **Context**:
      - This claim is a Tier 1 chronic disease case (Hypertension, Diabetes, Dyslipidemia, GERD, Asthma, etc.)
      - Treatment is drug-only outpatient — no surgery, no procedures.

    **Skills**:
    **Assessment** (proceed after compliance check passes):
      - Verify the request amount matches with the claim document.
      - Verify with at least 5 other claim cases to confirm the assessment.
      - **Drug Validation (MANDATORY for every claim)**:
        1. Extract ALL drugs from the prescription — use the DOCUMENT ANALYSIS section.
        2. Cross-reference with invoice — match each drug from the prescription to the invoice line items.
        3. Check against exclusion history from past claims.
        4. For EACH drug, verify it is valid for treating the diagnosed ICD codes.
        5. **Vietnamese Registration Number Check (MUST DO)**: Use googleSearch for each drug.
        6. Drugs paid by social insurance (BHXH) can be skipped.
        7. If a drug is not covered, not registered, not on the invoice, or excluded per history → do not include in paid amount.
      - **Diagnostic Test Exclusion**: Negative test results not serving the treatment are non_paid.
      - **Prescription/Indication Requirement**: Items without prescription = SUPPLEMENTARY REQUEST, not immediate exclusion.
      - Document validation: Prescriptions must be signed, invoice items must explain prescription items.

    **Amount Calculation**:
      - non_paid_amount = sum of all EXCLUDED costs. SUPPLEMENTARY items NOT included.
      - covered_amount = request_amount - non_paid_amount
      - copay_amount = covered_amount * copay_ratio
      - shortfall_amount = amount exceeding benefit balance
      - total_paid_amount = request_amount - non_paid_amount - shortfall_amount - copay_amount

    **Assessment Workflow (MUST complete ALL steps)**:
      1. Call invokeComplianceAgent first.
      2. Call claim tool to get claim data.
      3. Call benefits and insured tools to get policy context.
      4. Skip saveDetailForm if claim already has diagnosis and medical_provider populated.
      5. Drug & line item validation (MANDATORY).
      6. Assess benefits via assessBenefit.
      7. Create sign-off via createSignOff.
      8. STOP after createSignOff. Do NOT call approve.

    **Rules**:
      - Do not issue pending codes — if compliance fails, just report and stop.
      - NEVER approve a denial case (total_paid_amount = 0).
      - If assessBenefit fails, STOP immediately.

    **Denial Precedent Rules (CRITICAL)**:
      - If 2+ most recent claims from same insured with similar ICDs were DENIED, do NOT override the denial pattern.
  `;

  // 5. Create the Agent
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: bedrockOpus,
      tools: allTools,
      thinkingLevel: "medium",
    },

    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const result = [...messages];

      if (!documentsInjected && bedrockImages.length > 0) {
        const userMessageCount = messages.filter((m) => "role" in m && m.role === "user").length;
        if (userMessageCount <= 1) {
          documentsInjected = true;
          const imageContent = bedrockImages.map((f) => ({
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

      const isAssessBenefitFailed = () => {
        for (const msg of messages) {
          if ("role" in msg && msg.role === "toolResult" && "toolName" in msg) {
            const toolMsg = msg as any;
            if (toolMsg.toolName === "assessBenefit") {
              if (toolMsg.isError) return true;
              const textContent = Array.isArray(toolMsg.content)
                ? toolMsg.content.find((c: any) => c.type === "text")
                : null;
              if (textContent?.text) {
                try {
                  const parsed = JSON.parse(textContent.text);
                  if (parsed?.createUpdateClaimDetail?.error) return true;
                  if (parsed?.createUpdateClaimDetail?.claimCaseDetailId === null) return true;
                } catch {
                  if (textContent.text.includes('"error":{') || textContent.text.includes('"claimCaseDetailId":null')) return true;
                }
              }
            }
          }
        }
        return false;
      };

      const isComplianceFailed = () => {
        for (const msg of messages) {
          if ("role" in msg && msg.role === "toolResult" && "toolName" in msg) {
            const toolMsg = msg as any;
            if (toolMsg.toolName === "invokeComplianceAgent" && !toolMsg.isError) {
              try {
                const textContent = Array.isArray(toolMsg.content)
                  ? toolMsg.content.find((c: any) => c.type === "text")
                  : null;
                if (textContent?.text) {
                  const parsed = JSON.parse(textContent.text);
                  if (parsed?.compliant === false) return true;
                }
              } catch { /* ignore */ }
            }
          }
        }
        return false;
      };

      const hasCompliance = hasToolCall("invokeComplianceAgent");
      const hasClaim = hasToolCall("claim");
      const hasBenefits = hasToolCall("benefits");
      const hasInsured = hasToolCall("insured");
      const hasAssessBenefit = hasToolCall("assessBenefit");
      const hasCreateSignOff = hasToolCall("createSignOff");

      const dataGatheringDone = hasCompliance && hasClaim && (hasBenefits || hasInsured);

      // Inject document analysis when data gathering is done
      if (dataGatheringDone && !isComplianceFailed() && documentAnalysis) {
        const alreadyInjectedAnalysis = messages.some((m) =>
          "role" in m && m.role === "user" && typeof m.content === "string" &&
          m.content.includes("DOCUMENT ANALYSIS"),
        );
        if (!alreadyInjectedAnalysis) {
          result.push({
            role: "user",
            content: `[DOCUMENT ANALYSIS & EXCLUSION VERDICT — from Gemini Flash Vision]\n\n${documentAnalysis}\n\n[END DOCUMENT ANALYSIS]\n\n⚠️ IMPORTANT: Use the EXCLUSION VERDICT to determine non_paid_amount for assessBenefit.`,
            timestamp: Date.now(),
          });
        }
      }

      // Tool sequencing hints
      if (dataGatheringDone && !hasAssessBenefit && !isComplianceFailed()) {
        result.push({
          role: "user",
          content: "[SYSTEM] Data gathering complete. Apply the EXCLUSION VERDICT from the DOCUMENT ANALYSIS, then call assessBenefit.",
          timestamp: Date.now(),
        });
      } else if (hasAssessBenefit && !isAssessBenefitFailed() && !hasCreateSignOff) {
        result.push({
          role: "user",
          content: "[SYSTEM] Benefits assessed. You MUST now call createSignOff.",
          timestamp: Date.now(),
        });
      }

      return result;
    },
  });

  return agent;
}
