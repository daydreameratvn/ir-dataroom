#!/usr/bin/env bun
/**
 * Policy Rules Compiler — Extracts structured rules from insurance PDFs in Google Drive.
 *
 * Creates one rule set per COMPANY (not per insurer). Each company under an insurer
 * has its own policy contracts with different benefit schedules, copay rates, etc.
 * Shared insurer-level T&C files are included in every company's compilation.
 *
 * Usage:
 *   bun run agents/drone/compile-policy-rules.ts                                    # All insurers, all companies
 *   bun run agents/drone/compile-policy-rules.ts --insurer "GIC"                    # All companies under GIC
 *   bun run agents/drone/compile-policy-rules.ts --insurer "GIC" --company "TIKI"   # Specific company
 *   bun run agents/drone/compile-policy-rules.ts --rule-set-id <uuid>               # Re-extract specific set
 *   bun run agents/drone/compile-policy-rules.ts --dry-run                          # No DB writes
 *   bun run agents/drone/compile-policy-rules.ts --force                            # Re-extract even if exists
 *   bun run agents/drone/compile-policy-rules.ts --list-drafts                      # List all draft rule sets
 *   bun run agents/drone/compile-policy-rules.ts --activate <uuid>                  # Activate a rule set
 */

import { GoogleGenAI } from "@google/genai";
import got from "got";
import { parseArgs } from "util";

import { gqlQuery } from "../shared/graphql-client.ts";
import {
  type CompanyFolder,
  type PolicyFile,
  fuzzyMatch,
  listCompanyFolders,
  listFilesInFolder,
  listInsurerFolderNames,
} from "../shared/services/google-drive.ts";

// ============================================================================
// CLI Args
// ============================================================================

const { values: args } = parseArgs({
  options: {
    insurer: { type: "string" },
    company: { type: "string" },
    "rule-set-id": { type: "string" },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "list-drafts": { type: "boolean", default: false },
    activate: { type: "string" },
  },
  strict: true,
});

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
const EXTRACTION_MODEL = "gemini-3-flash-preview";

const VALID_CATEGORIES = new Set([
  "benefit_schedule", "exclusion", "drug_rule", "test_rule", "copay",
  "deductible", "waiting_period", "network", "authorization",
  "special_clause", "general_condition", "amendment_override",
]);

// ============================================================================
// Types
// ============================================================================

interface ExtractedRule {
  category: string;
  benefit_type: string | null;
  rule_key: string;
  rule_value: Record<string, unknown>;
  description: string;
  source_file: string;
  source_page: number | null;
}

interface CompanyFiles {
  insurerName: string;
  companyName: string;
  files: PolicyFile[];
  sharedFiles: PolicyFile[];
}

// ============================================================================
// GraphQL Mutations / Queries
// ============================================================================

const INSERT_RULE_SET = `
  mutation InsertRuleSet($object: InsertPolicyRuleSetsObjectInput!) {
    insertPolicyRuleSets(objects: [$object]) {
      returning { id }
    }
  }
`;

const INSERT_RULE_SOURCE = `
  mutation InsertRuleSource($object: InsertPolicyRuleSourcesObjectInput!) {
    insertPolicyRuleSources(objects: [$object]) {
      returning { id }
    }
  }
`;

const INSERT_RULE = `
  mutation InsertRule($object: InsertPolicyRulesObjectInput!) {
    insertPolicyRules(objects: [$object]) {
      returning { id }
    }
  }
`;

const FIND_EXISTING_RULE_SETS = `
  query FindExistingRuleSets($insurerName: String_1!, $companyName: String_1!) {
    policyRuleSets(
      where: {
        insurerName: { _eq: $insurerName }
        companyName: { _eq: $companyName }
        deletedAt: { _is_null: true }
      }
      order_by: [{ createdAt: Desc }]
    ) {
      id
      insurerName
      companyName
      status
      policyRuleSources {
        driveFileId
        extractedAt
      }
    }
  }
`;

const FIND_RULE_SET_BY_ID = `
  query FindRuleSetById($id: Uuid!) {
    policyRuleSetsById(id: $id) {
      id
      insurerName
      companyName
      status
    }
  }
`;

