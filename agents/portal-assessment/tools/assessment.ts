import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { gqlQuery } from "../../shared/graphql-client.ts";
import { mergeExtractedData, parseExtractedData, getExtractedField } from "../../portal-extraction/tools/claims.ts";

// ─── GraphQL Queries ─────────────────────────────────────────────────────────

const FETCH_CLAIM_FOR_ASSESSMENT_QUERY = `
  query FetchClaimForAssessment($id: Uuid!) {
    claimsById(id: $id) {
      id
      claimNumber
      status
      claimantName
      amountClaimed
      currency
      dateOfService
      providerName
      aiSummary
    }
  }
`;

const SAVE_ASSESSMENT_MUTATION = `
  mutation SaveAssessment($id: Uuid!, $updateColumns: UpdateClaimsByIdUpdateColumnsInput!) {
    updateClaimsById(keyId: $id, updateColumns: $updateColumns) {
      affectedRows
    }
  }
`;

// ─── Benefit Reference (IA schema — default for Banyan portal) ───────────────

export const IA_BENEFIT_REFERENCE = `INPATIENT:
  - \`room_and_board\`: Room expenses including meals
  - \`icu_iccu\`: ICU/ICCU/NICU/PICU/HDU/Isolation room costs
  - \`physician_visit\`: Daily doctor consultation, excluding diagnostics
  - \`surgery_fee\`: Surgery costs. Sub-types: op (surgeon fees), anaesthesia (anesthesiologist), operation_room (OR usage). IMPORTANT: If no 'op' costs exist, no surgery was performed.
  - \`hospital_supplies_and_services\`: Medication, equipment, dressings, x-rays, endoscopy, lab tests, EKG, physiotherapy, IV injections, blood transfusion. Sub-types: medication, lab_diagnostic, misc
  - \`ambulance_fee\`: Charges for ambulance
  - \`implant_and_prosthesis_fee\`: Pacemaker, stents, intraocular lens, heart valve, joints, ligament prosthetics
  - \`lodger_fee\`: Accommodation/meals/stay for accompanying persons
  - \`cancer_care\`: Cancer treatment: medication, radiotherapy, chemotherapy
  - \`dialysis\`: Charges for dialysis
  - \`transplant\`: Organ transplantation charges
  - \`emergency_treatment\`: ER treatment before admission
  - \`maternity\`: Maternity and delivery: delivery room, C-section, antenatal/postnatal inpatient care
  - \`mental_health\`: Psychiatric inpatient care and hospitalization
  - \`rehabilitation\`: Inpatient rehabilitation: extended physiotherapy, post-surgical rehab
OUTPATIENT:
  - \`general_consultation\`: Doctor consultation and follow-up visits. Sub-types: gp (general practitioner), specialist (specialist consultation), chronic_followup (chronic disease management visit)
  - \`medication\`: Prescription medications. Sub-types: chronic (long-term/maintenance medication), acute (short-term treatment medication)
  - \`lab_diagnostic\`: Laboratory and diagnostic tests. Sub-types: lab (blood/urine/pathology tests), imaging (x-ray, CT, MRI, ultrasound), cardiac (ECG, echocardiogram, stress test)
  - \`emergency_treatment\`: Emergency room treatment: ER visits, emergency procedures, urgent care
  - \`cancer_care\`: Cancer treatment: consultation, medication, radiotherapy, chemotherapy
  - \`dialysis\`: Charges for dialysis
  - \`one_day_surgery\`: Day surgery without hospitalization. Must involve incision.
  - \`transplant\`: Organ transplantation charges
  - \`physiotherapy\`: Physical therapy and rehabilitation sessions
  - \`dental\`: Dental treatment (non-cosmetic): fillings, extractions, root canals, scaling
  - \`maternity\`: Maternity and pregnancy care: antenatal visits, postnatal follow-up
  - \`mental_health\`: Psychiatric and psychological care: psychiatrist visits, counseling, therapy
  - \`preventive_care\`: Preventive and wellness services: health checkups, vaccinations, screening
  - \`medical_supplies\`: Medical supplies and equipment: dressings, braces, supplies used during visit
  - \`miscellaneous\`: Other covered OPD charges not categorized above`;

