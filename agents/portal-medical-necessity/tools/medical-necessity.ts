import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { gqlQuery } from "../../shared/graphql-client.ts";
import { mergeExtractedData, parseExtractedData, getExtractedField } from "../../portal-extraction/tools/claims.ts";
import {
  getDrugData,
  getProcedureData,
  getLOSData,
  getDiagnosisDrugMapData,
  getDiagnosisDiagnosticMapData,
  getSurgeryClassData,
  getProcedureSurgeryClassData,
  getMoPHLongTermDiseaseData,
  getMoPHPrescriptionRules,
  getDataLoadStatus,
  getPathwayMarkdown,
  fuzzyMatch,
  normalizeForMatch,
  findDrugMatches,
  resolveDrugClassToCategories,
} from "../../shared/csv-data.ts";
import type {
  DrugEntry,
  ProcedureSurgeryClassEntry,
} from "../../shared/csv-data.ts";

// ─── GraphQL Queries ─────────────────────────────────────────────────────────

const FETCH_CLAIM_FOR_MN_QUERY = `
  query FetchClaimForMN($id: Uuid!) {
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

// ─── Guardrail Helpers ──────────────────────────────────────────────────────

function parseReferenceMax(refRange: string | undefined | null): number | null {
  if (!refRange) return null;
  let m = /max[:\s]*([0-9,]+)/i.exec(refRange);
  if (m) return Number(m[1].replace(/,/g, ""));
  m = /([0-9,]+)\s*[-–]\s*([0-9,]+)/.exec(refRange);
  if (m) return Number(m[2].replace(/,/g, ""));
  m = /^([0-9,]+)\s*(?:THB|thb|baht)?$/.exec(refRange.trim());
  if (m) return Number(m[1].replace(/,/g, ""));
  return null;
}

type LineItemFlag = "contraindicated" | "duplicate" | "unnecessary" | "red_flag" | "extremely_over_price" | "unrelated_drug";

function formatThb(amount: number): string {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} THB`;
}

// ─── Tool Factory ────────────────────────────────────────────────────────────

export function createMedicalNecessityTools(claimId: string) {

// Track which tools have been called (for self-check / forced save)
const calledTools = new Set<string>();

function trackCall(toolName: string) {
  calledTools.add(toolName);
}

// ─── Tool 1: Fetch Claim for MN ─────────────────────────────────────────────

const fetchClaimForMNTool: AgentTool = {
  name: "fetch_claim_for_mn",
  label: "Fetch Claim",
  description:
    "Retrieve claim details including extractedData (with extraction output: treatment info, expenses, medical report) " +
    "for medical necessity analysis.",
  parameters: Type.Object({
    claimId: Type.String({ description: "The claim ID to fetch" }),
  }),
  async execute(_toolCallId, params) {
    trackCall("fetch_claim_for_mn");
    const data = await gqlQuery<{ claimsById: Record<string, unknown> }>(
      FETCH_CLAIM_FOR_MN_QUERY,
      { id: params.claimId },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data.claimsById, null, 2) }],
      details: { claimId: params.claimId },
    };
  },
};

// ─── Tool 2: Drug Reference Batch Lookup ────────────────────────────────────

const thLookupDrugReferenceBatchTool: AgentTool = {
  name: "th_lookup_drug_reference_batch",
  label: "Looking up Drug References (Batch)",
  description:
    "Batch look up drug information for MULTIPLE drugs at once from the Thailand local reference database. " +
    "Use this instead of calling th_lookup_drug_reference multiple times. " +
    "Pass ALL drugs from the prescription in a single call. " +
    "Returns price ranges (THB), indications, contraindications, and indication match per drug.",
  parameters: Type.Object({
    drugs: Type.Array(
      Type.Object({
        query: Type.String({ description: "Drug brand name or generic name to search for" }),
        diagnosis: Type.Optional(Type.String({ description: "Diagnosis to check indication match against" })),
      }),
      { description: "List of drugs to look up — pass ALL from the prescription at once" },
    ),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_lookup_drug_reference_batch");
    const drugData = getDrugData();

    const results = params.drugs.map(({ query, diagnosis }: { query: string; diagnosis?: string }) => {
      const { matches, brandResolved, resolvedGeneric } = findDrugMatches(drugData, query);
      const annotated = matches.map((drug: DrugEntry) => {
        const indicationMatch = diagnosis
          ? drug.indications.some((ind: string) => fuzzyMatch(ind, diagnosis))
          : null;
        const contraindicated = diagnosis
          ? drug.contraindications.some((ci: string) => fuzzyMatch(ci, diagnosis))
          : null;
        return { ...drug, indicationMatch, contraindicated };
      });
      return {
        query,
        matchCount: annotated.length,
        matches: annotated,
        ...(brandResolved ? { brandResolved: true, resolvedGeneric } : {}),
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          totalQueried: params.drugs.length,
          totalDrugsInDatabase: drugData.length,
          drugResults: results,
        }, null, 2),
      }],
      details: { totalQueried: params.drugs.length },
    };
  },
};

// ─── Tool 3: Procedure Cost Batch Lookup ────────────────────────────────────

const thLookupProcedureCostBatchTool: AgentTool = {
  name: "th_lookup_procedure_cost_batch",
  label: "Looking up Procedure Costs (Batch)",
  description:
    "Batch look up procedure/test cost information for MULTIPLE procedures at once from the Thailand local reference database. " +
    "Use this instead of calling th_lookup_procedure_cost multiple times. " +
    "Pass ALL procedures and tests from the invoice in a single call. " +
    "Returns acceptable cost ranges (THB) by region and facility tier per procedure.",
  parameters: Type.Object({
    procedures: Type.Array(
      Type.Object({
        query: Type.String({ description: "Procedure name, code, or category to search for" }),
        region: Type.Optional(Type.String({ description: "Region filter (e.g., bangkok, central, north)" })),
        facilityTier: Type.Optional(Type.String({ description: "Facility tier filter: public or private" })),
      }),
      { description: "List of procedures/tests to look up — pass ALL from the invoice at once" },
    ),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_lookup_procedure_cost_batch");
    const procedureData = getProcedureData();

    const results = params.procedures.map(({ query, region, facilityTier }: { query: string; region?: string; facilityTier?: string }) => {
      let matches = procedureData.filter(
        (proc) =>
          fuzzyMatch(proc.procedure_name, query) ||
          fuzzyMatch(proc.english_name, query) ||
          fuzzyMatch(proc.procedure_code, query) ||
          fuzzyMatch(proc.category, query),
      );
      if (region) matches = matches.filter((p) => p.region === "all" || p.region === region);
      if (facilityTier) matches = matches.filter((p) => p.facility_tier === "all" || p.facility_tier === facilityTier);
      return { query, matchCount: matches.length, matches };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          totalQueried: params.procedures.length,
          totalProceduresInDatabase: procedureData.length,
          procedureResults: results,
        }, null, 2),
      }],
      details: { totalQueried: params.procedures.length },
    };
  },
};

// ─── Tool 4: Diagnosis-Drug Compatibility ───────────────────────────────────