const LIST_DRAFT_RULE_SETS = `
  query ListDraftRuleSets {
    policyRuleSets(
      where: {
        status: { _in: ["draft", "reviewed"] }
        deletedAt: { _is_null: true }
      }
      order_by: [{ insurerName: Asc }, { companyName: Asc }]
    ) {
      id
      insurerName
      companyName
      policyNumber
      status
      createdAt
      policyRulesAggregate {
        _count
      }
    }
  }
`;

const UPDATE_RULE_SET_STATUS = `
  mutation UpdateRuleSetStatus($id: Uuid!, $status: String_1!, $now: Timestamptz!) {
    updatePolicyRuleSetsById(
      keyId: $id
      updateColumns: {
        status: { set: $status }
        updatedAt: { set: $now }
      }
    ) {
      affectedRows
    }
  }
`;

// ============================================================================
// Step 1: Scan Drive for company files + shared insurer T&C
// ============================================================================

function isSharedTcFolder(companyName: string, insurerName: string): boolean {
  return fuzzyMatch(companyName, insurerName);
}

async function scanCompanyFiles(
  insurerName: string,
  companyFolder: CompanyFolder,
  sharedTcFolders: CompanyFolder[],
): Promise<CompanyFiles> {
  console.log(`  📂 Scanning "${companyFolder.companyName}"...`);

  const allFiles = await listFilesInFolder(companyFolder.folderId);
  const relevantCategories = new Set(["contracts", "terms_and_conditions", "amendments", "other"]);
  const companyPdfs = allFiles.filter(
    f => f.mimeType === "application/pdf" && relevantCategories.has(f.category),
  );

  const sharedPdfs: PolicyFile[] = [];
  for (const sharedFolder of sharedTcFolders) {
    const sharedFiles = await listFilesInFolder(sharedFolder.folderId);
    const pdfs = sharedFiles.filter(
      f => f.mimeType === "application/pdf" && relevantCategories.has(f.category),
    );
    sharedPdfs.push(...pdfs);
  }

  console.log(`  📄 ${companyPdfs.length} company PDFs + ${sharedPdfs.length} shared T&C PDFs`);
  return { insurerName, companyName: companyFolder.companyName, files: companyPdfs, sharedFiles: sharedPdfs };
}

// ============================================================================
// Step 2: Check existing extractions
// ============================================================================

async function getExistingExtraction(insurerName: string, companyName: string): Promise<{
  ruleSetId: string | null;
  extractedFileIds: Set<string>;
  extractedTimes: Map<string, string>;
}> {
  const result = await gqlQuery<{
    policyRuleSets: Array<{
      id: string;
      status: string;
      policyRuleSources: Array<{ driveFileId: string; extractedAt: string }>;
    }>;
  }>(FIND_EXISTING_RULE_SETS, { insurerName, companyName });

  const sets = result?.policyRuleSets ?? [];
  if (sets.length === 0) {
    return { ruleSetId: null, extractedFileIds: new Set(), extractedTimes: new Map() };
  }

  const ruleSet = sets[0]!;
  const extractedFileIds = new Set(ruleSet.policyRuleSources.map(s => s.driveFileId));
  const extractedTimes = new Map(ruleSet.policyRuleSources.map(s => [s.driveFileId, s.extractedAt]));

  return { ruleSetId: ruleSet.id, extractedFileIds, extractedTimes };
}

// ============================================================================
// Step 3: Extract text via Gemini Vision
// ============================================================================

let cachedDriveAuthToken: string | null = null;

async function getDriveAuthToken(): Promise<string> {
  if (cachedDriveAuthToken) return cachedDriveAuthToken;

  const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
  const { GoogleAuth } = await import("google-auth-library");

  const ssmClient = new SSMClient({ region: "ap-southeast-1" });
  const resp = await ssmClient.send(
    new GetParameterCommand({ Name: "/banyan/drive/service-account-key", WithDecryption: true }),
  );
  const credentials = JSON.parse(resp.Parameter?.Value ?? "{}");
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  const authClient = await auth.getClient();
  const token = await authClient.getAccessToken();
  cachedDriveAuthToken = token.token!;
  return cachedDriveAuthToken!;
}

