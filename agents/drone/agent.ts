import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { Agent } from "@mariozechner/pi-agent-core";
import { vertex } from "@ai-sdk/google-vertex";
import { graphql } from "@papaya/graphql/sdk";
import { generateText } from "ai";
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
 *
 * Key optimizations:
 * - Parallel Gemini pre-analysis (runs in background during agent data gathering)
 * - Bedrock image skip when Gemini covers all files
 * - Batched Google search instructions
 * - skipCompliance option (fast pre-check done in runner)
 */
export async function createDroneAgent(claimCode: string, options?: { skipCompliance?: boolean; tier?: 1 | 2 }) {
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

  // Supported MIME types per model
  const BEDROCK_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);
  const GEMINI_SUPPORTED_TYPES = new Set([
    "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
    "application/pdf",
  ]);

  // Detect file types and prepare files for both models
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

  // For Gemini Flash: ALL supported types (PDFs + images) — use URLs directly
  const geminiFiles = fileInfos.filter((f) => GEMINI_SUPPORTED_TYPES.has(f.mimeType));

  // For Bedrock: only images NOT already covered by Gemini analysis.
  // If Gemini can analyze all files, skip expensive image download — agent uses Gemini analysis text.
  const imagesNotCoveredByGemini = fileInfos.filter(
    (f) => BEDROCK_IMAGE_TYPES.has(f.mimeType) && !GEMINI_SUPPORTED_TYPES.has(f.mimeType),
  );
  // Also include images if there are NO Gemini files at all (fallback to Bedrock vision)
  const bedrockImageInfos = geminiFiles.length === 0
    ? fileInfos.filter((f) => BEDROCK_IMAGE_TYPES.has(f.mimeType))
    : imagesNotCoveredByGemini;
  const bedrockImages = bedrockImageInfos.length > 0
    ? (await BPromise.map(
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
      )).filter(Boolean) as { data: string; mimeType: string }[]
    : [];

  console.log(`[Drone] ${claimCode} files: ${fileInfos.length} detected, ${bedrockImages.length} images for Bedrock, ${geminiFiles.length} for Gemini`);

  // 2. Start Gemini document pre-analysis as a background Promise (runs in parallel with agent data gathering)
  let documentAnalysisPromise: Promise<string> | null = null;
  if (geminiFiles.length > 0) {
    console.log(`[Drone] ${claimCode} starting Gemini pre-analysis in background (${geminiFiles.length} files)...`);
    const geminiStart = Date.now();
    const fileParts = geminiFiles.map((f) => ({
      type: "file" as const,
      data: f.url,
      mediaType: f.mimeType,
    }));

    documentAnalysisPromise = generateText({
      abortSignal: AbortSignal.timeout(120_000), // 120s cap
      model: vertex("gemini-2.5-flash"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: dedent`Bạn là chuyên gia phân tích hồ sơ bảo hiểm y tế Việt Nam. Phân tích TẤT CẢ tài liệu sau.

                Trả về KẾT QUẢ GỌN theo 3 phần:

                ## 1. Bảng kê chi phí (Invoice)
                | STT | Tên mục | Loại (thuốc/XN/truyền/khám/khác) | Chi phí (VND) |
                Liệt kê MỌI mục trên hóa đơn/bảng kê. Chính xác tên thuốc, số lượng, đơn giá.

                ## 2. Đơn thuốc & Chỉ định
                Liệt kê ngắn gọn: tên thuốc/chỉ định, liều lượng. Ghi rõ XN nào có kết quả ÂM TÍNH hay DƯƠNG TÍNH.

                ## 3. PHÁN QUYẾT LOẠI TRỪ (QUAN TRỌNG NHẤT)
                Quy tắc:
                - **A**: XN có kết quả ÂM TÍNH + không phục vụ điều trị → EXCLUDED
                - **B**: Mục trên hóa đơn KHÔNG có đơn thuốc/chỉ định tương ứng → SUPPLEMENTARY
                - **C**: Thuốc không liên quan chẩn đoán → EXCLUDED

                | Mục | Chi phí | Phán quyết (PAID/EXCLUDED/SUPPLEMENTARY) | Quy tắc & Lý do |
                Tổng EXCLUDED = ?đ. Liệt kê SUPPLEMENTARY riêng.

                **Yêu cầu**: Chính xác số tiền. Không bỏ sót mục nào. Trả lời bằng tiếng Việt.`,
            },
            ...fileParts,
          ],
        },
      ],
    }).then((result) => {
      console.log(`[Drone] ${claimCode} Gemini pre-analysis done in ${Date.now() - geminiStart}ms (${result.text.length} chars)`);
      return result.text;
    }).catch((error) => {
      console.error(`[Drone] ${claimCode} Gemini pre-analysis error:`, error);
      return "⚠️ Document pre-analysis failed. The agent must rely on other data sources.";
    });
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
  const skipCompliance = options?.skipCompliance ?? false;
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
    ...(!skipCompliance ? [invokeComplianceAgentTool] : []),
    googleSearchTool,
    ...(!hasDetailData ? [saveDetailFormTool] : []),
  ];

  // Track document injection state
  let documentsInjected = false;
  // Cache resolved document analysis so we only await the promise once
  let documentAnalysis = "";

  const systemPrompt = dedent`
    **Role**:
      - You are an insurance claim handler specializing in chronic disease drug-only outpatient claims.
      - Responses and thoughts must be in Vietnamese.
      - You are currently working on claim code: **${claimCode}**. Always use this code when calling tools.

${skipCompliance
      ? `    **Document Compliance**: Pre-checked and PASSED. All required documents are present. Proceed directly to assessment.`
      : `    **Document Compliance Check (FIRST STEP)**:
      Before starting assessment work, invoke the Document Compliance Agent:
      1. Call invokeComplianceAgent tool with the claim code
      2. Wait for the compliance report — it returns structured result with compliant, missingRequired, report
      3. Show the compliance report summary
      4. If compliance fails (documents missing), STOP IMMEDIATELY. Do NOT call assessBenefit, createSignOff, or any other assessment tool. Just report the compliance issues and end.
      5. If compliance passes, continue with the assessment workflow below.
      6. Include compliance findings in the final assessment summary.`}

    **Context**:
${(options?.tier ?? 1) === 1
      ? `      - This claim is a Tier 1 chronic disease case (Hypertension, Diabetes, Dyslipidemia, GERD, Asthma, etc.)
      - Treatment is drug-only outpatient — no surgery, no procedures.`
      : `      - This claim is a Tier 2 general outpatient case. It may be acute (respiratory infection, back pain, dermatitis, gastroenteritis, etc.) or chronic.
      - Treatment is drug-only outpatient — no surgery, no procedures.
      - For acute conditions, verify the treatment matches the diagnosed condition and check drug appropriateness.`}

    **Skills**:
    **Assessment** (proceed after compliance check passes):
      - Verify the request amount matches with the claim document.
      - Verify with at least 5 other claim cases to confirm the assessment.
      - **Drug Validation (MANDATORY for every claim)**:
        1. **Extract ALL drugs from the prescription** — use the DOCUMENT ANALYSIS section (pre-analyzed by Gemini Flash) to get every drug name, dosage, quantity, and unit price. The analysis is injected after data gathering is done.
        2. **Cross-reference with invoice** — match each drug from the prescription to the invoice line items. Extract the cost of each drug from the invoice. Every drug on prescription must be present on invoice.
        3. **Check against exclusion history from past claims** — from the claim tool's past cases (same insured person), check assessment_summary and non_paid_amount. If a drug was previously excluded (non_paid), check if it appears in the CURRENT prescription. If so, it MUST be excluded again:
           - Look at past claim assessment_summary for phrases like "loại trừ", "không chi trả", "non-paid", or drug names with amounts
           - If the same drug name appears in the current prescription → add its cost to non_paid_amount
           - Example: If past claim excluded "Hamega 215.292đ", and current prescription lists Hamega → non_paid_amount += cost of Hamega on current invoice
        4. For EACH drug, verify it is valid for treating the diagnosed ICD codes. Drugs unrelated to the diagnosis are non-paid.
        5. **Vietnamese Registration Number Check (EFFICIENT)**:
           - Every covered drug MUST have a valid Vietnamese Ministry of Health registration number (số đăng ký).
           - Valid formats: VN-xxxxx-xx (imported), VD-xxxxx-xx (domestic), VS-xxxxx-xx (similar products).
           - **EFFICIENCY RULE**: Batch ALL drug names into ONE or TWO googleSearch calls maximum. Do NOT search each drug individually.
             Example: call googleSearch with keywords=["Thuốc A số đăng ký", "Thuốc B số đăng ký", "Thuốc C số đăng ký"] in a SINGLE call.
           - Common Vietnamese drugs (paracetamol, amoxicillin, omeprazole, metformin, amlodipine, etc.) are assumed registered — skip searching for well-known drugs.
           - Only search for unfamiliar or suspicious drug names.
           - If a drug has no valid registration number found via search, it is NOT registered in Vietnam → mark as non-paid.
        6. Drugs paid by social insurance (BHXH) can be skipped.
        7. If a drug is not covered, not registered, not on the invoice, or excluded per history → do not include in paid amount. Sum all excluded drug costs as non_paid_amount.
      - **Diagnostic Test Exclusion**:
        - If a diagnostic test result is NEGATIVE and the test does not directly serve the diagnosed/treated condition, the test cost must be EXCLUDED (non_paid).
        - Example: HP test with negative result when diagnosis is "viêm dạ dày Hp âm tính" — the HP test cost is non_paid because the negative result means HP is not the cause, so the test doesn't serve the treatment.
        - EXCEPTION: If the insurance policy covers such negative diagnostic tests, they should be paid. To determine this, check OTHER claim cases of the same insured person or other claim cases under the same plan (via the claim tool). The test is covered ONLY if past claims explicitly show the same type of negative test was paid with non_paid_amount=0. IMPORTANT: past claims that were paid at the per-visit benefit cap do NOT count as precedent — a capped payment doesn't confirm individual line items were approved.
      - **Prescription/Indication Requirement for Each Line Item**:
        - Every billable item (drugs, infusions, injections, procedures) MUST have a corresponding prescription or doctor's indication in the medical documents.
        - If an item appears on the invoice but has NO matching prescription/indication (e.g., an infusion like "Truyền Chiamin" without a doctor's order):
          → Do NOT immediately exclude it as non_paid.
          → Instead, flag it as needing **supplementary documents** ("yêu cầu bổ sung chỉ định").
          → Include the item in the paid amount (do NOT add to non_paid_amount).
          → In the createSignOff notes, clearly list: "Yêu cầu bổ sung chỉ định [item name] ([cost]đ). Nếu khách hàng không bổ sung được thì trừ [cost]đ."
          → The cost is only excluded AFTER the customer fails to provide the supplementary documents — which is handled by human review, not by the drone.
        - Cross-check: invoice line items ↔ prescription/doctor's orders. Items without prescription = SUPPLEMENTARY REQUEST (not immediate exclusion).
      - Document validation:
        - Prescriptions must be signed by a doctor on the date of treatment.
        - Invoice items must explain prescription items and examination fees.
        - If invoice lacks item details, receipts/payment lists ("Bảng kê/phiếu thu") must be present.

    **Amount Calculation**:
      - non_paid_amount = sum of all EXCLUDED costs (unrelated drugs, unregistered drugs, not on invoice, excluded per history, negative diagnostic tests not covered by policy). NOTE: items flagged as SUPPLEMENTARY (missing prescription/indication) are NOT included in non_paid_amount — they are included in paid amount pending supplementary document provision.
      - covered_amount = request_amount - non_paid_amount
      - copay_amount = covered_amount * copay_ratio (from claim_case_payment.co_payment_ratio)
      - shortfall_amount = amount exceeding benefit balance (0 if within balance)
      - total_paid_amount = request_amount - non_paid_amount - shortfall_amount - copay_amount

    **Pre-analyzed Document Data**:
      The claim documents (PDFs) have been pre-analyzed by Gemini Flash AI. The structured extraction — including invoice line items, prescription items, test results, cross-checks, and an EXCLUSION VERDICT — will be injected as a [DOCUMENT ANALYSIS] message after data gathering is done. This is your PRIMARY source for document content. You MUST use the EXCLUSION VERDICT to determine non_paid_amount.

    **Assessment Workflow (MUST complete ALL steps)**:
      ${skipCompliance ? "" : "1. Call invokeComplianceAgent first (see above).\n      "}2. Call claim tool to get claim data. Pay attention to past claims from same insured — note any non_paid_amount > 0 and their assessment_summary for drug exclusion history.
      3. Call benefits and insured tools to get policy context.
      4. Skip saveDetailForm if claim already has diagnosis and medical_provider populated. Only call when missing.
      5. **Drug & line item validation (MANDATORY — DO NOT SKIP)**:
         a. Review the DOCUMENT ANALYSIS section below for invoice line items, prescription items, and test results.
         b. From step 2's claim history, identify drugs excluded in past claims.
         c. For each drug: check relevance to ICD codes, check exclusion history, use googleSearch for registration number.
         d. **Cross-check invoice vs prescription**: every invoice item (especially infusions, injections, diagnostic tests) must have a corresponding prescription/indication. Items without prescription = SUPPLEMENTARY REQUEST (flag for "yêu cầu bổ sung chỉ định"), NOT immediate exclusion. These items stay in paid amount.
         e. **Diagnostic test results**: if a test result is negative and doesn't serve the treated diagnosis, mark as non_paid — UNLESS past claims of same insured or same plan show such tests were paid (policy covers them).
         f. Build a complete line item table: Item Name | Cost | Verdict (PAID/EXCLUDED/SUPPLEMENTARY) | Reason
         g. Calculate non_paid_amount = sum of EXCLUDED item costs only. SUPPLEMENTARY items are NOT excluded — they stay in paid amount.
      6. Assess benefits via assessBenefit — non_paid_amount MUST reflect the drug validation results from step 5. Do NOT set non_paid_amount = 0 if drugs were excluded.
      7. Create sign-off via createSignOff with full assessment summary including the drug table from step 5.
      8. STOP after createSignOff. Do NOT call approve. The claim will be reviewed by a human before approval.
      You MUST call assessBenefit → createSignOff in sequence, then stop.

    **Rules**:
      - Use assessment_summary from similar claim cases to help with assessment.
      - For chronic drug-only claims, focus on drug validity and amount verification.
      - Do not issue pending codes — if compliance fails, just report and stop. Do NOT call createSignOff if compliance fails.
      - NEVER approve a denial case (total_paid_amount = 0). The claim must stay in InProgress for human review.
      - If assessBenefit fails (returns error or no claimCaseDetailId), STOP immediately. Do NOT call createSignOff or approve. Just explain the failure.

    **Denial Precedent Rules (CRITICAL)**:
      - When checking claim history (via claim tool's past cases), pay close attention to DENIED claims.
      - If the 2 or more most recent claims from the same insured person with similar ICD codes were DENIED, do NOT override the denial pattern. Instead:
        1. Set total_paid_amount = 0 and non_paid_amount = request_amount in assessBenefit.
        2. In the createSignOff notes, explain: "Lịch sử từ chối gần đây: [list denied claim codes and reasons]. Drone giữ nguyên kết quả từ chối để human review."
        3. This ensures consistency with established denial decisions.
      - Only override a denial pattern if you have strong medical evidence that the current claim is fundamentally different from the denied claims.

    **Drug Exclusion Consistency**:
      - NEVER flag drug exclusions as "needs verification" or "cần xác minh" — the DOCUMENT ANALYSIS contains all prescription data, so use it to DETERMINE the answer yourself.
      - If past claims excluded a drug and the DOCUMENT ANALYSIS lists that drug in the current prescription, EXCLUDE it. Do not defer to human review.
      - If the DOCUMENT ANALYSIS marks items as EXCLUDED in its EXCLUSION VERDICT, you MUST honor those exclusions when calling assessBenefit.

    **WORKED EXAMPLES**:
    Ex1: Invoice has Test HP 1.000.000đ, result HP âm tính, diagnosis K29. → HP negative = not serving treatment → non_paid 1.000.000đ (unless same insured/plan paid negative HP tests before with non_paid_amount=0 for that specific test — note: past claims paid at the per-visit cap do NOT count as precedent because capped payments don't confirm individual line items were approved).
    Ex2: Invoice has Truyền Chiamin 170.000đ but NO prescription/chỉ định for it in any document. → Do NOT exclude immediately. Flag as SUPPLEMENTARY. Include 170.000đ in paid amount. In createSignOff notes: "Yêu cầu bổ sung chỉ định Truyền Chiamin - S injection 3% 250ml (170.000đ). Nếu khách hàng không bổ sung được thì trừ 170.000đ."
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

      // Inject Bedrock-compatible images on first prompt (if any exist)
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

      // Forced tool sequencing via system hints
      const hasToolCall = (name: string) =>
        messages.some((m) =>
          "role" in m && m.role === "assistant" && Array.isArray(m.content) &&
          m.content.some((c: any) => c.type === "toolCall" && c.name === name),
        );

      // Check for assessBenefit failure in tool results
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
        if (skipCompliance) return false;
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

      const hasCompliance = skipCompliance || hasToolCall("invokeComplianceAgent");
      const hasClaim = hasToolCall("claim");
      const hasBenefits = hasToolCall("benefits");
      const hasInsured = hasToolCall("insured");
      const hasAssessBenefit = hasToolCall("assessBenefit");
      const hasCreateSignOff = hasToolCall("createSignOff");

      const dataGatheringDone = hasCompliance && hasClaim && (hasBenefits || hasInsured);

      // Resolve Gemini analysis when data gathering is done (runs in parallel with agent)
      if (dataGatheringDone && !isComplianceFailed() && documentAnalysisPromise && !documentAnalysis) {
        console.log(`[Drone] ${claimCode} awaiting Gemini pre-analysis result...`);
        const awaitStart = Date.now();
        documentAnalysis = await documentAnalysisPromise;
        console.log(`[Drone] ${claimCode} Gemini result resolved (waited ${Date.now() - awaitStart}ms extra)`);
      }

      // Inject document analysis as a separate message when data gathering is done
      if (dataGatheringDone && !isComplianceFailed() && documentAnalysis) {
        const alreadyInjectedAnalysis = messages.some((m) =>
          "role" in m && m.role === "user" && typeof m.content === "string" &&
          m.content.includes("DOCUMENT ANALYSIS"),
        );
        if (!alreadyInjectedAnalysis) {
          console.log(`[Drone] ${claimCode} injecting document analysis (${documentAnalysis.length} chars) into transformContext`);
          result.push({
            role: "user",
            content: `[DOCUMENT ANALYSIS & EXCLUSION VERDICT — from Gemini Flash Vision]\n\n${documentAnalysis}\n\n[END DOCUMENT ANALYSIS]\n\n⚠️ IMPORTANT: The EXCLUSION VERDICT section above identifies items that should be non_paid. You MUST use these findings when calculating non_paid_amount for assessBenefit. The compliance agent only checks document presence — it does NOT check individual line item exclusion rules. You must apply the exclusion rules yourself based on the document analysis above.`,
            timestamp: Date.now(),
          });
        }
      }

      // Add strong hints for tool sequencing — but NOT if compliance failed
      if (dataGatheringDone && !hasAssessBenefit && !isComplianceFailed()) {
        const hasGoogleSearchDone = hasToolCall("googleSearch");
        const preAssessHint = hasGoogleSearchDone
          ? `[SYSTEM — MANDATORY: USE THE EXCLUSION VERDICT FROM DOCUMENT ANALYSIS]