// ─── Tool Factory ────────────────────────────────────────────────────────────

export function createAssessmentTools(claimId: string) {

// Track workflow state via closure
let coverageDone = false;
let benefitGroupingDone = false;

// ─── Tool 1: Fetch Claim for Assessment ──────────────────────────────────────

const fetchClaimForAssessmentTool: AgentTool = {
  name: "fetch_claim_for_assessment",
  label: "Fetch Claim",
  description: "Retrieve claim details including extractedData from extraction phase for assessment",
  parameters: Type.Object({
    claimId: Type.String({ description: "The claim ID to fetch" }),
  }),
  async execute(_toolCallId, params) {
    const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
      FETCH_CLAIM_FOR_ASSESSMENT_QUERY,
      { id: params.claimId },
    );

    return {
      content: [{ type: "text", text: JSON.stringify(data.claimsById, null, 2) }],
      details: { claimId: params.claimId },
    };
  },
};

// ─── Tool 2: Detect Expense Coverage ─────────────────────────────────────────

const detectExpenseCoverageTool: AgentTool = {
  name: "detect_expense_coverage",
  label: "Detecting Coverage",
  description:
    "Classify each expense item as covered or uncovered per Thailand insurance exclusion rules. " +
    "Thailand Exclusions: (1) Personal services (radio, TV, phone), (2) Medical equipment non-implant " +
    "(crutches, braces, hearing aids, wheelchairs), (3) Blood/plasma products (not transfusion service), " +
    "(4) Non-prescribed meds (OTC, eyeglasses, contact lenses), (5) Functional disorders " +
    "(constipation, indigestion, bloating), (6) Cosmetic dental (whitening, unless from accident), " +
    "(7) Administrative/processing fees (credit card surcharges, service charges), " +
    "(8) Items labeled as not related to medical treatment. " +
    "Flag DETAIL-level items. If NO detail items exist, flag summary items instead. " +
    "Do NOT flag negative items (credits/returns).",
  parameters: Type.Object({
    treatmentType: Type.Union([
      Type.Literal("INPATIENT"),
      Type.Literal("OUTPATIENT"),
      Type.Literal("DENTAL"),
    ], { description: "Treatment type" }),
    uncoveredItems: Type.Array(
      Type.Object({
        expenseItemId: Type.String({ description: "UUID of the expense item" }),
        uncoveredReasoning: Type.String({ description: "Why this item is not covered and which exclusion category" }),
      }),
      { description: "Expense items identified as uncovered. Only include items matching exclusion rules." },
    ),
    coveredItemReasonings: Type.Optional(
      Type.Array(
        Type.Object({
          expenseItemId: Type.String({ description: "UUID of the expense item" }),
          coverageReasoning: Type.String({ description: "Brief explanation of why covered (5-15 words)" }),
        }),
        { description: "Reasoning for ALL detail items explaining coverage determination." },
      ),
    ),
  }),
  async execute(_toolCallId, params) {
    // Read extracted expenses from the claim (stored in aiSummary as JSON)
    const data = await gqlQuery<{ claimsById: { aiSummary: string | null } }>(
      `query ReadExpenses($id: Uuid!) { claimsById(id: $id) { aiSummary } }`,
      { id: claimId },
    );
    const extractedData = parseExtractedData(data.claimsById?.aiSummary);
    const expenses = getExtractedField(extractedData, "extraction", "expenses") as { items?: any[]; totalPayable?: number } | undefined;
    const existingItems = expenses?.items ?? [];

    if (existingItems.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "No expense items found in extractedData. Run extraction first." }) }],
        details: { error: "No expense items" },
      };
    }

    const uncoveredIds = new Set(params.uncoveredItems.map(i => i.expenseItemId));

    // Build reasoning map
    const reasoningMap = new Map<string, string>();
    for (const item of params.uncoveredItems) {
      reasoningMap.set(item.expenseItemId, item.uncoveredReasoning);
    }
    if (params.coveredItemReasonings) {
      for (const item of params.coveredItemReasonings) {
        reasoningMap.set(item.expenseItemId, item.coverageReasoning);
      }
    }

    // Update is_covered on items
    const updatedItems = existingItems.map((item: any) => ({
      ...item,
      is_covered: !uncoveredIds.has(item.id),
      coverageReasoning: reasoningMap.get(item.id) ?? null,
    }));

    // Calculate totals from detail items only (avoid double-counting)
    const hasHierarchy = updatedItems.some((i: any) => i.itemLevel === "summary");
    const detailOnly = hasHierarchy
      ? updatedItems.filter((i: any) => (i.itemLevel ?? "detail") === "detail")
      : updatedItems;
    const itemsForTotals = detailOnly.length > 0 ? detailOnly : updatedItems;

    const coveredItems = itemsForTotals.filter((i: any) => i.is_covered);
    const uncovered = itemsForTotals.filter((i: any) => !i.is_covered);

    const totalCovered = coveredItems.reduce((s: number, i: any) => s + (i.total_amount ?? i.payable_amount ?? 0), 0);
    const totalUncovered = uncovered.reduce((s: number, i: any) => s + (i.total_amount ?? i.payable_amount ?? 0), 0);
    const totalRequested = totalCovered + totalUncovered;

    // Persist coverage results to assessment namespace
    await mergeExtractedData(claimId, {
      expenses: {
        ...expenses,
        items: updatedItems,
      },
      coverageAnalysis: {
        totalRequested,
        totalCovered,
        totalUncovered,
        coveredItemCount: coveredItems.length,
        uncoveredItemCount: uncovered.length,
      },
    }, "assessment");

    coverageDone = true;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          coveredItemCount: coveredItems.length,
          uncoveredItemCount: uncovered.length,
          totalCovered,
          totalUncovered,
          totalRequested,
          items: updatedItems,
          uncoveredDetails: params.uncoveredItems.map(item => ({
            expenseItemId: item.expenseItemId,
            name: existingItems.find((i: any) => i.id === item.expenseItemId)?.name,
            reasoning: item.uncoveredReasoning,
          })),
        }, null, 2),
      }],
      details: { claimId, coveredCount: coveredItems.length, uncoveredCount: uncovered.length },
    };
  },
};