// Helper: assess a single drug against a single diagnosis map entry
function assessDrugForDiagnosis(
  drugName: string,
  drugData: DrugEntry[],
  mapEntry: { diagnosis_group: string; icd_code: string; expected_drug_classes: string[]; red_flag_drugs: string[]; max_drug_count: number; notes: string },
): {
  compatibility: "expected" | "acceptable" | "red_flag" | "unrelated";
  reason: string;
  matchedExpectedClass?: string;
  redFlagCondition?: string | null;
} {
  const { matches: drugMatches } = findDrugMatches(drugData, drugName);
  const drugEntry = drugMatches[0] ?? null;
  const drugCategory = drugEntry?.drug_category ?? "unknown";
  const drugCategoryLower = drugCategory.toLowerCase();
  const actualDrugName = drugEntry?.drug_name ?? drugName;
  const actualGenericName = drugEntry?.generic_name ?? "";

  const expectedClasses = mapEntry.expected_drug_classes;
  const redFlagDrugs = mapEntry.red_flag_drugs;

  // 3-tier expected drug matching
  let isExpected = false;
  let matchedExpectedClass = "";

  for (const ec of expectedClasses) {
    const ecLower = ec.toLowerCase();
    const ecBase = ecLower.replace(/\(.*\)/, "").trim();

    if (drugCategoryLower.includes(ecBase) || ecBase.includes(drugCategoryLower)) {
      isExpected = true;
      matchedExpectedClass = ec;
      break;
    }

    const { patterns, drugNames: classSpecificDrugs } = resolveDrugClassToCategories(ec);
    if (patterns.length > 0) {
      const patternMatch = patterns.some((pattern) => {
        const pl = pattern.toLowerCase();
        return drugCategoryLower.includes(pl) || pl.includes(drugCategoryLower);
      });
      if (patternMatch) {
        isExpected = true;
        matchedExpectedClass = ec;
        break;
      }
    }

    if (classSpecificDrugs.length > 0) {
      const nameMatch = classSpecificDrugs.some(
        (name) => fuzzyMatch(actualDrugName, name) || fuzzyMatch(actualGenericName, name),
      );
      if (nameMatch) {
        isExpected = true;
        matchedExpectedClass = ec;
        break;
      }
    }
  }

  // 3-tier red flag matching
  let isRedFlag = false;
  let redFlagCondition: string | null = null;

  for (const rf of redFlagDrugs) {
    const rfBase = rf.toLowerCase().replace(/\(.*\)/, "").trim();
    const rfCond = rf.match(/\(([^)]+)\)/)?.[1] ?? null;

    let matched = drugCategoryLower.includes(rfBase) || rfBase.includes(drugCategoryLower);

    if (!matched) {
      const { patterns, drugNames: rfDrugNames } = resolveDrugClassToCategories(rf);
      if (patterns.length > 0) {
        matched = patterns.some((pattern) => {
          const pl = pattern.toLowerCase();
          return drugCategoryLower.includes(pl) || pl.includes(drugCategoryLower);
        });
      }
      if (!matched && rfDrugNames.length > 0) {
        matched = rfDrugNames.some(
          (name) => fuzzyMatch(actualDrugName, name) || fuzzyMatch(actualGenericName, name),
        );
      }
    }

    if (matched) {
      isRedFlag = true;
      redFlagCondition = rfCond;
      break;
    }
  }

  if (isExpected) {
    return {
      compatibility: "expected",
      reason: `Drug category "${drugCategory}" matches expected class "${matchedExpectedClass}" for ${mapEntry.diagnosis_group}`,
      matchedExpectedClass,
    };
  } else if (isRedFlag) {
    return {
      compatibility: "red_flag",
      reason: redFlagCondition
        ? `Drug category "${drugCategory}" is flagged for ${mapEntry.diagnosis_group}: ${redFlagCondition.replace(/_/g, " ")}`
        : `Drug category "${drugCategory}" is suspicious for ${mapEntry.diagnosis_group}`,
      redFlagCondition,
    };
  } else if (drugCategory === "unknown") {
    return {
      compatibility: "unrelated",
      reason: "Drug not found in formulary — apply your clinical knowledge to determine if this drug has an established indication for the diagnosis, and cite relevant clinical guidelines",
    };
  } else {
    const supportivePatterns = ["glucose sterile", "all-in-one", "vitamin", "electrolyte"];
    if (supportivePatterns.some((sc) => drugCategoryLower.includes(sc))) {
      return {
        compatibility: "acceptable",
        reason: `Supportive care drug (${drugCategory}) - generally acceptable but check clinical necessity`,
      };
    } else {
      return {
        compatibility: "unrelated",
        reason: `Drug category "${drugCategory}" is not in the pre-defined protocol for ${mapEntry.diagnosis_group} — apply your clinical knowledge to determine if this drug has an established indication for this diagnosis, and cite relevant guidelines (e.g. society guidelines, standard-of-care references)`,
      };
    }
  }
}

// Compatibility ranking: lower index = better
const COMPATIBILITY_RANK: Record<string, number> = { expected: 0, acceptable: 1, unrelated: 2, red_flag: 3 };

