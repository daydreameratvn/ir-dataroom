/**
 * Thailand medical reference data — CSV parsing, caching, and lookup utilities.
 * Ported from Cherry's thailand-medical-necessity.ts and th-pre-existing.ts.
 *
 * All data files live in agents/shared/data-thailand/.
 */

import { readFileSync } from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DrugEntry = {
  contraindications: string[];
  daily_dose_units: number;
  drug_category: string;
  drug_name: string;
  generic_name: string;
  indications: string[];
  max_price_thb: number;
  min_price_thb: number;
  registration_number: string;
  source: string;
  typical_duration_days: number;
  unit: string;
};

export type ProcedureEntry = {
  category: string;
  english_name: string;
  facility_tier: string;
  max_cost_thb: number;
  min_cost_thb: number;
  procedure_code: string;
  procedure_name: string;
  region: string;
  source: string;
};

export type LOSEntry = {
  diagnosis_name: string;
  icd_code: string;
  max_days: number;
  min_days: number;
  notes: string;
  procedure_type: string;
  source: string;
  typical_days: number;
};

export type DiagnosisDrugMapEntry = {
  expected_drug_classes: string[];
  icd_code: string;
  diagnosis_group: string;
  max_drug_count: number;
  notes: string;
  red_flag_drugs: string[];
};

export type DiagnosisDiagnosticMapEntry = {
  clinical_pathway_source: string;
  conditional_diagnostics: string[];
  diagnosis_group: string;
  expected_diagnostics: string[];
  icd_code: string;
  max_diagnostic_count: number;
  notes: string;
  unnecessary_diagnostics: string[];
};

export type BrandMappingEntry = {
  brand_name: string;
  generic_name: string;
  manufacturer: string;
  source: string;
};

export type DrugClassMappingEntry = {
  drug_category_patterns: string[];
  expected_class: string;
  notes: string;
};

export type SurgeryClassEntry = {
  category: string;
  category_name: string;
  circular_reference: string;
  complexity_rank: number;
  notes: string;
  surgery_class: string;
  surgery_class_name: string;
};

export type ProcedureSurgeryClassEntry = {
  facility_tier: string;
  notes: string;
  price_thb: number;
  procedure_code: string;
  procedure_name: string;
  specialty: string;
  surgery_class: string;
};

export type MoPHLongTermDiseaseEntry = {
  category_code: string;
  category_name: string;
  circular_number: string;
  disease_code: string;
  disease_name: string;
  icd_codes: string[];
  max_prescription_days: number;
  notes: string;
  stt: number;
};

export type ChronicConditionEntry = {
  icd_code_start: string;
  icd_code_end: string;
  condition_name: string;
  condition_category: string;
  is_chronic: boolean;
  waiting_period_days: number;
  waiting_period_type: string;
  indicator_medications: string[];
  indicator_phrases: string[];
};

export type Icd10To9Entry = {
  icd10_code: string;
  icd9_code: string;
  description: string;
};

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV<T>(filePath: string, transform: (row: Record<string, string>) => T): T[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = values[i] ?? "";
    });
    return transform(row);
  });
}

// ─── String Matching ──────────────────────────────────────────────────────────

/** Normalize a string for matching: lowercase, strip diacritics, trim */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Enhanced case-insensitive fuzzy match with multiple strategies:
 * 1. All query terms appear in target
 * 2. Exact bidirectional substring
 * 3. Suffix-tolerant: single-word query matches start of target word
 * 4. Threshold matching: ≥60% of query terms found in target
 */