// ─── Tool 3: Group Expenses by Benefit ───────────────────────────────────────

const groupExpensesByBenefitTool: AgentTool = {
  name: "group_expenses_by_benefit",
  label: "Grouping Benefits",
  description:
    "Group covered expense items into benefit categories based on the insurer's benefit schema. " +
    "Every covered DETAIL item MUST be mapped to exactly one benefit. " +
    "Do NOT include summary items or uncovered items. " +
    "ONLY use benefit codes from the Available Benefits list in the system prompt.",
  parameters: Type.Object({
    treatmentType: Type.Union([
      Type.Literal("INPATIENT"),
      Type.Literal("OUTPATIENT"),
      Type.Literal("DENTAL"),
    ], { description: "Treatment type" }),
    benefitGroups: Type.Array(
      Type.Object({
        benefitCode: Type.String({ description: "Benefit code (e.g., room_and_board, surgery_fee)" }),
        benefitName: Type.String({ description: "Human-readable benefit name" }),
        expenseItemIds: Type.Array(Type.String(), { description: "UUIDs of expense items in this benefit group" }),
        subBenefitTypes: Type.Optional(
          Type.Record(Type.String(), Type.Union([Type.String(), Type.Null()]), {
            description: "Map of expenseItemId to subBenefitType for benefits with sub-types",
          }),
        ),
      }),
      { description: "Benefit groupings — each covered detail item must appear in exactly one group" },
    ),
  }),
  async execute(_toolCallId, params) {
    // Read items from aiSummary (JSON store)
    const data = await gqlQuery<{ claimsById: { aiSummary: string | null } }>(
      `query ReadItems($id: Uuid!) { claimsById(id: $id) { aiSummary } }`,
      { id: claimId },
    );
    const extractedData = parseExtractedData(data.claimsById?.aiSummary);
    // Read expenses from assessment namespace (enriched with coverage), fallback to extraction namespace, then flat
    const expenses = (getExtractedField(extractedData, "assessment", "expenses")
      ?? getExtractedField(extractedData, "extraction", "expenses")) as { items?: any[] } | undefined;
    const allItems = expenses?.items ?? [];

    // Build benefit grouping result
    const benefitGrouping = params.benefitGroups.map(group => {
      const itemIds = new Set(group.expenseItemIds);
      const groupItems = allItems.filter((i: any) => itemIds.has(i.id));
      const totalAmount = groupItems.reduce((s: number, i: any) => s + (i.total_amount ?? i.payable_amount ?? 0), 0);

      return {
        benefitCode: group.benefitCode,
        benefitName: group.benefitName,
        itemCount: group.expenseItemIds.length,
        totalAmount,
        items: groupItems.map((i: any) => ({
          id: i.id,
          name: i.name,
          amount: i.total_amount ?? i.payable_amount ?? 0,
        })),
      };
    });

    // Persist benefit grouping to assessment namespace
    await mergeExtractedData(claimId, {
      benefitGrouping: {
        benefitGroups: benefitGrouping,
      },
    }, "assessment");

    benefitGroupingDone = true;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          benefitCount: benefitGrouping.length,
          benefits: benefitGrouping,
        }, null, 2),
      }],
      details: { claimId, benefitCount: benefitGrouping.length },
    };
  },
};