const thCheckDiagnosisDrugCompatibilityTool: AgentTool = {
  name: "th_check_diagnosis_drug_compatibility",
  label: "Checking Drug-Diagnosis Compatibility",
  description:
    "Check whether a list of drugs is clinically appropriate for one or more diagnoses. " +
    "Classifies each drug as: expected, acceptable, red_flag, or unrelated. " +
    "When multiple diagnoses are provided, each drug is matched against ALL diagnoses and the BEST compatibility wins. " +
    "Also returns the maximum typical drug count for the primary diagnosis. " +
    "Call this ONCE with ALL drugs from the prescription and ALL diagnoses (primary + secondary).",
  parameters: Type.Object({
    icdCode: Type.Optional(Type.String({ description: "Primary ICD-10 code (backward compat — prefer diagnoses array)" })),
    diagnoses: Type.Optional(Type.Array(
      Type.Object({
        icdCode: Type.String({ description: "ICD-10 code (e.g., J18.9)" }),
        name: Type.Optional(Type.String({ description: "Diagnosis name for context" })),
      }),
      { description: "ALL diagnoses — primary + secondary from medicalReport.finalDiagnoses" },
    )),
    drugs: Type.Array(Type.String(), { description: "List of drug names from the prescription to check" }),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_check_diagnosis_drug_compatibility");
    const diagnosisMap = getDiagnosisDrugMapData();
    const drugData = getDrugData();

    // Normalize: build diagnosis list from either new `diagnoses` array or legacy `icdCode`
    const diagnosisList: Array<{ icdCode: string; name?: string }> =
      params.diagnoses && params.diagnoses.length > 0
        ? params.diagnoses
        : params.icdCode
          ? [{ icdCode: params.icdCode }]
          : [];

    if (diagnosisList.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            diagnosisFound: false,
            message: "No diagnosis ICD codes provided. Supply icdCode or diagnoses array.",
          }, null, 2),
        }],
        details: { diagnosisFound: false },
      };
    }

    // Resolve map entries for each diagnosis
    const resolvedDiagnoses: Array<{
      icdCode: string;
      name?: string;
      mapEntry: (typeof diagnosisMap)[number] | null;
    }> = diagnosisList.map((d) => {
      let mapEntry = diagnosisMap.find((entry) => entry.icd_code.toLowerCase() === d.icdCode.toLowerCase());
      if (!mapEntry) {
        const icdPrefix = d.icdCode.split(".")[0];
        mapEntry = diagnosisMap.find((entry) => entry.icd_code.startsWith(icdPrefix));
      }
      return { icdCode: d.icdCode, name: d.name, mapEntry: mapEntry ?? null };
    });

    const hasAnyMap = resolvedDiagnoses.some((d) => d.mapEntry != null);
    const primaryIcd = diagnosisList[0].icdCode;

    if (!hasAnyMap) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            diagnosisFound: false,
            icdCode: primaryIcd,
            diagnosesChecked: diagnosisList.map((d) => d.icdCode),
            message: "No established treatment protocol on file for any provided ICD code. Apply your clinical knowledge to assess each drug's appropriateness.",
            drugAssessments: params.drugs.map((drug) => {
              const { matches: drugMatches, brandResolved, resolvedGeneric } = findDrugMatches(drugData, drug);
              return {
                drugName: drug,
                compatibility: "unknown",
                drugCategory: drugMatches[0]?.drug_category ?? "unknown",
                reason: "No pre-defined protocol on file for any diagnosis — apply your clinical knowledge to assess appropriateness",
                matchedDiagnosisIcd: null,
                ...(brandResolved ? { brandResolved: true, resolvedGeneric } : {}),
              };
            }),
          }, null, 2),
        }],
        details: { icdCode: primaryIcd, diagnosisFound: false },
      };
    }

    // Use primary diagnosis map entry for max_drug_count and metadata
    const primaryMapEntry = resolvedDiagnoses[0].mapEntry ?? resolvedDiagnoses.find((d) => d.mapEntry != null)!.mapEntry!;

    const drugAssessments = params.drugs.map((drugName) => {
      const { matches: drugMatches, brandResolved, resolvedGeneric } = findDrugMatches(drugData, drugName);
      const drugEntry = drugMatches[0] ?? null;

      // Assess against ALL diagnoses that have map entries, take BEST result
      let bestResult: ReturnType<typeof assessDrugForDiagnosis> | null = null;
      let bestRank = Infinity;
      let matchedIcd: string | null = null;

      for (const diag of resolvedDiagnoses) {
        if (!diag.mapEntry) continue;
        const result = assessDrugForDiagnosis(drugName, drugData, diag.mapEntry);
        const rank = COMPATIBILITY_RANK[result.compatibility] ?? 99;
        if (rank < bestRank) {
          bestRank = rank;
          bestResult = result;
          matchedIcd = diag.icdCode;
        }
        // Short-circuit: "expected" is the best possible
        if (rank === 0) break;
      }

      // If no map entry matched any diagnosis, fall back to unknown assessment
      if (!bestResult) {
        const drugCategory = drugEntry?.drug_category ?? "unknown";
        bestResult = {
          compatibility: "unrelated",
          reason: `Drug category "${drugCategory}" has no protocol match for any provided diagnosis`,
        };
      }

      return {
        drugName,
        compatibility: bestResult.compatibility,
        drugCategory: drugEntry?.drug_category ?? "unknown",
        reason: bestResult.reason,
        matchedDiagnosisIcd: matchedIcd,
        typicalDurationDays: drugEntry?.typical_duration_days ?? 0,
        dailyDoseUnits: drugEntry?.daily_dose_units ?? 0,
        ...(brandResolved ? { brandResolved: true, resolvedGeneric } : {}),
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          diagnosisFound: true,
          diagnosisGroup: primaryMapEntry.diagnosis_group,
          icdCode: primaryMapEntry.icd_code,
          diagnosesChecked: diagnosisList.map((d) => d.icdCode),
          maxTypicalDrugCount: primaryMapEntry.max_drug_count,
          notes: primaryMapEntry.notes,
          drugAssessments,
          summary: {
            totalDrugs: params.drugs.length,
            expectedCount: drugAssessments.filter((d) => d.compatibility === "expected").length,
            acceptableCount: drugAssessments.filter((d) => d.compatibility === "acceptable").length,
            redFlagCount: drugAssessments.filter((d) => d.compatibility === "red_flag").length,
            unrelatedCount: drugAssessments.filter((d) => d.compatibility === "unrelated").length,
            excessiveDrugCount: params.drugs.length > primaryMapEntry.max_drug_count,
          },
        }, null, 2),
      }],
      details: { icdCode: primaryIcd, diagnosisFound: true, drugCount: params.drugs.length },
    };
  },
};

// ─── Tool 5: Diagnostic Necessity ───────────────────────────────────────────

const thCheckDiagnosticNecessityTool: AgentTool = {
  name: "th_check_diagnostic_necessity",
  label: "Checking Diagnostic Necessity",
  description:
    "Check whether diagnostic tests (lab tests, imaging, other diagnostics) are medically necessary for a diagnosis. " +
    "Classifies each test as: expected, conditional, unnecessary, or unmatched. " +
    "Call this ONCE with ALL diagnostic test names from the claim.",
  parameters: Type.Object({
    icdCode: Type.String({ description: "Primary ICD-10 code of the diagnosis (e.g., J18.9)" }),
    diagnostics: Type.Array(Type.String(), { description: "List of diagnostic test names from the claim" }),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_check_diagnostic_necessity");
    const diagnosticMap = getDiagnosisDiagnosticMapData();
    const procedureData = getProcedureData();

    let mapEntry = diagnosticMap.find((entry) => entry.icd_code.toLowerCase() === params.icdCode.toLowerCase());
    if (!mapEntry) {
      const icdPrefix = params.icdCode.split(".")[0];
      mapEntry = diagnosticMap.find((entry) => entry.icd_code.startsWith(icdPrefix));
    }

    if (!mapEntry) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            diagnosisFound: false,
            icdCode: params.icdCode,
            message: "No diagnosis-diagnostic mapping found. Use clinical judgment.",
            diagnosticAssessments: params.diagnostics.map((testName) => {
              const procMatch = procedureData.find(
                (p) => fuzzyMatch(p.procedure_name, testName) || fuzzyMatch(testName, p.procedure_name),
              );
              return {
                testName,
                classification: "unmatched",
                condition: null,
                category: procMatch?.category ?? "unknown",
                costRange: procMatch ? { min: procMatch.min_cost_thb, max: procMatch.max_cost_thb } : null,
                reason: "No mapping data available for this diagnosis.",
              };
            }),
            summary: {
              totalDiagnostics: params.diagnostics.length,
              expectedCount: 0,
              conditionalCount: 0,
              unnecessaryCount: 0,
              unmatchedCount: params.diagnostics.length,
              excessiveDiagnosticCount: false,
            },
          }, null, 2),
        }],
        details: { icdCode: params.icdCode, diagnosisFound: false },
      };
    }

    const expectedTests = mapEntry.expected_diagnostics.map((t) => t.toLowerCase());
    const conditionalTests = mapEntry.conditional_diagnostics.map((t) => t.toLowerCase());
    const unnecessaryTests = mapEntry.unnecessary_diagnostics.map((t) => t.toLowerCase());

    const diagnosticAssessments = params.diagnostics.map((testName) => {
      const normalizedTest = normalizeForMatch(testName);
      const procMatch = procedureData.find(
        (p) => fuzzyMatch(p.procedure_name, testName) || fuzzyMatch(testName, p.procedure_name),
      );

      const isExpected = expectedTests.some(
        (et) => fuzzyMatch(normalizedTest, et) || fuzzyMatch(et, normalizedTest),
      );
      const conditionalMatch = conditionalTests.find((ct) => {
        const ctBase = ct.replace(/\(.*\)/, "").trim();
        return fuzzyMatch(normalizedTest, ctBase) || fuzzyMatch(ctBase, normalizedTest);
      });
      const isConditional = conditionalMatch != null;
      const condition = conditionalMatch?.match(/\((.*)\)/)?.[1] ?? null;
      const isUnnecessary = unnecessaryTests.some(
        (ut) => fuzzyMatch(normalizedTest, ut) || fuzzyMatch(ut, normalizedTest),
      );

      let classification: "expected" | "conditional" | "unnecessary" | "unmatched";
      let reason: string;

      if (isExpected) {
        classification = "expected";
        reason = `Standard workup test for ${mapEntry.diagnosis_group}`;
      } else if (isConditional) {
        classification = "conditional";
        reason = condition
          ? `May be needed for ${mapEntry.diagnosis_group}: ${condition.replace(/_/g, " ")}`
          : `Conditionally indicated for ${mapEntry.diagnosis_group}`;
      } else if (isUnnecessary) {
        classification = "unnecessary";
        reason = `Not indicated for ${mapEntry.diagnosis_group} — suggests over-testing or padding`;
      } else {
        classification = "unmatched";
        reason = `Not in diagnostic mapping for ${mapEntry.diagnosis_group} — use clinical judgment`;
      }

      return {
        testName,
        classification,
        condition,
        category: procMatch?.category ?? "unknown",
        costRange: procMatch ? { min: procMatch.min_cost_thb, max: procMatch.max_cost_thb } : null,
        reason,
      };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          diagnosisFound: true,
          diagnosisGroup: mapEntry.diagnosis_group,
          icdCode: mapEntry.icd_code,
          clinicalPathwaySource: mapEntry.clinical_pathway_source,
          maxTypicalDiagnosticCount: mapEntry.max_diagnostic_count,
          notes: mapEntry.notes,
          diagnosticAssessments,
          summary: {
            totalDiagnostics: params.diagnostics.length,
            expectedCount: diagnosticAssessments.filter((d) => d.classification === "expected").length,
            conditionalCount: diagnosticAssessments.filter((d) => d.classification === "conditional").length,
            unnecessaryCount: diagnosticAssessments.filter((d) => d.classification === "unnecessary").length,
            unmatchedCount: diagnosticAssessments.filter((d) => d.classification === "unmatched").length,
            excessiveDiagnosticCount: params.diagnostics.length > mapEntry.max_diagnostic_count,
          },
        }, null, 2),
      }],
      details: { icdCode: params.icdCode, diagnosisFound: true, diagnosticCount: params.diagnostics.length },
    };
  },
};