export function fuzzyMatch(target: string, query: string): boolean {
  if (!target || !query) return false;

  const normalizedTarget = normalizeForMatch(target);
  const normalizedQuery = normalizeForMatch(query);

  if (!normalizedTarget || !normalizedQuery) return false;

  // Strategy 1: All query terms appear in target
  const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryTerms.every((term) => normalizedTarget.includes(term))) return true;

  // Strategy 2: Bidirectional substring
  if (normalizedTarget.includes(normalizedQuery) || normalizedQuery.includes(normalizedTarget)) return true;

  // Strategy 3: Suffix-tolerant (min 3 chars)
  if (queryTerms.length === 1 && queryTerms[0].length >= 3) {
    const targetWords = normalizedTarget.split(/\s+/).filter((w) => w.length >= 3);
    if (targetWords.some((tw) => tw.startsWith(queryTerms[0]) || queryTerms[0].startsWith(tw))) return true;
  }

  // Strategy 4: 60% threshold for multi-word queries
  if (queryTerms.length >= 2) {
    const matchedCount = queryTerms.filter((term) => normalizedTarget.includes(term)).length;
    if (matchedCount / queryTerms.length >= 0.6) return true;
  }

  return false;
}

// ─── Drug Resolution ──────────────────────────────────────────────────────────

/** Resolve a brand name to generic name(s) via drug-brand-mapping.csv */
export function resolveBrandToGeneric(query: string): string[] {
  const brandData = getBrandMappingData();
  const normalizedQuery = normalizeForMatch(query);

  const exactMatches = brandData.filter((entry) => normalizeForMatch(entry.brand_name) === normalizedQuery);
  if (exactMatches.length > 0) return exactMatches.map((e) => e.generic_name);

  const fuzzyMatches = brandData.filter((entry) => {
    const normalizedBrand = normalizeForMatch(entry.brand_name);
    return normalizedBrand.includes(normalizedQuery) || normalizedQuery.includes(normalizedBrand);
  });
  return fuzzyMatches.map((e) => e.generic_name);
}

/**
 * Find drug matches: direct match then brand resolution fallback.
 */
