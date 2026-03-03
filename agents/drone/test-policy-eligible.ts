/**
 * Test script: Policy-doc mode eligibility and agent runs.
 *
 * Phase 1 — Eligibility (no LLM): verify Drive folders + claim matching
 * Phase 2 — Run agent for each eligible claim (LLM)
 * Phase 3 — Summary
 *
 * Set SKIP_DRONE=1 to run Phase 1 only (fast, no LLM cost).
 * Set CONCURRENCY=N for parallel agent runs (default: 1 sequential).
 *
 * Usage:
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 \
 *   HASURA_GRAPHQL_ENDPOINT=https://prod.apple.papaya.services/v1/graphql \
 *   HASURA_ADMIN_SECRET=<secret> \
 *   GOOGLE_VERTEX_PROJECT=banyan-489002 GOOGLE_VERTEX_LOCATION=asia-southeast1 \
 *   bun run agents/drone/test-policy-eligible.ts
 */
import { listInsurerFolderNames, fuzzyMatch } from "../shared/services/google-drive.ts";
import { fetchPolicyDocEligibleClaims } from "./eligibility.ts";
import { createDroneAgent } from "./agent.ts";

const SKIP_DRONE = process.env.SKIP_DRONE === "1";
const CONCURRENCY = Number(process.env.CONCURRENCY) || 1;

// ============================================================================
// Phase 1 — Eligibility (no LLM)
// ============================================================================

console.log("=".repeat(70));
console.log("PHASE 1 — Eligibility Check (no LLM)");
console.log("=".repeat(70));

console.log("\n[Phase 1a] Fetching insurer folder names from Google Drive...");
const folders = await listInsurerFolderNames();
console.log(`  Found ${folders.length} insurer folders:`);
for (const f of folders) {
  console.log(`    - ${f}`);
}
if (folders.length === 0) {
  console.error("FAIL: No insurer folders found in Drive.");
  process.exit(1);
}
console.log("  PASS\n");

console.log("[Phase 1b] Fetching policy-doc eligible claims (batch=5)...");
const eligible = await fetchPolicyDocEligibleClaims(5);
console.log(`  Found ${eligible.length} eligible claims:`);
for (const c of eligible) {
  console.log(`    - ${c.code} (insurer=${c.insurerName}, policy=${c.policyNumber ?? "N/A"})`);
}
if (eligible.length === 0) {
  console.warn("WARN: No eligible claims found.");
  process.exit(0);
}
console.log("  PASS\n");

console.log("[Phase 1c] Verifying insurer → Drive folder match...");
for (const c of eligible) {
  const matched = folders.find(f => fuzzyMatch(f, c.insurerName!));
  console.log(`    ${c.code}: "${c.insurerName}" → ${matched ? `"${matched}"` : "NO MATCH"}`);
}
console.log("  PASS\n");

if (SKIP_DRONE) {
  console.log("Skipping Phase 2 (SKIP_DRONE=1).");
  process.exit(0);
}

// ============================================================================
// Phase 2 — Agent Runs
// ============================================================================

console.log("=".repeat(70));
console.log(`PHASE 2 — Agent Runs (${eligible.length} claims, concurrency=${CONCURRENCY})`);
console.log("=".repeat(70));

interface Result {
  code: string;
  tools: string[];
  hasPolicyDocSearch: boolean;
  hasAssessBenefit: boolean;
  hasCreateSignOff: boolean;
  durationMs: number;
  error?: string;
}

const results: Result[] = [];
const globalStart = Date.now();

async function processOne(claim: typeof eligible[0]): Promise<Result> {
  const tools: string[] = [];
  const start = Date.now();

  try {
    console.log(`\n  [${claim.code}] Creating agent (policy-doc mode)...`);
    const agent = await createDroneAgent(claim.code, { skipCompliance: true, mode: "policy-doc" });

    agent.subscribe((e) => {
      if (e.type === "tool_execution_start") {
        tools.push(e.toolName);
        console.log(`  [${claim.code}] tool: ${e.toolName}`);
      }
      if (e.type === "tool_execution_end" && e.isError) {
        try {
          const res = e.result as any;
          const text = res?.content?.find?.((c: any) => c.type === "text")?.text ?? "";
          console.log(`  [${claim.code}]   ERROR: ${text.slice(0, 200)}`);
        } catch { /* ignore */ }
      }
    });

    await agent.prompt(claim.code);
    const dur = Date.now() - start;
    console.log(`  [${claim.code}] Done in ${Math.round(dur / 1000)}s — tools: ${tools.join(", ")}`);

    return {
      code: claim.code,
      tools,
      hasPolicyDocSearch: tools.includes("policyDocSearch"),
      hasAssessBenefit: tools.includes("assessBenefit"),
      hasCreateSignOff: tools.includes("createSignOff"),
      durationMs: dur,
    };
  } catch (error) {
    const dur = Date.now() - start;
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`  [${claim.code}] Fatal: ${msg}`);
    return {
      code: claim.code,
      tools,
      hasPolicyDocSearch: tools.includes("policyDocSearch"),
      hasAssessBenefit: tools.includes("assessBenefit"),
      hasCreateSignOff: tools.includes("createSignOff"),
      durationMs: dur,
      error: msg,
    };
  }
}

// Process with concurrency
const queue = [...eligible];
let queueIdx = 0;

async function worker() {
  while (true) {
    const idx = queueIdx++;
    if (idx >= queue.length) break;
    const result = await processOne(queue[idx]!);
    results.push(result);
  }
}

const workers = Array.from({ length: Math.min(CONCURRENCY, eligible.length) }, () => worker());
await Promise.all(workers);

// ============================================================================
// Phase 3 — Summary
// ============================================================================

const totalElapsed = Math.round((Date.now() - globalStart) / 1000);

console.log("\n" + "=".repeat(70));
console.log("PHASE 3 — Summary");
console.log("=".repeat(70));

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\n${pad("Claim", 18)} ${pad("Dur", 6)} ${pad("DocSearch", 10)} ${pad("Assess", 8)} ${pad("SignOff", 8)} Tools`);
console.log("-".repeat(90));
for (const r of results) {
  const dur = `${Math.round(r.durationMs / 1000)}s`;
  const ds = r.hasPolicyDocSearch ? "YES" : "NO";
  const ab = r.hasAssessBenefit ? "YES" : "NO";
  const cs = r.hasCreateSignOff ? "YES" : "NO";
  const err = r.error ? ` [ERROR: ${r.error.slice(0, 50)}]` : "";
  console.log(`${pad(r.code, 18)} ${pad(dur, 6)} ${pad(ds, 10)} ${pad(ab, 8)} ${pad(cs, 8)} ${r.tools.length} calls${err}`);
}

const policyDocSearchCount = results.filter(r => r.hasPolicyDocSearch).length;
const assessCount = results.filter(r => r.hasAssessBenefit).length;
const signOffCount = results.filter(r => r.hasCreateSignOff).length;
const errorCount = results.filter(r => r.error).length;

console.log(`\nWall time: ${totalElapsed}s | Claims: ${results.length}`);
console.log(`policyDocSearch: ${policyDocSearchCount}/${results.length} | assessBenefit: ${assessCount}/${results.length} | createSignOff: ${signOffCount}/${results.length} | errors: ${errorCount}`);