// ─── Tool 6: Duplicate Billing Check ────────────────────────────────────────

const thCheckDuplicateBillingTool: AgentTool = {
  name: "th_check_duplicate_billing",
  label: "Checking for Duplicate Billing",
  description:
    "Analyze billed items to detect billing anomalies: " +
    "1) Duplicate items (same item billed multiple times), " +
    "2) Suspiciously high quantities, " +
    "3) Potential therapeutic duplication (multiple drugs of same class). " +
    "Call this ONCE with ALL line items from the invoice/prescription.",
  parameters: Type.Object({
    items: Type.Array(
      Type.Object({
        name: Type.String({ description: "Name of the drug, procedure, or service" }),
        quantity: Type.Optional(Type.Number({ description: "Quantity billed" })),
        amount: Type.Optional(Type.Number({ description: "Total amount billed in THB" })),
        date: Type.Optional(Type.String({ description: "Date of service (if available)" })),
      }),
      { description: "List of all billed items from the invoice/prescription" },
    ),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_check_duplicate_billing");
    const drugData = getDrugData();

    const duplicates: Array<{ item: string; count: number; totalAmount: number }> = [];
    const quantityFlags: Array<{ item: string; quantity: number; reason: string }> = [];
    const therapeuticDuplications: Array<{ drugClass: string; drugs: string[] }> = [];

    // Detect duplicates
    const itemCounts = new Map<string, { count: number; totalAmount: number }>();
    for (const item of params.items) {
      const key = item.name.toLowerCase().trim();
      const existing = itemCounts.get(key) ?? { count: 0, totalAmount: 0 };
      existing.count += 1;
      existing.totalAmount += item.amount ?? 0;
      itemCounts.set(key, existing);
    }
    for (const [name, { count, totalAmount }] of itemCounts.entries()) {
      if (count > 1) duplicates.push({ item: name, count, totalAmount });
    }

    // Detect high quantities
    for (const item of params.items) {
      if (item.quantity == null || item.quantity <= 0) continue;
      const { matches: drugMatches } = findDrugMatches(drugData, item.name);
      const drugEntry = drugMatches[0] ?? null;
      if (drugEntry && drugEntry.typical_duration_days > 0 && drugEntry.daily_dose_units > 0) {
        const expectedMax = drugEntry.typical_duration_days * drugEntry.daily_dose_units * 2;
        if (item.quantity > expectedMax) {
          quantityFlags.push({
            item: item.name,
            quantity: item.quantity,
            reason: `Quantity ${item.quantity} exceeds 2x expected max (${expectedMax}) for ${drugEntry.typical_duration_days} days × ${drugEntry.daily_dose_units} units/day`,
          });
        }
      }
    }

    // Detect therapeutic duplication
    const drugsByCategory = new Map<string, string[]>();
    for (const item of params.items) {
      const { matches: drugMatches } = findDrugMatches(drugData, item.name);
      const drugEntry = drugMatches[0] ?? null;
      if (drugEntry?.drug_category) {
        const existing = drugsByCategory.get(drugEntry.drug_category) ?? [];
        existing.push(item.name);
        drugsByCategory.set(drugEntry.drug_category, existing);
      }
    }
    for (const [drugClass, drugs] of drugsByCategory.entries()) {
      if (drugs.length > 1) {
        const exemptCategories = ["IV_fluid", "electrolyte", "vitamin_supplement", "supplement"];
        if (!exemptCategories.includes(drugClass)) {
          therapeuticDuplications.push({ drugClass, drugs });
        }
      }
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          hasDuplicates: duplicates.length > 0,
          hasQuantityFlags: quantityFlags.length > 0,
          hasTherapeuticDuplications: therapeuticDuplications.length > 0,
          totalAnomalies: duplicates.length + quantityFlags.length + therapeuticDuplications.length,
          duplicates,
          quantityFlags,
          therapeuticDuplications,
        }, null, 2),
      }],
      details: { anomalyCount: duplicates.length + quantityFlags.length + therapeuticDuplications.length },
    };
  },
};

// ─── Tool 7: Compare Billing Amounts ────────────────────────────────────────

