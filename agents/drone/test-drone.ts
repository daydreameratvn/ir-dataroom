/**
 * Test script: Fetch eligible claims and run the Drone agent.
 * Supports concurrent processing with configurable worker count.
 *
 * Usage:
 *   HASURA_GRAPHQL_ENDPOINT=... HASURA_ADMIN_SECRET=... \
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 \
 *   GOOGLE_VERTEX_PROJECT=banyan-489002 GOOGLE_VERTEX_LOCATION=asia-southeast1 \
 *   TIER=2 \
 *   bun run agents/drone/test-drone.ts
 */
import type { DroneTier } from "./eligibility.ts";

import { bedrockOpus } from "../shared/model.ts";
import { fetchDroneEligibleClaims } from "./eligibility.ts";
import { processDroneClaim } from "./runner.ts";

// ─── Config ──────────────────────────────────────────────────────────
const TIER = (Number(process.env.TIER) || 1) as DroneTier;
const TARGET = 200; // over-fetch — many will be skipped (already assessed / missing docs)
const CONCURRENCY = 5;
// ─────────────────────────────────────────────────────────────────────

console.log(`[Test] Bedrock Opus model: ${bedrockOpus ? `${bedrockOpus.id} (api=${bedrockOpus.api})` : "NOT FOUND — this will fail!"}`);
console.log(`[Test] Tier: ${TIER}, Target: ${TARGET} claims, Concurrency: ${CONCURRENCY} workers\n`);

console.log(`[Test] Fetching eligible Tier ${TIER} claims...`);
const eligible = await fetchDroneEligibleClaims(TARGET, TIER);
console.log(`[Test] Found ${eligible.length} eligible claims\n`);

if (eligible.length === 0) {
  console.log("[Test] No eligible claims found. Exiting.");
  process.exit(0);
}

// ─── Shared state ────────────────────────────────────────────────────
type Result = { code: string; status: string; message?: string; durationMs: number };
const results: Result[] = [];
let completed = 0;
const globalStart = Date.now();

function printProgress(r: Result) {
  completed++;
  const elapsed = Math.round((Date.now() - globalStart) / 1000);
  const pct = Math.round((completed / eligible.length) * 100);
  const dur = `${Math.round(r.durationMs / 1000)}s`;
  const msg = r.message ? ` — ${r.message}` : "";
  console.log(`[${completed}/${eligible.length} ${pct}% @${elapsed}s] ${r.code} → ${r.status} (${dur})${msg}`);
}

// ─── Worker pool ─────────────────────────────────────────────────────
// Claims go into a queue; N workers pull from it concurrently.
const queue = [...eligible];
let queueIdx = 0;

async function worker(workerId: number) {
  while (true) {
    const idx = queueIdx++;
    if (idx >= queue.length) break;
    const claim = queue[idx]!;

    const start = Date.now();
    let result: Result;
    try {
      const r = await processDroneClaim(claim.id, claim.code, { tier: TIER });
      result = { code: claim.code, status: r.status, message: r.message, durationMs: Date.now() - start };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      result = { code: claim.code, status: "fatal", message: msg, durationMs: Date.now() - start };
    }
    results.push(result);
    printProgress(result);
  }
}

// Launch workers
console.log(`[Test] Starting ${CONCURRENCY} workers...\n`);
const workers = Array.from({ length: Math.min(CONCURRENCY, eligible.length) }, (_, i) => worker(i));
await Promise.all(workers);

// ─── Summary ─────────────────────────────────────────────────────────
const totalElapsed = Math.round((Date.now() - globalStart) / 1000);

// Sort results by claim code for readability
results.sort((a, b) => a.code.localeCompare(b.code));

console.log(`\n${"=".repeat(90)}`);
console.log(`[Test] SUMMARY — Tier ${TIER}, ${totalElapsed}s total, ${CONCURRENCY} concurrent workers`);
console.log("=".repeat(90));
console.log(`Total: ${results.length} claims processed\n`);

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`${pad("Claim Code", 18)} ${pad("Status", 10)} ${pad("Duration", 10)} Message`);
console.log("-".repeat(90));
for (const r of results) {
  console.log(`${pad(r.code, 18)} ${pad(r.status, 10)} ${pad(`${Math.round(r.durationMs / 1000)}s`, 10)} ${r.message ?? ""}`);
}

const counts: Record<string, number> = {};
for (const r of results) {
  counts[r.status] = (counts[r.status] ?? 0) + 1;
}

const successDurations = results.filter(r => r.status === "success").map(r => r.durationMs);
const avgDuration = successDurations.length > 0
  ? Math.round(successDurations.reduce((a, b) => a + b, 0) / successDurations.length / 1000)
  : 0;

console.log(`\nSuccess: ${counts.success ?? 0} | Denied: ${counts.denied ?? 0} | Skipped: ${counts.skipped ?? 0} | Error: ${counts.error ?? 0} | Fatal: ${counts.fatal ?? 0}`);
console.log(`Wall time: ${totalElapsed}s | Avg success duration: ${avgDuration}s | Throughput: ${results.length > 0 ? (results.length / (totalElapsed / 60)).toFixed(1) : 0} claims/min`);
