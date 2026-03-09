/**
 * Test script: Validate Google Drive policy document access and run drone with new tools.
 *
 * Phase 1: Test Drive service directly (SSM auth, folder listing, PDF extraction)
 * Phase 2: Run drone agent on one claim and observe policyDocSearch/policyDocFetch usage
 *
 * Usage:
 *   AWS_PROFILE=banyan AWS_REGION=ap-southeast-1 \
 *   HASURA_GRAPHQL_ENDPOINT=... HASURA_ADMIN_TOKEN=... \
 *   GOOGLE_VERTEX_PROJECT=banyan-489002 GOOGLE_VERTEX_LOCATION=asia-southeast1 \
 *   bun run agents/drone/test-policy-doc.ts
 *
 * Optional env:
 *   CLAIM_CODE=RE-25-XXXXXX  — run drone on a specific claim (skips Phase 2 auto-fetch)
 *   SKIP_DRONE=1              — only run Phase 1 (Drive tests)
 */
import { listPolicyDocuments, downloadDocumentPages } from "../shared/services/google-drive.ts";
import { createDroneAgent } from "./agent.ts";

// ─── Phase 1: Drive Service Tests ──────────────────────────────────────────

console.log("═".repeat(80));
console.log("PHASE 1: Google Drive Policy Document Service");
console.log("═".repeat(80));

// Test 1: List root folders (insurer names)
console.log("\n[1/3] Listing root Drive folder children (insurer names)...");
try {
  const result = await listPolicyDocuments({ insurerName: "__LIST_ROOT__" });
  console.log("  Unexpected: got result instead of error", result);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("not found in Drive. Available folders:")) {
    const folders = msg.split("Available folders: ")[1];
    console.log(`  ✓ Drive access works. Found insurer folders:`);
    console.log(`    ${folders}`);
  } else {
    console.error(`  ✗ Drive access FAILED:`, msg);
    process.exit(1);
  }
}

// Test 2: Search for policy documents with the first available insurer
console.log("\n[2/3] Searching for policy documents with a real insurer...");
let testInsurer: string | null = null;
let testFileId: string | null = null;
let testFileName: string | null = null;

try {
  // Trigger the error to get folder list, then use the first insurer
  await listPolicyDocuments({ insurerName: "__LIST_ROOT__" });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  const foldersStr = msg.split("Available folders: ")[1];
  if (foldersStr) {
    const folders = foldersStr.split(", ");
    testInsurer = folders[0] ?? null;
  }
}

if (testInsurer) {
  console.log(`  Using insurer: "${testInsurer}"`);
  try {
    const result = await listPolicyDocuments({ insurerName: testInsurer });
    console.log(`  ✓ Found ${result.files.length} files`);
    console.log(`    Path: ${result.matchedPath.join(" > ")}`);

    // Group by category
    const byCat: Record<string, number> = {};
    for (const f of result.files) {
      byCat[f.category] = (byCat[f.category] ?? 0) + 1;
    }
    console.log(`    Categories:`, JSON.stringify(byCat));

    // Pick first PDF for text extraction test
    const pdfFile = result.files.find((f) => f.mimeType === "application/pdf");
    if (pdfFile) {
      testFileId = pdfFile.id;
      testFileName = pdfFile.name;
    }

    // Show first few files
    const preview = result.files.slice(0, 5);
    for (const f of preview) {
      const size = f.size ? `${Math.round(Number(f.size) / 1024)}KB` : "?KB";
      console.log(`    - [${f.category}] ${f.name} (${f.mimeType}, ${size})`);
    }
    if (result.files.length > 5) {
      console.log(`    ... and ${result.files.length - 5} more`);
    }
  } catch (err) {
    console.error(`  ✗ Search failed:`, err instanceof Error ? err.message : String(err));
  }
} else {
  console.log("  ⚠ No insurers found in root folder — skipping");
}

// Test 3: Download PDF pages as images (for LLM vision extraction)
if (testFileId) {
  console.log(`\n[3/3] Downloading PDF pages: "${testFileName}" (${testFileId})...`);
  try {
    const pages = await downloadDocumentPages(testFileId);
    console.log(`  ✓ Rendered ${pages.length} page(s) as PNG images`);
    for (let i = 0; i < Math.min(pages.length, 3); i++) {
      const sizeKB = Math.round((pages[i]!.data.length * 3) / 4 / 1024); // base64 → bytes
      console.log(`    Page ${i + 1}: ~${sizeKB}KB (${pages[i]!.mimeType})`);
    }
    if (pages.length > 3) {
      console.log(`    ... and ${pages.length - 3} more page(s)`);
    }
  } catch (err) {
    console.error(`  ✗ PDF page download failed:`, err instanceof Error ? err.message : String(err));
  }
} else {
  console.log("\n[3/3] Skipping PDF page download — no PDF files found in test insurer folder");
}