const thCompareBillingAmountsTool: AgentTool = {
  name: "th_compare_billing_amounts",
  label: "Comparing Billing Amounts",
  description:
    "Compare actual billed amounts for drugs, procedures, and tests against MoPH reference price ranges. " +
    "Returns a structured comparison: item, billed amount, reference range, variance %, and flag level " +
    "(within_range, slightly_over, significantly_over, extremely_over, no_reference). " +
    "Call this ONCE with ALL billed items after extracting expense data.",
  parameters: Type.Object({
    items: Type.Array(
      Type.Object({
        item_name: Type.String({ description: "Name of the drug, procedure, or test" }),
        item_type: Type.Union([
          Type.Literal("drug"),
          Type.Literal("procedure"),
          Type.Literal("diagnostic"),
          Type.Literal("other"),
        ], { description: "Type of billed item" }),
        billed_amount: Type.Number({ description: "Actual billed amount in THB (total for this line item)" }),
        quantity: Type.Optional(Type.Number({ description: "Quantity billed (e.g., tablets, vials). For drugs, billed_amount is divided by quantity before comparing." })),
      }),
      { description: "List of ALL billed items with their amounts" },
    ),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_compare_billing_amounts");
    const drugData = getDrugData();
    const procedureData = getProcedureData();

    const comparisons: Array<{
      item_name: string;
      item_type: string;
      billed_amount: number;
      per_unit_amount: number | null;
      quantity: number | null;
      reference_min: number | null;
      reference_max: number | null;
      reference_source: string | null;
      variance_pct: number | null;
      flag: string;
    }> = [];

    let totalBilled = 0;
    let totalWithinRange = 0;
    let totalOverReference = 0;

    for (const item of params.items) {
      totalBilled += item.billed_amount;
      let refMin: number | null = null;
      let refMax: number | null = null;
      let source: string | null = null;
      let effectiveBilledAmount = item.billed_amount;
      let quantityNormalized = false;

      if (item.item_type === "drug") {
        const { matches } = findDrugMatches(drugData, item.item_name);
        if (matches.length > 0) {
          refMin = Math.min(...matches.map((m: DrugEntry) => m.min_price_thb));
          refMax = Math.max(...matches.map((m: DrugEntry) => m.max_price_thb));
          source = "MoPH Drug Reference (per unit)";
          if (item.quantity && item.quantity > 1) {
            effectiveBilledAmount = item.billed_amount / item.quantity;
            quantityNormalized = true;
          }
        }
      } else if (item.item_type === "procedure" || item.item_type === "diagnostic") {
        if (item.item_name.trim().length >= 3) {
          const matches = procedureData.filter(
            (proc) =>
              fuzzyMatch(proc.procedure_name, item.item_name) ||
              fuzzyMatch(proc.english_name, item.item_name) ||
              (proc.procedure_code && fuzzyMatch(proc.procedure_code, item.item_name)),
          );
          if (matches.length > 0) {
            refMin = Math.min(...matches.map((m) => m.min_cost_thb));
            refMax = Math.max(...matches.map((m) => m.max_cost_thb));
            source = "MoPH Service Rate Schedule 2022";
          }
        }
      }

      let variancePct: number | null = null;
      let flag = "no_reference";

      if (refMax != null && refMax > 0) {
        variancePct = Math.round(((effectiveBilledAmount - refMax) / refMax) * 1000) / 10;
        if (effectiveBilledAmount <= refMax) {
          flag = "within_range";
          totalWithinRange += item.billed_amount;
        } else if (variancePct <= 50) {
          flag = "slightly_over";
          totalOverReference += item.billed_amount - (refMax * (item.quantity ?? 1));
        } else if (variancePct <= 100) {
          flag = "significantly_over";
          totalOverReference += item.billed_amount - (refMax * (item.quantity ?? 1));
        } else {
          flag = "extremely_over";
          totalOverReference += item.billed_amount - (refMax * (item.quantity ?? 1));
        }
      }

      comparisons.push({
        item_name: item.item_name,
        item_type: item.item_type,
        billed_amount: item.billed_amount,
        per_unit_amount: quantityNormalized ? effectiveBilledAmount : null,
        quantity: item.quantity ?? null,
        reference_min: refMin,
        reference_max: refMax,
        reference_source: source,
        variance_pct: variancePct,
        flag,
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          comparisons,
          summary: {
            totalItems: comparisons.length,
            totalBilledAmount: totalBilled,
            totalWithinRange,
            totalOverReference,
            itemsWithinRange: comparisons.filter((c) => c.flag === "within_range").length,
            itemsSlightlyOver: comparisons.filter((c) => c.flag === "slightly_over").length,
            itemsSignificantlyOver: comparisons.filter((c) => c.flag === "significantly_over").length,
            itemsExtremelyOver: comparisons.filter((c) => c.flag === "extremely_over").length,
            itemsNoReference: comparisons.filter((c) => c.flag === "no_reference").length,
            hasBillingConcerns: comparisons.some((c) => c.flag === "significantly_over" || c.flag === "extremely_over"),
          },
        }, null, 2),
      }],
      details: { totalItems: comparisons.length },
    };
  },
};

// ─── Tool 8: LOS Guideline Lookup ───────────────────────────────────────────

const thLookupLOSGuidelineTool: AgentTool = {
  name: "th_lookup_los_guideline",
  label: "Looking up LOS Guideline",
  description:
    "Look up length of stay (LOS) guidelines from the Thailand local reference database. " +
    "Search by ICD code or diagnosis name. Returns recommended min/max/typical days for hospital stay. " +
    "Use this for InPatient claims to validate if the length of stay is appropriate.",
  parameters: Type.Object({
    icdCode: Type.Optional(Type.String({ description: "ICD code to look up (e.g., J18.9)" })),
    diagnosis: Type.Optional(Type.String({ description: "Diagnosis name to search for" })),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_lookup_los_guideline");
    const guidelines = getLOSData();

    const matches = guidelines.filter((entry) => {
      if (params.icdCode && entry.icd_code.toLowerCase() === params.icdCode.toLowerCase()) return true;
      if (params.diagnosis && fuzzyMatch(entry.diagnosis_name, params.diagnosis)) return true;
      return false;
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          matchCount: matches.length,
          matches,
          totalGuidelinesInDatabase: guidelines.length,
          query: { icdCode: params.icdCode, diagnosis: params.diagnosis },
        }, null, 2),
      }],
      details: { matchCount: matches.length },
    };
  },
};

// ─── Tool 9: Surgery Classification ─────────────────────────────────────────

const thCheckSurgeryClassificationTool: AgentTool = {
  name: "th_check_surgery_classification",
  label: "Checking Surgery Classification",
  description:
    "Classify a surgery/procedure against the Thailand MoPH classification list. " +
    "If surgeryClass is not provided, auto-classifies by fuzzy-matching procedureName " +
    "against the MoPH procedure list.",
  parameters: Type.Object({
    procedureName: Type.String({ description: "Name of the surgery/procedure from the claim" }),
    surgeryClass: Type.Optional(Type.String({ description: "MoPH classification code if known from documents" })),
    diagnosisIcdCode: Type.Optional(Type.String({ description: "Primary ICD-10 code" })),
    diagnosisName: Type.Optional(Type.String({ description: "Diagnosis name for clinical context" })),
    durationMinutes: Type.Optional(Type.Number({ description: "Surgery duration in minutes (if documented)" })),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_check_surgery_classification");
    const procedureList = getProcedureSurgeryClassData();
    const classificationRef = getSurgeryClassData();

    const matchedProcedures = procedureList.filter((proc) => fuzzyMatch(proc.procedure_name, params.procedureName));

    let additionalMatches: ProcedureSurgeryClassEntry[] = [];
    if (matchedProcedures.length === 0) {
      const queryTerms = normalizeForMatch(params.procedureName).split(/\s+/).filter((t) => t.length >= 3);
      if (queryTerms.length > 0) {
        additionalMatches = procedureList.filter((proc) => {
          const normalizedName = normalizeForMatch(proc.procedure_name);
          const matchCount = queryTerms.filter((term) => normalizedName.includes(term)).length;
          return matchCount >= Math.ceil(queryTerms.length * 0.6);
        });
      }
    }

    const allMatches = matchedProcedures.length > 0 ? matchedProcedures : additionalMatches;
    const topMatches = allMatches.slice(0, 10);

    let classifiedAs: string | null = null;
    let classificationSource: "document" | "auto" | "not_found" = "not_found";

    if (params.surgeryClass) {
      const normalized = params.surgeryClass.toUpperCase();
      const validClass = classificationRef.find((c) => c.surgery_class.toUpperCase() === normalized);
      classifiedAs = validClass ? validClass.surgery_class : params.surgeryClass;
      classificationSource = "document";
    } else if (topMatches.length > 0) {
      const classesFound = [...new Set(topMatches.map((m) => m.surgery_class).filter(Boolean))];
      if (classesFound.length === 1) {
        classifiedAs = classesFound[0];
        classificationSource = "auto";
      } else if (classesFound.length > 1) {
        const classCounts = new Map<string, number>();
        for (const m of topMatches) {
          if (m.surgery_class) classCounts.set(m.surgery_class, (classCounts.get(m.surgery_class) ?? 0) + 1);
        }
        const sorted = [...classCounts.entries()].sort((a, b) => b[1] - a[1]);
        classifiedAs = sorted[0][0];
        classificationSource = "auto";
      }
    }

    const classDetails = classifiedAs
      ? classificationRef.find((c) => c.surgery_class.toUpperCase() === classifiedAs!.toUpperCase())
      : null;

    let durationAssessment: string | null = null;
    if (params.durationMinutes != null && classDetails) {
      durationAssessment = `Surgery duration: ${params.durationMinutes} minutes. Classification: ${classDetails.surgery_class_name}.`;
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          procedureName: params.procedureName,
          classifiedAs,
          classificationSource,
          classDetails: classDetails ? {
            surgeryClass: classDetails.surgery_class,
            surgeryClassName: classDetails.surgery_class_name,
            category: classDetails.category,
            categoryName: classDetails.category_name,
            complexityRank: classDetails.complexity_rank,
            circularReference: classDetails.circular_reference,
            notes: classDetails.notes,
          } : null,
          diagnosisContext: {
            diagnosisIcdCode: params.diagnosisIcdCode ?? null,
            diagnosisName: params.diagnosisName ?? null,
          },
          durationAssessment,
          matchedProcedures: topMatches.map((m) => ({
            procedureName: m.procedure_name,
            procedureCode: m.procedure_code,
            surgeryClass: m.surgery_class,
            specialty: m.specialty,
            facilityTier: m.facility_tier,
            priceThb: m.price_thb,
          })),
          totalMatchCount: allMatches.length,
          totalProceduresInDatabase: procedureList.length,
        }, null, 2),
      }],
      details: { procedureName: params.procedureName, classifiedAs },
    };
  },
};