export function findDrugMatches(drugs: DrugEntry[], query: string): { matches: DrugEntry[]; brandResolved: boolean; resolvedGeneric?: string } {
  const directMatches = drugs.filter(
    (drug) => fuzzyMatch(drug.drug_name, query) || fuzzyMatch(drug.generic_name, query),
  );

  if (directMatches.length > 0) return { matches: directMatches, brandResolved: false };

  const resolvedGenerics = resolveBrandToGeneric(query);
  if (resolvedGenerics.length > 0) {
    const brandMatches: DrugEntry[] = [];
    let matchedGeneric: string | undefined;

    for (const generic of resolvedGenerics) {
      const matches = drugs.filter(
        (drug) => fuzzyMatch(drug.drug_name, generic) || fuzzyMatch(drug.generic_name, generic),
      );
      if (matches.length > 0) {
        brandMatches.push(...matches);
        matchedGeneric = generic;
      }
    }

    const seen = new Set<string>();
    const deduped = brandMatches.filter((d) => {
      const key = d.registration_number || `${d.drug_name}_${d.generic_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0) return { matches: deduped, brandResolved: true, resolvedGeneric: matchedGeneric };
  }

  return { matches: [], brandResolved: false };
}

/**
 * Resolve a drug class name to matching drug_category patterns.
 * Handles parametrized classes like "statins(atorvastatin_or_simvastatin)".
 */
export function resolveDrugClassToCategories(expectedClass: string): { drugNames: string[]; patterns: string[] } {
  const baseClass = expectedClass.replace(/\(.*\)/, "").trim();
  const drugNamesRaw = expectedClass.match(/\(([^)]+)\)/)?.[1] ?? "";
  const drugNames = drugNamesRaw
    .split("_or_")
    .map((n) => n.replace(/_/g, " ").trim())
    .filter(Boolean);

  const mappings = getDrugClassMappingData();
  const mapping = mappings.find((m) => m.expected_class === baseClass);
  return { drugNames, patterns: mapping?.drug_category_patterns ?? [] };
}

// ─── Reconciliation Helper ────────────────────────────────────────────────────

/**
 * Adjusts the largest item so the sum of `field` matches `expectedTotal` exactly.
 * Mutates items in-place.
 */
export function reconcileToTotal(
  items: Array<{ grossAmount: number; discountAmount: number; payableAmount: number }>,
  field: "grossAmount" | "payableAmount",
  expectedTotal: number,
  tolerance = 50,
): boolean {
  if (items.length === 0) return false;

  let currentSum = 0;
  for (const item of items) currentSum += item[field];
  const residual = Math.round((expectedTotal - currentSum) * 100) / 100;

  if (residual === 0) return true;
  if (Math.abs(residual) > tolerance) return false;

  let idx = 0;
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i][field]) > Math.abs(items[idx][field])) idx = i;
  }
  items[idx][field] = Math.round((items[idx][field] + residual) * 100) / 100;

  if (field === "grossAmount") {
    items[idx].payableAmount = Math.round((items[idx].grossAmount - items[idx].discountAmount) * 100) / 100;
  }

  return true;
}

// ─── ICD Code Matching (for chronic conditions) ───────────────────────────────

export function icdCodeMatchesEntry(icdCode: string, entry: ChronicConditionEntry): boolean {
  const normalizedCode = icdCode.toUpperCase().trim();
  const start = entry.icd_code_start.toUpperCase().trim();
  const end = entry.icd_code_end.toUpperCase().trim();

  if (!end) return normalizedCode === start || normalizedCode.startsWith(start + ".");

  const startLetter = start.charAt(0);
  const endLetter = end.charAt(0);

  if (startLetter !== endLetter) {
    const codeLetter = normalizedCode.charAt(0);
    if (codeLetter < startLetter || codeLetter > endLetter) return false;
    if (codeLetter > startLetter && codeLetter < endLetter) return true;

    const codeNum = parseInt(normalizedCode.slice(1), 10);
    if (codeLetter === startLetter) return codeNum >= parseInt(start.slice(1), 10);
    if (codeLetter === endLetter) return codeNum <= parseInt(end.slice(1), 10);
    return false;
  }

  const codeLetter = normalizedCode.charAt(0);
  if (codeLetter !== startLetter) return false;

  const codeNum = parseInt(normalizedCode.slice(1), 10);
  const startNum = parseInt(start.slice(1), 10);
  const endNum = parseInt(end.slice(1), 10);

  return !isNaN(codeNum) && codeNum >= startNum && codeNum <= endNum;
}

// ─── Data Directory Resolution ────────────────────────────────────────────────

const THAILAND_DATA_DIR = "data-thailand";

function resolveDataPath(filename: string): string {
  const cwd = process.cwd();
  const candidates = [
    join(cwd, `agents/shared/${THAILAND_DATA_DIR}`, filename),
    // Fallback: running from agents/ directly
    join(cwd, `shared/${THAILAND_DATA_DIR}`, filename),
  ];
  if (typeof import.meta.dirname === "string") {
    candidates.push(join(import.meta.dirname, THAILAND_DATA_DIR, filename));
  }
  for (const candidate of candidates) {
    try {
      readFileSync(candidate, "utf-8");
      return candidate;
    } catch {
      // try next
    }
  }
  return candidates[0];
}

// ─── Module-Level Caches ──────────────────────────────────────────────────────

let drugCache: DrugEntry[] | null = null;
let procedureCache: ProcedureEntry[] | null = null;
let losCache: LOSEntry[] | null = null;
let diagnosisDrugMapCache: DiagnosisDrugMapEntry[] | null = null;
let diagnosisDiagnosticMapCache: DiagnosisDiagnosticMapEntry[] | null = null;
let brandMappingCache: BrandMappingEntry[] | null = null;
let drugClassMappingCache: DrugClassMappingEntry[] | null = null;
let surgeryClassCache: SurgeryClassEntry[] | null = null;
let procedureSurgeryClassCache: ProcedureSurgeryClassEntry[] | null = null;
let mophLongTermDiseaseCache: MoPHLongTermDiseaseEntry[] | null = null;
let mophPrescriptionRulesCache: string | null = null;
let chronicConditionsCache: ChronicConditionEntry[] | null = null;
let icd10To9Cache: Icd10To9Entry[] | null = null;
const pathwayMarkdownCache: Record<string, string> = {};

const dataLoadErrors: Record<string, string> = {};

// ─── Data Loaders ─────────────────────────────────────────────────────────────

export function getDrugData(): DrugEntry[] {
  if (drugCache == null) {
    try {
      drugCache = parseCSV<DrugEntry>(resolveDataPath("drug-reference.csv"), (row) => ({
        contraindications: (row.contraindications ?? "").split(";").map((s) => s.trim()).filter(Boolean),
        daily_dose_units: Number(row.daily_dose_units) || 0,
        drug_category: row.drug_category ?? "",
        drug_name: row.drug_name ?? "",
        generic_name: row.generic_name ?? "",
        indications: (row.indications ?? "").split(";").map((s) => s.trim()).filter(Boolean),
        max_price_thb: Number(row.max_price_thb) || 0,
        min_price_thb: Number(row.min_price_thb) || 0,
        registration_number: row.registration_number ?? "",
        source: row.source ?? "",
        typical_duration_days: Number(row.typical_duration_days) || 0,
        unit: row.unit ?? "",
      }));
    } catch (error) {
      const msg = `Failed to load drug-reference.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.drugReference = msg;
      drugCache = [];
    }
  }
  return drugCache;
}

export function getProcedureData(): ProcedureEntry[] {
  if (procedureCache == null) {
    try {
      procedureCache = parseCSV<ProcedureEntry>(resolveDataPath("procedure-costs.csv"), (row) => ({
        category: row.category ?? "",
        english_name: row.english_name ?? "",
        facility_tier: row.facility_tier ?? "",
        max_cost_thb: Number(row.max_cost_thb) || 0,
        min_cost_thb: Number(row.min_cost_thb) || 0,
        procedure_code: row.procedure_code ?? "",
        procedure_name: row.procedure_name ?? "",
        region: row.region ?? "",
        source: row.source ?? "",
      }));
    } catch (error) {
      const msg = `Failed to load procedure-costs.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.procedures = msg;
      procedureCache = [];
    }
  }
  return procedureCache;
}

export function getLOSData(): LOSEntry[] {
  if (losCache == null) {
    try {
      losCache = parseCSV<LOSEntry>(resolveDataPath("los-guidelines.csv"), (row) => ({
        diagnosis_name: row.diagnosis_name ?? "",
        icd_code: row.icd_code ?? "",
        max_days: Number(row.max_days) || 0,
        min_days: Number(row.min_days) || 0,
        notes: row.notes ?? "",
        procedure_type: row.procedure_type ?? "",
        source: row.source ?? "",
        typical_days: Number(row.typical_days) || 0,
      }));
    } catch (error) {
      const msg = `Failed to load los-guidelines.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.losGuidelines = msg;
      losCache = [];
    }
  }
  return losCache;
}

export function getDiagnosisDrugMapData(): DiagnosisDrugMapEntry[] {
  if (diagnosisDrugMapCache == null) {
    try {
      diagnosisDrugMapCache = parseCSV<DiagnosisDrugMapEntry>(resolveDataPath("diagnosis-drug-map.csv"), (row) => ({
        expected_drug_classes: (row.expected_drug_classes ?? "").split(";").map((s) => s.trim()).filter(Boolean),
        icd_code: row.icd_code ?? "",
        diagnosis_group: row.diagnosis_group ?? "",
        max_drug_count: Number(row.max_drug_count) || 10,
        notes: row.notes ?? "",
        red_flag_drugs: (row.red_flag_drugs ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      }));
    } catch (error) {
      const msg = `Failed to load diagnosis-drug-map.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.diagnosisDrugMap = msg;
      diagnosisDrugMapCache = [];
    }
  }
  return diagnosisDrugMapCache;
}

export function getDiagnosisDiagnosticMapData(): DiagnosisDiagnosticMapEntry[] {
  if (diagnosisDiagnosticMapCache == null) {
    try {
      diagnosisDiagnosticMapCache = parseCSV<DiagnosisDiagnosticMapEntry>(
        resolveDataPath("diagnosis-diagnostic-map.csv"),
        (row) => ({
          clinical_pathway_source: row.clinical_pathway_source ?? "general",
          conditional_diagnostics: (row.conditional_diagnostics ?? "").split(";").map((s) => s.trim()).filter((s) => s.length > 0 && s !== "none"),
          diagnosis_group: row.diagnosis_group ?? "",
          expected_diagnostics: (row.expected_diagnostics ?? "").split(";").map((s) => s.trim()).filter((s) => s.length > 0 && s !== "none"),
          icd_code: row.icd_code ?? "",
          max_diagnostic_count: Number(row.max_diagnostic_count) || 5,
          notes: row.notes ?? "",
          unnecessary_diagnostics: (row.unnecessary_diagnostics ?? "").split(";").map((s) => s.trim()).filter((s) => s.length > 0 && s !== "none"),
        }),
      );
    } catch (error) {
      const msg = `Failed to load diagnosis-diagnostic-map.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.diagnosisDiagnosticMap = msg;
      diagnosisDiagnosticMapCache = [];
    }
  }
  return diagnosisDiagnosticMapCache;
}

export function getBrandMappingData(): BrandMappingEntry[] {
  if (brandMappingCache == null) {
    try {
      brandMappingCache = parseCSV<BrandMappingEntry>(resolveDataPath("drug-brand-mapping.csv"), (row) => ({
        brand_name: row.brand_name ?? "",
        generic_name: row.generic_name ?? "",
        manufacturer: row.manufacturer ?? "",
        source: row.source ?? "",
      }));
    } catch (error) {
      const msg = `Failed to load drug-brand-mapping.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.brandMapping = msg;
      brandMappingCache = [];
    }
  }
  return brandMappingCache;
}

export function getDrugClassMappingData(): DrugClassMappingEntry[] {
  if (drugClassMappingCache == null) {
    try {
      drugClassMappingCache = parseCSV<DrugClassMappingEntry>(resolveDataPath("drug-class-mapping.csv"), (row) => ({
        drug_category_patterns: (row.drug_category_pattern ?? "").split(";").map((p) => p.trim()).filter(Boolean),
        expected_class: row.expected_class ?? "",
        notes: row.notes ?? "",
      }));
    } catch (error) {
      const msg = `Failed to load drug-class-mapping.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.drugClassMapping = msg;
      drugClassMappingCache = [];
    }
  }
  return drugClassMappingCache;
}

export function getSurgeryClassData(): SurgeryClassEntry[] {
  if (surgeryClassCache == null) {
    try {
      surgeryClassCache = parseCSV<SurgeryClassEntry>(
        resolveDataPath("moh-guidelines/surgery-classification.csv"),
        (row) => ({
          category: row.category ?? "",
          category_name: row.category_name ?? "",
          circular_reference: row.circular_reference ?? "",
          complexity_rank: Number(row.complexity_rank) || 0,
          notes: row.notes ?? "",
          surgery_class: row.surgery_class ?? "",
          surgery_class_name: row.surgery_class_name ?? "",
        }),
      );
    } catch (error) {
      const msg = `Failed to load surgery-classification.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.surgeryClass = msg;
      surgeryClassCache = [];
    }
  }
  return surgeryClassCache;
}

export function getProcedureSurgeryClassData(): ProcedureSurgeryClassEntry[] {
  if (procedureSurgeryClassCache == null) {
    try {
      procedureSurgeryClassCache = parseCSV<ProcedureSurgeryClassEntry>(
        resolveDataPath("moh-guidelines/procedure-surgery-class.csv"),
        (row) => ({
          facility_tier: row.facility_tier ?? "",
          notes: row.notes ?? "",
          price_thb: Number(row.price_thb) || 0,
          procedure_code: row.procedure_code ?? "",
          procedure_name: row.procedure_name ?? "",
          specialty: row.specialty ?? "",
          surgery_class: row.surgery_class ?? "",
        }),
      );
    } catch (error) {
      const msg = `Failed to load procedure-surgery-class.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.procedureSurgeryClass = msg;
      procedureSurgeryClassCache = [];
    }
  }
  return procedureSurgeryClassCache;
}

export function getMoPHLongTermDiseaseData(): MoPHLongTermDiseaseEntry[] {
  if (mophLongTermDiseaseCache == null) {
    try {
      mophLongTermDiseaseCache = parseCSV<MoPHLongTermDiseaseEntry>(
        resolveDataPath("moh-guidelines/long-term-diseases.csv"),
        (row) => ({
          category_code: row.category_code ?? "",
          category_name: row.category_name ?? "",
          circular_number: row.circular_number ?? "",
          disease_code: row.disease_code ?? "",
          disease_name: row.disease_name ?? "",
          icd_codes: (row.icd_codes ?? "").split(";").map((s) => s.trim()).filter(Boolean),
          max_prescription_days: Number(row.max_prescription_days) || 90,
          notes: row.notes ?? "",
          stt: Number(row.stt) || 0,
        }),
      );
    } catch (error) {
      const msg = `Failed to load long-term-diseases.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.longTermDiseases = msg;
      mophLongTermDiseaseCache = [];
    }
  }
  return mophLongTermDiseaseCache;
}

export function getMoPHPrescriptionRules(): string {
  if (mophPrescriptionRulesCache == null) {
    try {
      mophPrescriptionRulesCache = readFileSync(resolveDataPath("moh-guidelines/prescription-rules.md"), "utf-8");
    } catch (error) {
      const msg = `Failed to load prescription-rules.md: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.prescriptionRules = msg;
      mophPrescriptionRulesCache = "";
    }
  }
  return mophPrescriptionRulesCache;
}

export function getChronicConditionsData(): ChronicConditionEntry[] {
  if (chronicConditionsCache == null) {
    try {
      chronicConditionsCache = parseCSV<ChronicConditionEntry>(
        resolveDataPath("chronic-conditions-reference.csv"),
        (row) => ({
          icd_code_start: row.icd_code_start ?? "",
          icd_code_end: row.icd_code_end ?? "",
          condition_name: row.condition_name ?? "",
          condition_category: row.condition_category ?? "",
          is_chronic: row.is_chronic === "true",
          waiting_period_days: Number(row.waiting_period_days) || 30,
          waiting_period_type: row.waiting_period_type ?? "general",
          indicator_medications: (row.indicator_medications ?? "").split(";").map((s) => s.trim()).filter(Boolean),
          indicator_phrases: (row.indicator_phrases ?? "").split(";").map((s) => s.trim()).filter(Boolean),
        }),
      );
    } catch (error) {
      const msg = `Failed to load chronic-conditions-reference.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      chronicConditionsCache = [];
    }
  }
  return chronicConditionsCache;
}

export function getIcd10To9Data(): Icd10To9Entry[] {
  if (icd10To9Cache == null) {
    try {
      icd10To9Cache = parseCSV<Icd10To9Entry>(resolveDataPath("icd10-icd9-map.csv"), (row) => ({
        icd10_code: row.icd10_code ?? "",
        icd9_code: row.icd9_code ?? "",
        description: row.description ?? "",
      }));
    } catch (error) {
      const msg = `Failed to load icd10-icd9-map.csv: ${error instanceof Error ? error.message : String(error)}`;
      console.warn("[csv-data]", msg);
      dataLoadErrors.icd10To9Map = msg;
      icd10To9Cache = [];
    }
  }
  return icd10To9Cache;
}

/** Look up ICD-9 code from an ICD-10 code. Tries exact match first, then prefix. */
export function lookupIcd9FromIcd10(icd10Code: string): Icd10To9Entry | null {
  const data = getIcd10To9Data();
  const normalized = icd10Code.trim().toUpperCase();

  // Exact match
  const exact = data.find(e => e.icd10_code.toUpperCase() === normalized);
  if (exact) return exact;

  // Prefix match: strip decimal part (e.g., K35.80 → K35)
  const prefix = normalized.replace(/\..*$/, "");
  const prefixMatch = data.find(e => e.icd10_code.toUpperCase() === prefix);
  if (prefixMatch) return prefixMatch;

  // Try matching entry's code as prefix of the query (e.g., entry "E11" matches "E11.65")
  const partialMatch = data.find(e => normalized.startsWith(e.icd10_code.toUpperCase()));
  return partialMatch ?? null;
}

/** Batch lookup for multiple ICD-10 codes. */
export function batchLookupIcd9(icd10Codes: string[]): Record<string, Icd10To9Entry | null> {
  const result: Record<string, Icd10To9Entry | null> = {};
  for (const code of icd10Codes) {
    result[code] = lookupIcd9FromIcd10(code);
  }
  return result;
}

// ICD prefix → pathway markdown filename mapping
const ICD_TO_PATHWAY_MAP: Record<string, string> = {
  A90: "dengue", A91: "dengue",
  J15: "pneumonia", J18: "pneumonia",
  E10: "diabetes", E11: "diabetes", E13: "diabetes", E14: "diabetes",
  I10: "hypertension", I11: "hypertension", I12: "hypertension", I13: "hypertension",
  I63: "stroke", I64: "stroke", I65: "stroke", I66: "stroke", G45: "stroke",
  I50: "heart-failure", I42: "heart-failure", I25: "heart-failure",
  N18: "ckd", N19: "ckd",
};

export function getPathwayMarkdown(icdPrefix: string): string | null {
  const pathwayName = ICD_TO_PATHWAY_MAP[icdPrefix.toUpperCase()];
  if (!pathwayName) return null;

  if (pathwayMarkdownCache[pathwayName]) return pathwayMarkdownCache[pathwayName];

  try {
    const filePath = resolveDataPath(`moh-guidelines/clinical-pathways/${pathwayName}.md`);
    const content = readFileSync(filePath, "utf-8");
    pathwayMarkdownCache[pathwayName] = content;
    return content;
  } catch {
    return null;
  }
}

export function getDataLoadStatus(): Record<string, { count: number; loaded: true } | { error: string; loaded: false }> {
  const status: Record<string, { count: number; loaded: true } | { error: string; loaded: false }> = {};
  const datasets: Array<{ key: string; getData: () => unknown[] }> = [
    { key: "drugReference", getData: getDrugData },
    { key: "diagnosisDrugMap", getData: getDiagnosisDrugMapData },
    { key: "procedures", getData: getProcedureData },
    { key: "losGuidelines", getData: getLOSData },
    { key: "brandMapping", getData: getBrandMappingData },
    { key: "drugClassMapping", getData: getDrugClassMappingData },
    { key: "diagnosisDiagnosticMap", getData: getDiagnosisDiagnosticMapData },
    { key: "surgeryClass", getData: getSurgeryClassData },
  ];
  for (const { key, getData } of datasets) {
    if (dataLoadErrors[key]) {
      status[key] = { loaded: false, error: dataLoadErrors[key] };
    } else {
      const data = getData();
      status[key] = { loaded: true, count: data.length };
    }
  }
  return status;
}