// ─── Phase 2: Drone Agent with Policy Doc Tools ────────────────────────────

if (process.env.SKIP_DRONE === "1") {
  console.log("\n[SKIP_DRONE=1] Skipping Phase 2 (drone agent test)");
  process.exit(0);
}

console.log("\n" + "═".repeat(80));
console.log("PHASE 2: Drone Agent with Policy Document Tools");
console.log("═".repeat(80));

// Get a claim code
let claimCode = process.env.CLAIM_CODE;

if (!claimCode) {
  console.log("\n[Phase 2] No CLAIM_CODE provided, fetching an eligible claim...");
  const { fetchDroneEligibleClaims } = await import("./eligibility.ts");
  const eligible = await fetchDroneEligibleClaims(1, 1);
  if (eligible.length === 0) {
    console.log("  No eligible Tier 1 claims found. Try CLAIM_CODE=... to specify one.");
    process.exit(0);
  }
  claimCode = eligible[0]!.code;
  console.log(`  Using claim: ${claimCode}`);
}

console.log(`\n[Phase 2] Creating drone agent for ${claimCode}...`);
const agentStart = Date.now();
const agent = await createDroneAgent(claimCode, { skipCompliance: true });
console.log(`  Agent created in ${Date.now() - agentStart}ms`);

// Track tool calls
const toolCalls: { name: string; durationMs: number; error: boolean }[] = [];
const toolStarts = new Map<string, number>();

agent.subscribe((e) => {
  switch (e.type) {
    case "tool_execution_start":
      toolStarts.set(e.toolName, Date.now());
      const isPolicyTool = e.toolName.startsWith("policyDoc");
      console.log(`  ${isPolicyTool ? "★" : "·"} Tool start: ${e.toolName}`);
      break;
    case "tool_execution_end": {
      const start = toolStarts.get(e.toolName) ?? Date.now();
      const duration = Date.now() - start;
      toolCalls.push({ name: e.toolName, durationMs: duration, error: e.isError ?? false });
      const isPolicyTool2 = e.toolName.startsWith("policyDoc");
      console.log(`  ${isPolicyTool2 ? "★" : "·"} Tool end: ${e.toolName} (${duration}ms${e.isError ? " ERROR" : ""})`);

      // Show policy doc results
      if (isPolicyTool2 && !e.isError && e.result) {
        try {
          const textContent = (e.result as any)?.content?.find?.((c: any) => c.type === "text");
          if (textContent?.text) {
            if (e.toolName === "policyDocSearch") {
              const parsed = JSON.parse(textContent.text);
              console.log(`    → Found ${parsed.files?.length ?? 0} files, path: ${parsed.matchedPath?.join(" > ")}`);
            } else if (e.toolName === "policyDocFetch") {
              console.log(`    → Extracted ${textContent.text.length} chars of text`);
            }
          }
        } catch { /* ignore */ }
      }
      break;
    }
    case "agent_end":
      console.log("  Agent finished");
      break;
  }
});

// Run the agent
console.log(`\n[Phase 2] Running agent on ${claimCode}...`);
const promptStart = Date.now();

try {
  await agent.prompt(`Thẩm định yêu cầu bồi thường ${claimCode}. Đây là hồ sơ thuốc mạn tính Tier 1.`);
} catch (err) {
  console.error(`  Agent error:`, err instanceof Error ? err.message : String(err));
}

const totalMs = Date.now() - promptStart;

// ─── Summary ─────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(80));
console.log("SUMMARY");
console.log("═".repeat(80));
console.log(`Claim: ${claimCode}`);
console.log(`Total duration: ${Math.round(totalMs / 1000)}s`);
console.log(`Tool calls: ${toolCalls.length}`);

const policyDocCalls = toolCalls.filter((t) => t.name.startsWith("policyDoc"));
console.log(`Policy doc tool calls: ${policyDocCalls.length}`);

console.log("\nAll tool calls:");
for (const t of toolCalls) {
  const isPolicyTool = t.name.startsWith("policyDoc");
  const prefix = isPolicyTool ? "★" : " ";
  const dur = `${Math.round(t.durationMs / 1000)}s`;
  console.log(`  ${prefix} ${t.name.padEnd(25)} ${dur.padStart(5)}${t.error ? " ERROR" : ""}`);
}

if (policyDocCalls.length === 0) {
  console.log("\n⚠ The drone did NOT use policyDocSearch/policyDocFetch on this claim.");
  console.log("  This is expected if the agent didn't need to check policy terms.");
  console.log("  The tools are available — the agent uses them when coverage questions arise.");
}