// ─── Tool 10: MoPH Guidelines Lookup ────────────────────────────────────────

const thLookupMoPHGuidelinesTool: AgentTool = {
  name: "th_lookup_moph_guidelines",
  label: "Looking up MoPH Guidelines",
  description:
    "Look up Thailand Ministry of Public Health regulatory guidelines. " +
    "Topics: prescription_rules, long_term_diseases, surgery_classification, clinical_pathways, all.",
  parameters: Type.Object({
    topic: Type.Union([
      Type.Literal("prescription_rules"),
      Type.Literal("long_term_diseases"),
      Type.Literal("surgery_classification"),
      Type.Literal("clinical_pathways"),
      Type.Literal("all"),
    ], { description: "Which guideline topic to look up" }),
    query: Type.Optional(Type.String({ description: "Drug name, disease name, procedure name, or ICD code to search for" })),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_lookup_moph_guidelines");
    const result: Record<string, unknown> = {
      availableGuidelines: [
        "Thai MoPH Prescription Rules",
        "Thai MoPH Surgery Classification",
        "Clinical Pathways — Diagnosis-diagnostic mapping",
      ],
    };

    if (params.topic === "prescription_rules" || params.topic === "all") {
      result.prescriptionRules = getMoPHPrescriptionRules();
    }

    if (params.topic === "long_term_diseases" || params.topic === "all") {
      const diseases = getMoPHLongTermDiseaseData();
      if (params.query) {
        const matches = diseases.filter((d) =>
          fuzzyMatch(d.disease_name, params.query!) ||
          d.icd_codes.some((icd) => icd.toUpperCase().startsWith(params.query!.toUpperCase())) ||
          fuzzyMatch(d.category_name, params.query!),
        );
        result.longTermDiseaseMatches = matches.map((d) => ({
          categoryName: d.category_name,
          diseaseName: d.disease_name,
          icdCodes: d.icd_codes,
          maxPrescriptionDays: d.max_prescription_days,
          notes: d.notes,
        }));
      } else {
        result.longTermDiseaseMatches = diseases.slice(0, 10).map((d) => ({
          categoryName: d.category_name,
          diseaseName: d.disease_name,
          icdCodes: d.icd_codes,
          maxPrescriptionDays: d.max_prescription_days,
          notes: d.notes,
        }));
      }
    }

    if (params.topic === "surgery_classification" || params.topic === "all") {
      const classRef = getSurgeryClassData();
      result.surgeryClassificationRef = classRef.map((c) => ({
        surgeryClass: c.surgery_class,
        surgeryClassName: c.surgery_class_name,
        category: c.category,
        categoryName: c.category_name,
        complexityRank: c.complexity_rank,
        notes: c.notes,
      }));

      if (params.query) {
        const procedures = getProcedureSurgeryClassData();
        const matches = procedures.filter((p) => fuzzyMatch(p.procedure_name, params.query!));
        result.surgeryProcedureMatches = matches.slice(0, 20).map((p) => ({
          procedureName: p.procedure_name,
          specialty: p.specialty,
          surgeryClass: p.surgery_class,
        }));
      }
    }

    if (params.topic === "clinical_pathways" || params.topic === "all") {
      const diagnosticMap = getDiagnosisDiagnosticMapData();
      if (params.query) {
        const matches = diagnosticMap.filter((d) =>
          fuzzyMatch(d.diagnosis_group, params.query!) ||
          d.icd_code.toUpperCase().startsWith(params.query!.toUpperCase()),
        );
        result.clinicalPathwayMatches = matches.map((d) => ({
          icdCode: d.icd_code,
          diagnosisGroup: d.diagnosis_group,
          expectedDiagnostics: d.expected_diagnostics,
          conditionalDiagnostics: d.conditional_diagnostics,
          unnecessaryDiagnostics: d.unnecessary_diagnostics,
          maxDiagnosticCount: d.max_diagnostic_count,
          clinicalPathwaySource: d.clinical_pathway_source,
          notes: d.notes,
        }));

        const icdPrefix = params.query.split(".")[0]?.toUpperCase();
        if (icdPrefix) {
          const pathwayContent = getPathwayMarkdown(icdPrefix);
          if (pathwayContent) result.clinicalPathwayDetails = pathwayContent;
        }
      } else {
        result.clinicalPathwayMatches = diagnosticMap.slice(0, 10).map((d) => ({
          icdCode: d.icd_code,
          diagnosisGroup: d.diagnosis_group,
          expectedDiagnostics: d.expected_diagnostics,
          conditionalDiagnostics: d.conditional_diagnostics,
          unnecessaryDiagnostics: d.unnecessary_diagnostics,
          maxDiagnosticCount: d.max_diagnostic_count,
        }));
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: { topic: params.topic },
    };
  },
};

// ─── Tool 11: Single Drug Reference Lookup ──────────────────────────────────

const thLookupDrugReferenceTool: AgentTool = {
  name: "th_lookup_drug_reference",
  label: "Looking up Drug Reference",
  description:
    "Look up a single drug from the Thailand reference database. " +
    "Prefer th_lookup_drug_reference_batch for multiple drugs. " +
    "Returns price ranges (THB), indications, and contraindications.",
  parameters: Type.Object({
    query: Type.String({ description: "Drug brand name or generic name to search for" }),
    diagnosis: Type.Optional(Type.String({ description: "Diagnosis to check indication match against" })),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_lookup_drug_reference");
    const drugs = getDrugData();
    const { matches, brandResolved, resolvedGeneric } = findDrugMatches(drugs, params.query);

    const results = matches.map((drug: DrugEntry) => {
      const indicationMatch = params.diagnosis
        ? drug.indications.some((ind: string) => fuzzyMatch(ind, params.diagnosis!))
        : null;
      const contraindicated = params.diagnosis
        ? drug.contraindications.some((ci: string) => fuzzyMatch(ci, params.diagnosis!))
        : null;
      return { ...drug, indicationMatch, contraindicated };
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          query: params.query,
          matchCount: results.length,
          matches: results,
          totalDrugsInDatabase: drugs.length,
          ...(brandResolved ? { brandResolved: true, resolvedGeneric } : {}),
        }, null, 2),
      }],
      details: { query: params.query, matchCount: results.length },
    };
  },
};

