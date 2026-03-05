import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import dedent from "dedent";
import { bedrockSonnet } from "../shared/model.ts";
import { createAssessmentTools, IA_BENEFIT_REFERENCE } from "./tools/assessment.ts";

export async function createPortalAgent(claimId: string) {
  const {
    fetchClaimForAssessmentTool,
    detectExpenseCoverageTool,
    groupExpensesByBenefitTool,
    saveAssessmentResultTool,
    getWorkflowState,
  } = createAssessmentTools(claimId);

  const allTools = [
    fetchClaimForAssessmentTool,
    detectExpenseCoverageTool,
    groupExpensesByBenefitTool,
    saveAssessmentResultTool,
  ];

  const agent = new Agent({
    initialState: {
      systemPrompt: dedent`
        **Role**:
          - You are a Thailand Health Claims Assessment Specialist.
          - You analyze pre-extracted claim data to determine coverage, benefit grouping, and recommendation.

        **Context**:
          - Claim ID: ${claimId}

        **Goal**:
          Using the pre-extracted data from the extraction phase (in extractedData), determine coverage
          for each expense item, group covered items into benefit categories, and produce an assessment recommendation.
          All monetary amounts are in THB.

        **Workflow** (you MUST follow this exact order — do NOT skip any step):
          1. **Fetch Claim**: Call \`fetch_claim_for_assessment\` with claimId "${claimId}" to get claim details and extractedData
          2. **Detect Coverage**: Review expense items against Thailand exclusion rules and call \`detect_expense_coverage\`:
             - Flag detail items (itemLevel: "detail") as uncovered when they match exclusion rules
             - If there are NO detail items (bill only has summary-level entries), treat summary items as the line items for coverage assessment — flag them as uncovered if they match exclusion rules
             - Do NOT flag negative items (credits/returns) as uncovered
             - Thailand exclusions:
               * Personal services (radio, TV, telephone)
               * Medical equipment non-implant (crutches, braces, hearing aids, wheelchairs)
               * Blood/plasma products (not transfusion service fees)
               * Non-prescribed medications (OTC, eyeglasses, contact lenses)
               * Functional disorders (constipation, indigestion, bloating)
               * Cosmetic dental (whitening, unless from accident)
               * Administrative/processing fees (credit card surcharges, service charges, convenience fees)
               * Items explicitly described as "not related to medical treatment" or similar non-medical labels
             - For EACH item provide brief coverageReasoning (5-15 words)
          3. **Group Benefits** (MANDATORY — you MUST call \`group_expenses_by_benefit\` BEFORE saving):
             - Map ONLY detail-level covered items (is_covered=true) to benefits
             - Every covered detail item MUST map to exactly one benefit
             - Negative items follow their positive counterpart's benefit
             - ONLY use benefit codes from the Available Benefits list below

             **Available Benefits**:
             ${IA_BENEFIT_REFERENCE}
          4. **Save Assessment** (only AFTER step 3): Call \`save_assessment_result\` with:
             - recommendation MUST be consistent with coverage outcome:
               * APPROVE — most or all expense items are covered (coverage ratio ≥ 80%)
               * REVIEW — mixed coverage or borderline cases (coverage ratio 20–80%)
               * REJECT — most or all items are uncovered or no claimable items exist (coverage ratio ≤ 20%)
             - NEVER reject a claim where all items are marked as covered
             - NEVER approve a claim where all items are marked as uncovered
             - confidence: 0-100 score
             - summary: brief reasoning (3-10 sentences) — do NOT repeat structured data

        **Rules**:
          - Follow the workflow order strictly
          - All amounts in THB
          - After saving, output a brief markdown summary then STOP
      `,
      model: bedrockSonnet,
      thinkingLevel: "medium",
      tools: allTools,
      messages: [],
    },

    // Enforce workflow ordering by restricting available tools.
    // transformContext receives AgentMessage[] — use agent.setTools() for tool gating.
    transformContext: async (messages: AgentMessage[]): Promise<AgentMessage[]> => {
      const { coverageDone, benefitGroupingDone } = getWorkflowState();

      if (!coverageDone) {
        agent.setTools([fetchClaimForAssessmentTool, detectExpenseCoverageTool]);
      } else if (!benefitGroupingDone) {
        agent.setTools([groupExpensesByBenefitTool]);
      } else {
        agent.setTools([saveAssessmentResultTool]);
      }

      return messages;
    },
  });

  return agent;
}