// ─── Tool 4: Save Assessment Result ──────────────────────────────────────────

const saveAssessmentResultTool: AgentTool = {
  name: "save_assessment_result",
  label: "Saving Assessment",
  description:
    "Save the final assessment result. Call this as the LAST step after coverage detection and benefit grouping. " +
    "Put brief reasoning (3-10 sentences) into the 'summary' field. " +
    "Do NOT repeat structured data — it is displayed separately.",
  parameters: Type.Object({
    recommendation: Type.Union([
      Type.Literal("APPROVE"),
      Type.Literal("REVIEW"),
      Type.Literal("REJECT"),
    ], { description: "Final recommendation" }),
    confidence: Type.Number({ description: "Confidence score 0-100" }),
    summary: Type.String({ description: "Brief reasoning (3-10 sentences) explaining the recommendation" }),
  }),
  async execute(_toolCallId, params) {
    // Consistency check: recommendation must align with coverage data
    let recommendation = params.recommendation;
    const readData = await gqlQuery<{ claimsById: { aiSummary: string | null } }>(
      `query ReadCoverage($id: Uuid!) { claimsById(id: $id) { aiSummary } }`,
      { id: claimId },
    );
    const priorData = parseExtractedData(readData.claimsById?.aiSummary);
    const coverage = getExtractedField(priorData, "assessment", "coverageAnalysis") as {
      totalRequested?: number; totalCovered?: number; totalUncovered?: number;
    } | undefined;
    if (coverage && coverage.totalRequested && coverage.totalRequested > 0) {
      const ratio = (coverage.totalCovered ?? 0) / coverage.totalRequested;
      if (recommendation === "REJECT" && ratio >= 0.8) {
        recommendation = "APPROVE";
      } else if (recommendation === "APPROVE" && ratio <= 0.2) {
        recommendation = "REJECT";
      }
    }

    const assessmentResult = {
      recommendation,
      confidence: params.confidence,
      summary: params.summary,
      completedAt: new Date().toISOString(),
    };

    // Write to assessment namespace AND aiRecommendation for backward compat
    await mergeExtractedData(claimId, {
      automationResult: assessmentResult,
    }, "assessment");

    await gqlQuery(SAVE_ASSESSMENT_MUTATION, {
      id: claimId,
      updateColumns: {
        aiRecommendation: { set: JSON.stringify(assessmentResult) },
      },
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          recommendation: params.recommendation,
          confidence: params.confidence,
          summary: params.summary,
        }, null, 2),
      }],
      details: { claimId, recommendation: params.recommendation },
    };
  },
};

  return {
    fetchClaimForAssessmentTool,
    detectExpenseCoverageTool,
    groupExpensesByBenefitTool,
    saveAssessmentResultTool,
    // Expose workflow state for transformContext enforcement
    getWorkflowState: () => ({ coverageDone, benefitGroupingDone }),
  };
}