The DOCUMENT ANALYSIS above contains an EXCLUSION VERDICT section. You MUST:
1. Read the EXCLUSION VERDICT table carefully.
2. Items marked EXCLUDED → add their costs to non_paid_amount.
3. Items marked SUPPLEMENTARY → do NOT add to non_paid_amount. Include them in paid amount. Note in createSignOff: "Yêu cầu bổ sung chỉ định [item] ([cost]đ). Nếu khách hàng không bổ sung được thì trừ [cost]đ."
4. Items marked PAID → include normally.
5. The compliance agent only checks document PRESENCE. It does NOT check line-item exclusion rules.
6. Past claims paid at the per-visit cap (e.g. 1.200.000đ) do NOT count as precedent.
7. Call assessBenefit with non_paid_amount = sum of EXCLUDED items only.`
          : `[SYSTEM] Data gathering complete. If there are unfamiliar drugs, batch ALL drug names into ONE googleSearch call (max 2 calls total). Skip well-known drugs. Then apply the EXCLUSION VERDICT from the DOCUMENT ANALYSIS. Remember: EXCLUDED items → non_paid. SUPPLEMENTARY items → still paid, note in sign-off.`;
        result.push({
          role: "user",
          content: preAssessHint,
          timestamp: Date.now(),
        });
      } else if (hasAssessBenefit && !isAssessBenefitFailed() && !hasCreateSignOff) {
        result.push({
          role: "user",
          content: "[SYSTEM] Benefits assessed. You MUST now call createSignOff to create the assessment sign-off document.",
          timestamp: Date.now(),
        });
      }

      return result;
    },
  });

  return agent;
}
