#!/usr/bin/env bun
/**
 * Policy Rules Compiler — Extracts structured rules from insurance PDFs in Google Drive.
 *
 * Usage:
 *   bun run agents/drone/compile-policy-rules.ts                          # All insurers
 *   bun run agents/drone/compile-policy-rules.ts --insurer "Bảo Việt"     # Specific insurer
 *   bun run agents/drone/compile-policy-rules.ts --rule-set-id <uuid>     # Re-extract specific set
 *   bun run agents/drone/compile-policy-rules.ts --dry-run                # No DB writes
 *   bun run agents/drone/compile-policy-rules.ts --force                  # Re-extract even if exists
 *   bun run agents/drone/compile-policy-rules.ts --list-drafts            # List all draft rule sets
 *   bun run agents/drone/compile-policy-rules.ts --activate <uuid>        # Activate a rule set
 */

import { GoogleGenAI } from "@google/genai";
import got from "got";
import { parseArgs } from "util";

import { gqlQuery } from "../shared/graphql-client.ts";
import {
  type PolicyFile,
  listInsurerFolderNames,
  listPolicyDocuments,
} from "../shared/services/google-drive.ts";

// ============================================================================
// CLI Args
// ============================================================================

const { values: args } = parseArgs({
  options: {
    insurer: { type: "string" },
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
const EXTRACTION_MODEL = "gemini-2.5-flash";

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

interface InsurerFiles {
  insurerName: string;
  files: PolicyFile[];
}

// ============================================================================
// GraphQL Mutations / Queries (via fetch-based client)
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
  query FindExistingRuleSets($insurerName: String_1!) {
    policyRuleSets(
      where: {
        insurerName: { _eq: $insurerName }
        deletedAt: { _is_null: true }
      }
    ) {
      id
      insurerName
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
      order_by: [{ createdAt: Desc }]
    ) {
      id
      insurerName
      productName
      policyNumber
      status
      createdAt
      policyRulesAggregate {
        _count
      }
    }
  }
`;

const SOFT_DELETE_RULES = `
  mutation SoftDeleteRules($ruleSetId: Uuid!, $now: Timestamptz!) {
    updatePolicyRules(
      where: {
        ruleSetId: { _eq: $ruleSetId }
        deletedAt: { _is_null: true }
      }
      _set: { deletedAt: $now }
    ) {
      affectedRows
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
// Step 1: Scan Drive for insurer files
// ============================================================================

async function scanDriveForInsurer(insurerName: string): Promise<InsurerFiles> {
  console.log(`  📂 Scanning Drive for "${insurerName}"...`);
  const result = await listPolicyDocuments({ insurerName });

  // Filter to PDF files in relevant categories
  const relevantCategories = new Set(["contracts", "terms_and_conditions", "amendments", "other"]);
  const pdfFiles = result.files.filter(
    f => f.mimeType === "application/pdf" && relevantCategories.has(f.category),
  );

  console.log(`  📄 Found ${pdfFiles.length} relevant PDFs (of ${result.files.length} total files)`);
  return { insurerName: result.insurerName, files: pdfFiles };
}

// ============================================================================
// Step 2: Check existing extractions
// ============================================================================

async function getExistingExtraction(insurerName: string): Promise<{
  ruleSetId: string | null;
  extractedFileIds: Set<string>;
  extractedTimes: Map<string, string>;
}> {
  const result = await gqlQuery<{
    policyRuleSets: Array<{
      id: string;
      insurerName: string;
      status: string;
      policyRuleSources: Array<{ driveFileId: string; extractedAt: string }>;
    }>;
  }>(FIND_EXISTING_RULE_SETS, { insurerName });

  const sets = result?.policyRuleSets ?? [];
  if (sets.length === 0) {
    return { ruleSetId: null, extractedFileIds: new Set(), extractedTimes: new Map() };
  }

  // Use the most recent rule set
  const ruleSet = sets[0]!;
  const extractedFileIds = new Set(ruleSet.policyRuleSources.map(s => s.driveFileId));
  const extractedTimes = new Map(ruleSet.policyRuleSources.map(s => [s.driveFileId, s.extractedAt]));

  return { ruleSetId: ruleSet.id, extractedFileIds, extractedTimes };
}

// ============================================================================
// Step 3: Extract text via Gemini Vision
// ============================================================================

// Cached Drive auth client (initialized once, reused across all PDF downloads)
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
  return cachedDriveAuthToken;
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

  // Use Gemini to OCR the scanned PDF
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
  // Count pages from [Page X] markers
  const pageMarkers = rawText.match(/\[Page \d+\]/g);
  const pageCount = pageMarkers?.length ?? 1;

  console.log(`    ✅ Extracted ${rawText.length} chars, ${pageCount} pages`);
  return { rawText, pageCount };
}

// ============================================================================
// Step 4: Compile rules via Gemini
// ============================================================================

async function compileRules(
  insurerName: string,
  sources: Array<{ fileName: string; category: string; rawText: string }>,
  gemini: GoogleGenAI,
): Promise<ExtractedRule[]> {
  console.log(`  🧠 Compiling rules for "${insurerName}" from ${sources.length} sources...`);

  // Build the source documents section
  const sourceTexts = sources.map(s =>
    `[Source: ${s.fileName} (${s.category})]\n${s.rawText}`,
  ).join("\n\n---\n\n");

  const prompt = `You are a Vietnamese insurance policy analyst. Extract ALL rules from the following policy documents into structured JSON.

Documents provided:
${sourceTexts}

Extract EVERY rule, clause, limit, and condition. Do not summarize or skip anything.

Output a JSON array where each element is:
{
  "category": one of: "benefit_schedule", "exclusion", "drug_rule", "test_rule", "copay", "deductible", "waiting_period", "network", "authorization", "special_clause", "general_condition", "amendment_override",
  "benefit_type": "OutPatient" | "Inpatient" | "Dental" | "Maternity" | "Surgical" | null (null = applies to all),
  "rule_key": machine-readable dotted key, e.g. "outpatient.per_visit_limit", "exclusion.pre_existing_12mo",
  "rule_value": structured object (schema depends on category — see examples below),
  "description": the original Vietnamese text describing this rule,
  "source_file": which source document this came from,
  "source_page": page number (if identifiable from [Page X] markers, else null)
}

IMPORTANT:
- Extract ALL benefit limits (per visit, annual, sub-limits for drugs/imaging/lab)
- Extract ALL exclusions (general + specific conditions + drugs + procedures)
- Extract ALL copay rates (by benefit type, by network status)
- Extract ALL drug rules (registration, formulary, generic substitution)
- Extract ALL waiting periods
- For amendments: set category="amendment_override" and reference what base rule it overrides via "overrides_rule_key" in rule_value
- If a rule is ambiguous, extract it as "general_condition" with full Vietnamese text
- Numbers must be in raw form (1200000 not "1.2 triệu")

Category-specific rule_value schemas:

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
general_condition: { "condition": "description of any other policy condition" }

Output ONLY the JSON array, no markdown fences, no explanatory text.`;

  const result = await gemini.models.generateContent({
    model: EXTRACTION_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    },
  });

  const responseText = result.text ?? "[]";

  // Parse and validate
  let rules: ExtractedRule[];
  try {
    rules = JSON.parse(responseText);
  } catch {
    // Try to extract JSON from markdown fences
    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      rules = JSON.parse(match[1]!);
    } else {
      console.error(`  ❌ Failed to parse Gemini response as JSON`);
      console.error(`  Response (first 500 chars): ${responseText.slice(0, 500)}`);
      return [];
    }
  }

  if (!Array.isArray(rules)) {
    console.error(`  ❌ Gemini response is not an array`);
    return [];
  }

  // Validate each rule
  const validRules = rules.filter((rule, i) => {
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

  console.log(`  ✅ Compiled ${validRules.length} rules (${rules.length - validRules.length} invalid/skipped)`);
  return validRules;
}

// ============================================================================
// Step 5: Write to DB
// ============================================================================

async function writeToDb(
  insurerName: string,
  files: PolicyFile[],
  sources: Array<{ file: PolicyFile; rawText: string; pageCount: number }>,
  rules: ExtractedRule[],
): Promise<string> {
  const now = new Date().toISOString();

  // 1. Create rule set
  const ruleSetResult = await gqlQuery<{
    insertPolicyRuleSets: { returning: Array<{ id: string }> };
  }>(INSERT_RULE_SET, {
    object: {
      tenantId: DEFAULT_TENANT_ID,
      insurerName,
      status: "draft",
      metadata: { extractedAt: now, fileCount: files.length, ruleCount: rules.length },
    },
  });
  const ruleSetId = ruleSetResult!.insertPolicyRuleSets.returning[0]!.id;
  console.log(`  📝 Created rule set: ${ruleSetId}`);

  // 2. Create rule sources
  const sourceIdMap = new Map<string, string>(); // fileName → sourceId
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

  // 3. Insert rules
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
      productName: string | null;
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
  console.log("ID                                   | Insurer         | Status   | Rules | Created");
  console.log("-".repeat(95));
  for (const s of sets) {
    const ruleCount = s.policyRulesAggregate._count;
    const created = new Date(s.createdAt).toLocaleDateString();
    console.log(
      `${s.id} | ${s.insurerName.padEnd(15)} | ${s.status.padEnd(8)} | ${String(ruleCount).padStart(5)} | ${created}`,
    );
  }
}

// ============================================================================
// Command: Activate
// ============================================================================

async function activateRuleSet(ruleSetId: string): Promise<void> {
  const now = new Date().toISOString();

  // Verify rule set exists
  const result = await gqlQuery<{
    policyRuleSetsById: { id: string; insurerName: string; status: string } | null;
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

  // Archive any currently active rule sets for this insurer
  const existing = await gqlQuery<{
    policyRuleSets: Array<{ id: string; status: string }>;
  }>(FIND_EXISTING_RULE_SETS, { insurerName: ruleSet.insurerName });

  for (const existingSet of existing?.policyRuleSets ?? []) {
    if (existingSet.id !== ruleSetId && existingSet.status === "active") {
      await gqlQuery(UPDATE_RULE_SET_STATUS, { id: existingSet.id, status: "archived", now });
      console.log(`Archived previous active rule set: ${existingSet.id}`);
    }
  }

  // Activate
  await gqlQuery(UPDATE_RULE_SET_STATUS, { id: ruleSetId, status: "active", now });
  console.log(`✅ Activated rule set ${ruleSetId} for "${ruleSet.insurerName}"`);
}

// ============================================================================
// Main: Process one insurer
// ============================================================================

async function processInsurer(
  insurerName: string,
  gemini: GoogleGenAI,
  options: { dryRun: boolean; force: boolean },
): Promise<{ ruleSetId: string | null; ruleCount: number }> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Processing: ${insurerName}`);
  console.log("=".repeat(60));

  // Step 1: Scan Drive
  let insurerFiles: InsurerFiles;
  try {
    insurerFiles = await scanDriveForInsurer(insurerName);
  } catch (err) {
    console.error(`  ❌ Failed to scan Drive for "${insurerName}": ${err}`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  if (insurerFiles.files.length === 0) {
    console.log(`  ⏭️ No relevant PDF files found, skipping`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  // Step 2: Check existing
  if (!options.force) {
    const existing = await getExistingExtraction(insurerFiles.insurerName);
    if (existing.ruleSetId) {
      const newFiles = insurerFiles.files.filter(f => {
        if (!existing.extractedFileIds.has(f.id)) return true;
        // Check if file was modified after extraction
        const extractedAt = existing.extractedTimes.get(f.id);
        if (extractedAt && f.modifiedTime) {
          return new Date(f.modifiedTime) > new Date(extractedAt);
        }
        return false;
      });

      if (newFiles.length === 0) {
        console.log(`  ⏭️ All files already extracted (rule set: ${existing.ruleSetId}), use --force to re-extract`);
        return { ruleSetId: existing.ruleSetId, ruleCount: 0 };
      }
      console.log(`  🔄 ${newFiles.length} new/modified files to process`);
      insurerFiles.files = newFiles;
    }
  }

  // Step 3: Extract text from each PDF
  const extractedSources: Array<{ file: PolicyFile; rawText: string; pageCount: number }> = [];
  for (const file of insurerFiles.files) {
    try {
      const { rawText, pageCount } = await extractTextFromPdf(file, gemini);
      if (rawText.trim().length > 0) {
        extractedSources.push({ file, rawText, pageCount });
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

  // Step 4: Compile rules
  const rules = await compileRules(
    insurerFiles.insurerName,
    extractedSources.map(s => ({
      fileName: s.file.name,
      category: s.file.category,
      rawText: s.rawText,
    })),
    gemini,
  );

  if (rules.length === 0) {
    console.log(`  ⚠️ No rules extracted — possible OCR or parsing failure`);
    return { ruleSetId: null, ruleCount: 0 };
  }

  // Step 5: Write to DB
  if (options.dryRun) {
    console.log(`\n  🔍 DRY RUN — would write:`);
    console.log(`    • 1 rule set for "${insurerFiles.insurerName}"`);
    console.log(`    • ${extractedSources.length} rule sources`);
    console.log(`    • ${rules.length} rules`);
    console.log(`\n  Rule breakdown by category:`);
    const catCounts: Record<string, number> = {};
    for (const r of rules) {
      catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;
    }
    for (const [cat, count] of Object.entries(catCounts).sort()) {
      console.log(`    • ${cat}: ${count}`);
    }
    return { ruleSetId: null, ruleCount: rules.length };
  }

  const ruleSetId = await writeToDb(
    insurerFiles.insurerName,
    insurerFiles.files,
    extractedSources,
    rules,
  );

  console.log(`\n  ✅ Done: ${rules.length} rules extracted → rule set ${ruleSetId} (status: draft)`);
  return { ruleSetId, ruleCount: rules.length };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Handle list-drafts command
  if (args["list-drafts"]) {
    await listDrafts();
    return;
  }

  // Handle activate command
  if (args.activate) {
    await activateRuleSet(args.activate);
    return;
  }

  // Initialize Gemini
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY environment variable is required");
    process.exit(1);
  }
  const gemini = new GoogleGenAI({ apiKey });

  const options = {
    dryRun: args["dry-run"] ?? false,
    force: args.force ?? false,
  };

  if (options.dryRun) {
    console.log("🔍 DRY RUN MODE — no database writes will be made\n");
  }

  // Determine which insurers to process
  let insurerNames: string[];

  if (args["rule-set-id"]) {
    // Re-extract a specific rule set
    const result = await gqlQuery<{
      policyRuleSetsById: { id: string; insurerName: string } | null;
    }>(FIND_RULE_SET_BY_ID, { id: args["rule-set-id"] });

    if (!result?.policyRuleSetsById) {
      console.error(`Rule set ${args["rule-set-id"]} not found`);
      process.exit(1);
    }
    insurerNames = [result.policyRuleSetsById.insurerName];
    options.force = true; // Force re-extraction
  } else if (args.insurer) {
    insurerNames = [args.insurer];
  } else {
    // All insurers from Drive
    console.log("Scanning Drive for insurer folders...");
    insurerNames = await listInsurerFolderNames();
    console.log(`Found ${insurerNames.length} insurer folders: ${insurerNames.join(", ")}\n`);
  }

  // Process each insurer
  const results: Array<{ insurer: string; ruleSetId: string | null; ruleCount: number }> = [];

  for (const insurerName of insurerNames) {
    const result = await processInsurer(insurerName, gemini, options);
    results.push({ insurer: insurerName, ...result });
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const totalRules = results.reduce((sum, r) => sum + r.ruleCount, 0);
  const processed = results.filter(r => r.ruleCount > 0).length;
  const skipped = results.filter(r => r.ruleCount === 0).length;

  console.log(`Insurers processed: ${processed}`);
  console.log(`Insurers skipped:   ${skipped}`);
  console.log(`Total rules:        ${totalRules}`);

  if (!options.dryRun && processed > 0) {
    console.log(`\nNext steps:`);
    console.log(`1. Review draft rule sets: bun run agents/drone/compile-policy-rules.ts --list-drafts`);
    console.log(`2. Activate after review:  bun run agents/drone/compile-policy-rules.ts --activate <rule-set-id>`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