// ─── Tool 12: Single Procedure Cost Lookup ──────────────────────────────────

const thLookupProcedureCostTool: AgentTool = {
  name: "th_lookup_procedure_cost",
  label: "Looking up Procedure Cost",
  description:
    "Look up a single procedure/test cost from the Thailand reference database. " +
    "Prefer th_lookup_procedure_cost_batch for multiple procedures. " +
    "Returns acceptable cost ranges (THB) by region and facility tier.",
  parameters: Type.Object({
    query: Type.String({ description: "Procedure name, code, or category to search for" }),
    region: Type.Optional(Type.String({ description: "Region filter" })),
    facilityTier: Type.Optional(Type.String({ description: "Facility tier filter: public or private" })),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_lookup_procedure_cost");
    const procedures = getProcedureData();
    let matches = procedures.filter(
      (proc) =>
        fuzzyMatch(proc.procedure_name, params.query) ||
        fuzzyMatch(proc.english_name, params.query) ||
        fuzzyMatch(proc.procedure_code, params.query) ||
        fuzzyMatch(proc.category, params.query),
    );
    if (params.region) matches = matches.filter((p) => p.region === "all" || p.region === params.region);
    if (params.facilityTier) matches = matches.filter((p) => p.facility_tier === "all" || p.facility_tier === params.facilityTier);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          query: params.query,
          matchCount: matches.length,
          matches,
          totalProceduresInDatabase: procedures.length,
        }, null, 2),
      }],
      details: { query: params.query, matchCount: matches.length },
    };
  },
};

// ─── Tool 13: Save Medical Necessity Report ─────────────────────────────────