async function extractTextFromPdf(
  file: PolicyFile,
  gemini: GoogleGenAI,
): Promise<{ rawText: string; pageCount: number }> {
  console.log(`    🔍 OCR: ${file.name} (${file.category})...`);

  const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const token = await getDriveAuthToken();

  const pdfBuffer = await got(driveApiUrl, {
    headers: { Authorization: `Bearer ${token}` },
  }).buffer();

  const pdfBase64 = pdfBuffer.toString("base64");
  const sizeMB = pdfBuffer.length / (1024 * 1024);
  console.log(`    📦 Downloaded ${sizeMB.toFixed(1)}MB`);

  const result = await gemini.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Extract ALL text from this scanned Vietnamese insurance document.
Preserve table structures as markdown tables.
Preserve section headers and numbering.
Output the complete text, page by page, with [Page X] markers.
Do not summarize or skip any content — extract EVERYTHING.`,
          },
          {
            inlineData: { data: pdfBase64, mimeType: "application/pdf" },
          },
        ],
      },
    ],
  });

  const rawText = result.text ?? "";
  const pageMarkers = rawText.match(/\[Page \d+\]/g);
  const pageCount = pageMarkers?.length ?? 1;

  console.log(`    ✅ Extracted ${rawText.length} chars, ${pageCount} pages`);
  return { rawText, pageCount };
}

// ============================================================================
// Step 4: Agentic rule extraction via Gemini (multi-turn with reasoning)
// ============================================================================

const RULE_VALUE_SCHEMAS = `
benefit_schedule: { "per_visit_limit": 1200000, "annual_limit": 50000000, "currency": "VND", "sub_limits": [{ "item": "imaging", "limit": 500000 }] }
exclusion: { "type": "condition|drug|procedure|test|general", "items": ["pre-existing < 12 months"], "icd_codes": [], "exceptions": [] }
drug_rule: { "registration_required": true, "registration_formats": ["VN-", "VD-", "VS-"], "generic_substitution": "allowed|required|not_allowed", "formulary": "open|restricted", "excluded_categories": [], "social_insurance_deduction": true }
test_rule: { "negative_test_policy": "excluded|covered|covered_for_chronic", "requires_indication": true, "exceptions": [] }
copay: { "rate": 0.2, "applies_to": "all|drugs|consultation", "network_rate": 0.1, "out_of_network_rate": 0.3 }
deductible: { "amount": 500000, "per": "visit|year", "currency": "VND" }
waiting_period: { "days": 30, "applies_to": "all|dental|maternity|pre_existing" }
network: { "required": true, "out_of_network_coverage": 0.5, "preferred_providers": [] }
authorization: { "required_for": ["inpatient", "surgery", "mri"], "process": "description" }
special_clause: { "type": "maternity|dental_frequency|chronic_management|mental_health", "details": {} }
amendment_override: { "overrides_rule_key": "outpatient.per_visit_limit", "new_value": { "per_visit_limit": 1500000 }, "effective_date": "2025-01-01", "amendment_number": "PL-001" }
general_condition: { "condition": "description of any other policy condition" }`;

const EXTRACTION_SYSTEM_PROMPT = `You are a Vietnamese insurance policy analyst specializing in extracting structured rules from policy documents.

You work in multiple passes to ensure completeness and accuracy:
1. ANALYZE: Read through all documents, identify document types and their relationships
2. EXTRACT: Extract rules document-by-document, category-by-category
3. RECONCILE: Check for conflicts between base T&C and company-specific contracts/amendments
4. VALIDATE: Self-check for completeness — did you cover all benefit types, all exclusion categories?

You use extended thinking to reason through ambiguous clauses, Vietnamese legal terminology, and conditional rules before outputting structured data.

Rule output schema:
{
  "category": one of: "benefit_schedule", "exclusion", "drug_rule", "test_rule", "copay", "deductible", "waiting_period", "network", "authorization", "special_clause", "general_condition", "amendment_override",
  "benefit_type": "OutPatient" | "Inpatient" | "Dental" | "Maternity" | "Surgical" | null (null = applies to all),
  "rule_key": machine-readable dotted key, e.g. "outpatient.per_visit_limit", "exclusion.pre_existing_12mo",
  "rule_value": structured object (schema depends on category),
  "description": the original Vietnamese text describing this rule,
  "source_file": which source document this came from,
  "source_page": page number (if identifiable from [Page X] markers, else null)
}

Category-specific rule_value schemas:
${RULE_VALUE_SCHEMAS}

CRITICAL RULES:
- Numbers must be in raw form (1200000 not "1.2 triệu")
- For amendments: set category="amendment_override" and reference what base rule it overrides via "overrides_rule_key" in rule_value
- If a rule is ambiguous, extract it as "general_condition" with full Vietnamese text
- NEVER skip a rule because it seems redundant — extract everything`;

function parseJsonFromResponse(text: string): ExtractedRule[] | null {
  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {}

  // Try extracting from markdown fences
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]!);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  return null;
}

async function compileRules(
  insurerName: string,
  companyName: string,
  sources: Array<{ fileName: string; category: string; rawText: string; isShared: boolean }>,
  gemini: GoogleGenAI,
): Promise<ExtractedRule[]> {
  console.log(`  🧠 Agentic extraction for "${companyName}" (${insurerName}) from ${sources.length} sources...`);

  const sourceTexts = sources.map(s =>
    `[Source: ${s.fileName} (${s.category}${s.isShared ? ", SHARED INSURER T&C" : ""})]
${s.rawText}`,
  ).join("\n\n---\n\n");

  // Turn 1: Analyze documents and extract initial rules
  const turn1Prompt = `Analyze the following policy documents for company "${companyName}" insured by "${insurerName}".

Documents:
${sourceTexts}

STEP 1 — Document Analysis:
First, identify each document's type and purpose (contract, T&C, amendment, benefit schedule, etc.).
Note which documents are company-specific vs shared insurer T&C.

STEP 2 — Extract ALL rules:
Go through each document section-by-section. For each clause, article, or table row that defines a rule, limit, exclusion, or condition, extract it as a structured rule object.

Pay special attention to:
- Benefit schedule tables (per-visit limits, annual limits, sub-limits per category)
- Exclusion lists (general exclusions, specific conditions, drug exclusions, procedure exclusions)
- Copay/co-insurance rates (may differ by benefit type or network status)
- Drug rules (registration requirements, formulary restrictions, generic substitution policies)
- Diagnostic test rules (negative test policies, indication requirements)
- Waiting periods (different for different benefit types)
- Amendment overrides (what base rules they replace)

Output a JSON array of ALL extracted rules. Include every single rule — do not summarize or skip.`;

  console.log(`    Turn 1: Analyzing documents and extracting rules...`);
  const turn1Result = await gemini.models.generateContent({
    model: EXTRACTION_MODEL,
    config: {
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      thinkingConfig: { thinkingBudget: 8192 },
      responseMimeType: "application/json",
    },
    contents: [{ role: "user", parts: [{ text: turn1Prompt }] }],
  });

  const turn1Text = turn1Result.text ?? "[]";
  const initialRules = parseJsonFromResponse(turn1Text);

  if (!initialRules) {
    console.error(`  ❌ Failed to parse turn 1 response as JSON`);
    console.error(`  Response (first 500 chars): ${turn1Text.slice(0, 500)}`);
    return [];
  }

  console.log(`    Turn 1: ${initialRules.length} rules extracted`);

  // Turn 2: Self-review for completeness and accuracy
  const categoryCounts: Record<string, number> = {};
  for (const r of initialRules) {
    categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;
  }
  const categoryBreakdown = Object.entries(categoryCounts)
    .map(([cat, count]) => `${cat}: ${count}`)
    .join(", ");

  const turn2Prompt = `You extracted ${initialRules.length} rules from the policy documents.
Breakdown by category: ${categoryBreakdown}

Now perform a COMPLETENESS REVIEW:

1. MISSING RULES CHECK — Go back through each source document section-by-section. For every clause or table entry, verify it was captured. List any that were missed.

2. ACCURACY CHECK — For each rule with numeric values (limits, rates, amounts), verify the number matches the source text exactly. Flag any mismatches.

3. AMENDMENT RECONCILIATION — For any amendment_override rules, verify the overrides_rule_key references an actual extracted base rule. If an amendment changes a rule not yet extracted, extract the base rule too.

4. BENEFIT TYPE COVERAGE — Verify you have rules for ALL benefit types mentioned in the documents (OutPatient, Inpatient, Dental, Maternity, Surgical, etc.). If a benefit type appears in the documents but has no rules, extract them.

Output a JSON array containing ONLY the NEW or CORRECTED rules that need to be added. If no fixes are needed, output an empty array [].
Do NOT re-output rules that are already correct.`;

  console.log(`    Turn 2: Self-reviewing for completeness...`);
  const turn2Result = await gemini.models.generateContent({
    model: EXTRACTION_MODEL,
    config: {
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      thinkingConfig: { thinkingBudget: 8192 },
      responseMimeType: "application/json",
    },
    contents: [
      { role: "user", parts: [{ text: turn1Prompt }] },
      { role: "model", parts: [{ text: turn1Text }] },
      { role: "user", parts: [{ text: turn2Prompt }] },
    ],
  });

  const turn2Text = turn2Result.text ?? "[]";
  const additionalRules = parseJsonFromResponse(turn2Text);

  if (additionalRules && additionalRules.length > 0) {
    console.log(`    Turn 2: ${additionalRules.length} additional/corrected rules found`);
    initialRules.push(...additionalRules);
  } else {
    console.log(`    Turn 2: No additional rules needed`);
  }

  // Validate all rules
  const validRules = initialRules.filter((rule, i) => {
    if (!VALID_CATEGORIES.has(rule.category)) {
      console.warn(`  ⚠️ Rule ${i}: invalid category "${rule.category}", skipping`);
      return false;
    }
    if (!rule.rule_key || !rule.rule_value || !rule.description) {
      console.warn(`  ⚠️ Rule ${i}: missing required fields, skipping`);
      return false;
    }
    return true;
  });

  // Deduplicate by rule_key + benefit_type (keep last = corrected version)
  const ruleMap = new Map<string, ExtractedRule>();
  for (const rule of validRules) {
    const key = `${rule.rule_key}::${rule.benefit_type ?? "all"}`;
    ruleMap.set(key, rule);
  }
  const dedupedRules = [...ruleMap.values()];

  console.log(`  ✅ Compiled ${dedupedRules.length} rules (${validRules.length - dedupedRules.length} deduped, ${initialRules.length - validRules.length} invalid/skipped)`);
  return dedupedRules;
}

// ============================================================================
// Step 5: Write to DB
// ============================================================================

async function writeToDb(
  companyFiles: CompanyFiles,
  sources: Array<{ file: PolicyFile; rawText: string; pageCount: number; isShared: boolean }>,
  rules: ExtractedRule[],
): Promise<string> {
  const now = new Date().toISOString();

  const ruleSetResult = await gqlQuery<{
    insertPolicyRuleSets: { returning: Array<{ id: string }> };
  }>(INSERT_RULE_SET, {
    object: {
      tenantId: DEFAULT_TENANT_ID,
      insurerName: companyFiles.insurerName,
      companyName: companyFiles.companyName,
      status: "draft",
      metadata: {
        extractedAt: now,
        companyFileCount: companyFiles.files.length,
        sharedFileCount: companyFiles.sharedFiles.length,
        ruleCount: rules.length,
      },
    },
  });
  const ruleSetId = ruleSetResult!.insertPolicyRuleSets.returning[0]!.id;
  console.log(`  📝 Created rule set: ${ruleSetId}`);

  const sourceIdMap = new Map<string, string>();
  for (const source of sources) {
    const sourceResult = await gqlQuery<{
      insertPolicyRuleSources: { returning: Array<{ id: string }> };
    }>(INSERT_RULE_SOURCE, {
      object: {
        ruleSetId,
        driveFileId: source.file.id,
        fileName: source.file.name,
        fileCategory: source.file.category,
        pageCount: source.pageCount,
        extractedAt: now,
        rawText: source.rawText,
        extractionModel: EXTRACTION_MODEL,
      },
    });
    const sourceId = sourceResult!.insertPolicyRuleSources.returning[0]!.id;
    sourceIdMap.set(source.file.name, sourceId);
  }
  console.log(`  📝 Created ${sources.length} rule sources`);

  let insertedCount = 0;
  for (const rule of rules) {
    const sourceId = sourceIdMap.get(rule.source_file) ?? null;
    const priority = rule.category === "amendment_override" ? 10 : 0;

    await gqlQuery(INSERT_RULE, {
      object: {
        ruleSetId,
        sourceId,
        category: rule.category,
        benefitType: rule.benefit_type,
        ruleKey: rule.rule_key,
        ruleValue: rule.rule_value,
        description: rule.description,
        sourcePage: rule.source_page,
        priority,
      },
    });
    insertedCount++;
  }
  console.log(`  📝 Inserted ${insertedCount} rules`);

  return ruleSetId;
}

// ============================================================================
// Command: List drafts
// ============================================================================

async function listDrafts(): Promise<void> {
  const result = await gqlQuery<{
    policyRuleSets: Array<{
      id: string;
      insurerName: string;
      companyName: string | null;
      policyNumber: string | null;
      status: string;
      createdAt: string;
      policyRulesAggregate: { _count: number };
    }>;
  }>(LIST_DRAFT_RULE_SETS);

  const sets = result?.policyRuleSets ?? [];
  if (sets.length === 0) {
    console.log("No draft or reviewed rule sets found.");
    return;
  }

  console.log("\nDraft/Reviewed Rule Sets:\n");
  console.log("ID                                   | Insurer    | Company                          | Status   | Rules | Created");
  console.log("-".repeat(130));
  for (const s of sets) {
    const ruleCount = s.policyRulesAggregate._count;
    const created = new Date(s.createdAt).toLocaleDateString();
    const company = (s.companyName ?? "(no company)").slice(0, 32).padEnd(32);
    console.log(
      `${s.id} | ${s.insurerName.padEnd(10)} | ${company} | ${s.status.padEnd(8)} | ${String(ruleCount).padStart(5)} | ${created}`,
    );
  }
}

// ============================================================================
// Command: Activate
// ============================================================================

async function activateRuleSet(ruleSetId: string): Promise<void> {
  const now = new Date().toISOString();

  const result = await gqlQuery<{
    policyRuleSetsById: { id: string; insurerName: string; companyName: string | null; status: string } | null;
  }>(FIND_RULE_SET_BY_ID, { id: ruleSetId });

  const ruleSet = result?.policyRuleSetsById;
  if (!ruleSet) {
    console.error(`Rule set ${ruleSetId} not found.`);
    process.exit(1);
  }

  if (ruleSet.status === "active") {
    console.log(`Rule set ${ruleSetId} is already active.`);
    return;
  }

  if (ruleSet.companyName) {
    const existing = await gqlQuery<{
      policyRuleSets: Array<{ id: string; status: string }>;
    }>(FIND_EXISTING_RULE_SETS, { insurerName: ruleSet.insurerName, companyName: ruleSet.companyName });

    for (const existingSet of existing?.policyRuleSets ?? []) {
      if (existingSet.id !== ruleSetId && existingSet.status === "active") {
        await gqlQuery(UPDATE_RULE_SET_STATUS, { id: existingSet.id, status: "archived", now });
        console.log(`Archived previous active rule set: ${existingSet.id}`);
      }
    }
  }

  await gqlQuery(UPDATE_RULE_SET_STATUS, { id: ruleSetId, status: "active", now });
  console.log(`✅ Activated rule set ${ruleSetId} for "${ruleSet.insurerName}" / "${ruleSet.companyName}"`);
}

// ============================================================================
// Main: Process one company under an insurer
// ============================================================================

async function processCompany(
  insurerName: string,
  companyFolder: CompanyFolder,
  sharedTcFolders: CompanyFolder[],
  gemini: GoogleGenAI,
  options: { dryRun: boolean; force: boolean },
): Promise<{ ruleSetId: string | null; ruleCount: number }> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Company: ${companyFolder.companyName} (${insurerName})`);
  console.log("─".repeat(60));

  let companyFiles: CompanyFiles;
  try {
    companyFiles = await scanCompanyFiles(insurerName, companyFolder, sharedTcFolders);
  } catch (err) {
    console.error(`  ❌ Failed to scan Drive: ${err}`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  const totalPdfs = companyFiles.files.length + companyFiles.sharedFiles.length;
  if (totalPdfs === 0) {
    console.log(`  ⏭️ No PDF files found, skipping`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  if (!options.force) {
    const existing = await getExistingExtraction(insurerName, companyFolder.companyName);
    if (existing.ruleSetId) {
      const allFiles = [...companyFiles.files, ...companyFiles.sharedFiles];
      const newFiles = allFiles.filter(f => {
        if (!existing.extractedFileIds.has(f.id)) return true;
        const extractedAt = existing.extractedTimes.get(f.id);
        if (extractedAt && f.modifiedTime) {
          return new Date(f.modifiedTime) > new Date(extractedAt);
        }
        return false;
      });

      if (newFiles.length === 0) {
        console.log(`  ⏭️ Already extracted (rule set: ${existing.ruleSetId}), use --force to re-extract`);
        return { ruleSetId: existing.ruleSetId, ruleCount: 0 };
      }
      console.log(`  🔄 ${newFiles.length} new/modified files to process`);
    }
  }

  // Extract text from each PDF
  const extractedSources: Array<{ file: PolicyFile; rawText: string; pageCount: number; isShared: boolean }> = [];

  for (const file of companyFiles.files) {
    try {
      const { rawText, pageCount } = await extractTextFromPdf(file, gemini);
      if (rawText.trim().length > 0) {
        extractedSources.push({ file, rawText, pageCount, isShared: false });
      } else {
        console.warn(`    ⚠️ No text extracted from ${file.name}, skipping`);
      }
    } catch (err) {
      console.error(`    ❌ Failed to extract ${file.name}: ${err}`);
    }
  }

  for (const file of companyFiles.sharedFiles) {
    try {
      const { rawText, pageCount } = await extractTextFromPdf(file, gemini);
      if (rawText.trim().length > 0) {
        extractedSources.push({ file, rawText, pageCount, isShared: true });
      } else {
        console.warn(`    ⚠️ No text extracted from ${file.name}, skipping`);
      }
    } catch (err) {
      console.error(`    ❌ Failed to extract ${file.name}: ${err}`);
    }
  }

  if (extractedSources.length === 0) {
    console.log(`  ⏭️ No text could be extracted from any files`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  // Compile rules
  const rules = await compileRules(
    insurerName,
    companyFolder.companyName,
    extractedSources.map(s => ({
      fileName: s.file.name,
      category: s.file.category,
      rawText: s.rawText,
      isShared: s.isShared,
    })),
    gemini,
  );

  if (rules.length === 0) {
    console.log(`  ⚠️ No rules extracted — possible OCR or parsing failure`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  // Write to DB
  if (options.dryRun) {
    console.log(`\n  🔍 DRY RUN — would write:`);
    console.log(`    • 1 rule set for "${companyFolder.companyName}" (${insurerName})`);
    console.log(`    • ${extractedSources.length} rule sources`);
    console.log(`    • ${rules.length} rules`);
    const catCounts: Record<string, number> = {};
    for (const r of rules) {
      catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;
    }
    for (const [cat, count] of Object.entries(catCounts).sort()) {
      console.log(`    • ${cat}: ${count}`);
    }
    return { ruleSetId: null, ruleCount: rules.length };
  }

  const ruleSetId = await writeToDb(companyFiles, extractedSources, rules);

  console.log(`\n  ✅ Done: ${rules.length} rules → rule set ${ruleSetId} (status: draft)`);
  return { ruleSetId, ruleCount: rules.length };
}

// ============================================================================
// Main: Process all companies under an insurer
// ============================================================================

async function processInsurer(
  insurerName: string,
  gemini: GoogleGenAI,
  options: { dryRun: boolean; force: boolean; companyFilter?: string },
): Promise<Array<{ company: string; ruleSetId: string | null; ruleCount: number }>> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Insurer: ${insurerName}`);
  console.log("=".repeat(60));

  const companyFolders = await listCompanyFolders(insurerName);
  console.log(`Found ${companyFolders.length} company folders`);

  // Separate shared T&C folders (match insurer name) from actual company folders
  const sharedTcFolders = companyFolders.filter(f => isSharedTcFolder(f.companyName, insurerName));
  const actualCompanies = companyFolders.filter(f => !isSharedTcFolder(f.companyName, insurerName));

  if (sharedTcFolders.length > 0) {
    console.log(`Shared T&C folders: ${sharedTcFolders.map(f => f.companyName).join(", ")}`);
  }
  console.log(`Companies to process: ${actualCompanies.length}`);

  let targetCompanies = actualCompanies;
  if (options.companyFilter) {
    targetCompanies = actualCompanies.filter(f =>
      fuzzyMatch(f.companyName, options.companyFilter!),
    );
    if (targetCompanies.length === 0) {
      console.error(`Company "${options.companyFilter}" not found. Available:`);
      for (const c of actualCompanies) {
        console.log(`  • ${c.companyName}`);
      }
      return [];
    }
    console.log(`Filtered to: ${targetCompanies.map(f => f.companyName).join(", ")}`);
  }

  const results: Array<{ company: string; ruleSetId: string | null; ruleCount: number }> = [];
  for (const company of targetCompanies) {
    const result = await processCompany(insurerName, company, sharedTcFolders, gemini, options);
    results.push({ company: company.companyName, ...result });
  }

  return results;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (args["list-drafts"]) {
    await listDrafts();
    return;
  }

  if (args.activate) {
    await activateRuleSet(args.activate);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is required");
    process.exit(1);
  }
  const gemini = new GoogleGenAI({ apiKey });

  const options = {
    dryRun: args["dry-run"] ?? false,
    force: args.force ?? false,
    companyFilter: args.company,
  };

  if (options.dryRun) {
    console.log("🔍 DRY RUN MODE — no database writes will be made\n");
  }

  let insurerNames: string[];

  if (args["rule-set-id"]) {
    const result = await gqlQuery<{
      policyRuleSetsById: { id: string; insurerName: string; companyName: string | null } | null;
    }>(FIND_RULE_SET_BY_ID, { id: args["rule-set-id"] });

    if (!result?.policyRuleSetsById) {
      console.error(`Rule set ${args["rule-set-id"]} not found`);
      process.exit(1);
    }
    insurerNames = [result.policyRuleSetsById.insurerName];
    if (result.policyRuleSetsById.companyName) {
      options.companyFilter = result.policyRuleSetsById.companyName;
    }
    options.force = true;
  } else if (args.insurer) {
    insurerNames = [args.insurer];
  } else {
    console.log("Scanning Drive for insurer folders...");
    insurerNames = await listInsurerFolderNames();
    console.log(`Found ${insurerNames.length} insurer folders: ${insurerNames.join(", ")}\n`);
  }

  const allResults: Array<{ insurer: string; company: string; ruleSetId: string | null; ruleCount: number }> = [];

  for (const insurerName of insurerNames) {
    const results = await processInsurer(insurerName, gemini, options);
    for (const r of results) {
      allResults.push({ insurer: insurerName, ...r });
    }
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const totalRules = allResults.reduce((sum, r) => sum + r.ruleCount, 0);
  const processed = allResults.filter(r => r.ruleCount > 0).length;
  const skipped = allResults.filter(r => r.ruleCount === 0).length;

  console.log(`Companies processed: ${processed}`);
  console.log(`Companies skipped:   ${skipped}`);
  console.log(`Total rules:         ${totalRules}`);

  if (!options.dryRun && processed > 0) {
    console.log(`\nNext steps:`);
    console.log(`1. Review drafts: bun run agents/drone/compile-policy-rules.ts --list-drafts`);
    console.log(`2. Activate:      bun run agents/drone/compile-policy-rules.ts --activate <rule-set-id>`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