const thSaveMedicalNecessityReportTool: AgentTool = {
  name: "th_save_medical_necessity_report",
  label: "Saving Medical Necessity Report",
  description:
    "Save the completed medical necessity report with rule-based guardrails applied automatically. " +
    "Populate the flags array on each line_item from tool results: " +
    "red_flag (drug compatibility), unrelated_drug, extremely_over_price (billing comparison), " +
    "duplicate (duplicate billing), unnecessary (diagnostic necessity), contraindicated (drug reference). " +
    "Call this ONCE after completing ALL analysis.",
  parameters: Type.Object({
    overall_tier: Type.Union([
      Type.Literal("clearly_necessary"),
      Type.Literal("likely_necessary"),
      Type.Literal("questionable"),
      Type.Literal("not_necessary"),
    ], { description: "Overall medical necessity assessment tier" }),
    line_items: Type.Array(
      Type.Object({
        item_name: Type.String({ description: "Name of the drug, procedure, or stay" }),
        item_type: Type.Union([
          Type.Literal("drug"),
          Type.Literal("procedure"),
          Type.Literal("diagnostic"),
          Type.Literal("los"),
          Type.Literal("other"),
        ], { description: "Type of line item" }),
        tier: Type.Union([
          Type.Literal("clearly_necessary"),
          Type.Literal("likely_necessary"),
          Type.Literal("questionable"),
          Type.Literal("not_necessary"),
        ], { description: "Assessed necessity tier" }),
        finding: Type.String({ description: "Detailed finding/explanation for this item" }),
        flags: Type.Optional(Type.Array(
          Type.Union([
            Type.Literal("contraindicated"),
            Type.Literal("duplicate"),
            Type.Literal("unnecessary"),
            Type.Literal("red_flag"),
            Type.Literal("extremely_over_price"),
            Type.Literal("unrelated_drug"),
          ]),
          { description: "Machine-detected flags from check tools" },
        )),
        amount_claimed: Type.Optional(Type.Number({ description: "Amount claimed in THB" })),
        reference_range: Type.Optional(Type.String({ description: "Reference range from lookup (e.g., 'min: 200, max: 800')" })),
      }),
      { description: "Individual line item assessments" },
    ),
    recommendations: Type.Array(Type.String(), { description: "List of medical necessity recommendations" }),
    report_markdown: Type.String({ description: "Full medical necessity report in markdown format" }),
    attention_summary: Type.Optional(Type.Object({
      flagged_count: Type.Number({ description: "Number of items scored Questionable or Not Necessary" }),
      needs_attention: Type.Boolean({ description: "True if any items are Questionable or Not Necessary" }),
      summary_text: Type.String({ description: "1-sentence summary of flagged issues" }),
    })),
  }),
  async execute(_toolCallId, params) {
    trackCall("th_save_medical_necessity_report");
    const adjustments: string[] = [];
    const flags = (f: string[] | undefined | null): Set<string> => new Set(f ?? []);

    // Apply guardrail rules — flag-based only (no keyword matching on finding text,
    // which caused false positives on negated phrases like "not contraindicated")
    const adjustedItems = params.line_items.map((item) => {
      let adjustedTier = item.tier;
      const itemFlags = flags(item.flags);

      // Rule 2: Contraindicated flag → must be "not_necessary"
      if (itemFlags.has("contraindicated")) {
        if (adjustedTier !== "not_necessary") {
          adjustments.push(`Rule 2 (contraindicated): "${item.item_name}" → set to "not_necessary"`);
        }
        adjustedTier = "not_necessary";
      }

      // Rule 3: Duplicate flag → minimum "questionable"
      if (itemFlags.has("duplicate")) {
        if (adjustedTier === "clearly_necessary" || adjustedTier === "likely_necessary") {
          adjustments.push(`Rule 3 (duplicate): "${item.item_name}" → downgraded to "questionable"`);
          adjustedTier = "questionable";
        }
      }

      // Rule 5: Unnecessary flag → minimum "questionable"
      if (itemFlags.has("unnecessary")) {
        if (adjustedTier === "clearly_necessary" || adjustedTier === "likely_necessary") {
          adjustments.push(`Rule 5 (unnecessary): "${item.item_name}" → downgraded to "questionable"`);
          adjustedTier = "questionable";
        }
      }

      // Rule 7: Extremely over price flag → minimum "questionable"
      if (itemFlags.has("extremely_over_price")) {
        if (adjustedTier === "clearly_necessary" || adjustedTier === "likely_necessary") {
          adjustments.push(`Rule 7 (price flag): "${item.item_name}" → downgraded to "questionable"`);
          adjustedTier = "questionable";
        }
      }

      // Rule 8: Unrelated drug flag → downgrade from "clearly_necessary"
      if (itemFlags.has("unrelated_drug")) {
        if (adjustedTier === "clearly_necessary") {
          adjustments.push(`Rule 8 (unrelated): "${item.item_name}" → downgraded to "likely_necessary"`);
          adjustedTier = "likely_necessary";
        }
      }

      // Finding-tier consistency: the [OVERALL] verdict in the finding represents
      // the agent's reasoned clinical judgment. If the tier doesn't match, the
      // finding verdict wins (unless a hard safety flag like "contraindicated" applies).
      const overallMatch = /\[OVERALL\]\s*(Clearly Necessary|Likely Necessary|Questionable|Not Necessary)/i.exec(item.finding);
      if (overallMatch && !itemFlags.has("contraindicated")) {
        const findingTier = overallMatch[1].toLowerCase().replace(/\s+/g, "_");
        if (findingTier !== adjustedTier) {
          adjustments.push(`Finding consistency: "${item.item_name}" tier "${adjustedTier}" overridden to "${findingTier}" to match [OVERALL] verdict in finding`);
          adjustedTier = findingTier;
        }
      }

      return { ...item, tier: adjustedTier, finding: item.finding };
    });

    // Rule 4: Excessive drug count → bump overall tier
    const drugItemCount = adjustedItems.filter((item) => item.item_type === "drug").length;
    let adjustedOverallTier = params.overall_tier;
    if (drugItemCount > 10 && adjustedOverallTier === "clearly_necessary") {
      adjustments.push(`Rule 4 (drug count): ${drugItemCount} drugs exceed threshold of 10 → overall tier bumped to "likely_necessary"`);
      adjustedOverallTier = "likely_necessary";
    }

    // Rule 6: Excessive diagnostic count → bump overall tier
    const diagnosticItemCount = adjustedItems.filter((item) => item.item_type === "diagnostic").length;
    if (diagnosticItemCount > 10 && adjustedOverallTier === "clearly_necessary") {
      adjustments.push(`Rule 6 (diagnostic count): ${diagnosticItemCount} diagnostics exceed threshold of 10 → overall tier bumped to "likely_necessary"`);
      adjustedOverallTier = "likely_necessary";
    }

    // ── Worst-item tier (legacy, kept for auditing) ──
    const tierOrder = ["clearly_necessary", "likely_necessary", "questionable", "not_necessary"] as const;
    const worstItemTier = adjustedItems.reduce((worst, item) => {
      const itemIdx = tierOrder.indexOf(item.tier as (typeof tierOrder)[number]);
      const worstIdx = tierOrder.indexOf(worst as (typeof tierOrder)[number]);
      return itemIdx > worstIdx ? item.tier : worst;
    }, adjustedOverallTier);

    // ── Weighted overall tier (financial-weight-based) ──
    const totalClaimAmount = adjustedItems.reduce((sum, item) => sum + (item.amount_claimed ?? 0), 0);
    const notNecessaryItems = adjustedItems.filter((item) => item.tier === "not_necessary");
    const questionableItems = adjustedItems.filter((item) => item.tier === "questionable");
    const hasContraindicated = adjustedItems.some((item) => {
      const itemFlags = new Set(item.flags ?? []);
      return itemFlags.has("contraindicated");
    });

    const notNecessaryAmount = notNecessaryItems.reduce((sum, item) => sum + (item.amount_claimed ?? 0), 0);
    const questionableAmount = questionableItems.reduce((sum, item) => sum + (item.amount_claimed ?? 0), 0);
    const flaggedAmount = notNecessaryAmount + questionableAmount;

    let weightedOverallTier = adjustedOverallTier;
    if (totalClaimAmount > 0) {
      const notNecessaryRatio = notNecessaryAmount / totalClaimAmount;
      const flaggedRatio = flaggedAmount / totalClaimAmount;

      if (hasContraindicated || notNecessaryRatio > 0.10) {
        weightedOverallTier = "not_necessary";
      } else if (flaggedRatio > 0.30) {
        weightedOverallTier = "questionable";
      } else if (flaggedRatio > 0.10) {
        // Don't upgrade — only constrain to at least "likely_necessary"
        const currentIdx = tierOrder.indexOf(weightedOverallTier as (typeof tierOrder)[number]);
        const likelyIdx = tierOrder.indexOf("likely_necessary");
        if (currentIdx < likelyIdx) {
          weightedOverallTier = "likely_necessary";
        }
      }
      // flaggedRatio < 10% → keep agent's original tier
    }

    if (worstItemTier !== weightedOverallTier) {
      adjustments.push(`Weighted tier: worst-item="${worstItemTier}" differs from weighted="${weightedOverallTier}" (flagged ${Math.round((flaggedAmount / (totalClaimAmount || 1)) * 100)}% of claim amount)`);
    }

    // ── Severity-weighted attention summary ──
    const notNecessaryCount = notNecessaryItems.length;
    const questionableCount = questionableItems.length;
    const totalFlaggedAmount = flaggedAmount;

    const summaryParts: string[] = [];
    if (notNecessaryCount > 0) {
      summaryParts.push(`${notNecessaryCount} not necessary (${formatThb(notNecessaryAmount)})`);
    }
    if (questionableCount > 0) {
      summaryParts.push(`${questionableCount} questionable (${formatThb(questionableAmount)})`);
    }

    const summaryText = summaryParts.length > 0
      ? `${summaryParts.join(", ")} — total flagged: ${formatThb(totalFlaggedAmount)}`
      : "No flags raised";

    const computedAttentionSummary = {
      flagged_count: notNecessaryCount + questionableCount,
      needs_attention: notNecessaryCount + questionableCount > 0,
      summary_text: summaryText,
      not_necessary_count: notNecessaryCount,
      not_necessary_amount: notNecessaryAmount,
      questionable_count: questionableCount,
      questionable_amount: questionableAmount,
      total_flagged_amount: totalFlaggedAmount,
    };

    const NecessityTierLabel: Record<string, string> = {
      clearly_necessary: "Clearly Necessary",
      likely_necessary: "Likely Necessary",
      questionable: "Questionable",
      not_necessary: "Not Necessary",
    };

    // Persist to medicalNecessity namespace
    await mergeExtractedData(claimId, {
      overall_tier: weightedOverallTier,
      worst_item_tier: worstItemTier,
      adjustedItems,
      attention_summary: computedAttentionSummary,
      recommendations: params.recommendations,
      report_markdown: params.report_markdown,
      completedAt: new Date().toISOString(),
    }, "medicalNecessity");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          overall_tier: NecessityTierLabel[weightedOverallTier] ?? weightedOverallTier,
          worst_item_tier: NecessityTierLabel[worstItemTier] ?? worstItemTier,
          savedItemCount: adjustedItems.length,
          adjustments_applied: adjustments.length > 0 ? adjustments : undefined,
        }, null, 2),
      }],
      details: { claimId, overall_tier: weightedOverallTier, itemCount: adjustedItems.length },
    };
  },
};

  const allTools = [
    fetchClaimForMNTool,
    thLookupDrugReferenceBatchTool,
    thLookupProcedureCostBatchTool,
    thCheckDiagnosisDrugCompatibilityTool,
    thCheckDiagnosticNecessityTool,
    thCheckDuplicateBillingTool,
    thCompareBillingAmountsTool,
    thLookupLOSGuidelineTool,
    thCheckSurgeryClassificationTool,
    thLookupMoPHGuidelinesTool,
    thLookupDrugReferenceTool,
    thLookupProcedureCostTool,
    thSaveMedicalNecessityReportTool,
  ];

  return {
    allTools,
    // Expose for self-check and forced save in agent.ts
    getCalledTools: () => calledTools,
    mandatoryTools: [
      "th_check_diagnosis_drug_compatibility",
      "th_check_diagnostic_necessity",
      "th_check_duplicate_billing",
      "th_compare_billing_amounts",
    ],
    lookupTools: [
      "th_lookup_drug_reference_batch",
      "th_lookup_drug_reference",
    ],
    procedureLookupTools: [
      "th_lookup_procedure_cost_batch",
      "th_lookup_procedure_cost",
    ],
    saveToolName: "th_save_medical_necessity_report",
  };
}
