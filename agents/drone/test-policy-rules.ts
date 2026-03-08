#!/usr/bin/env bun
/**
 * Test script for the policyRules tool and compile pipeline.
 *
 * Usage:
 *   bun run agents/drone/test-policy-rules.ts --claim-code "CL-XXXX"         # Test tool query
 *   bun run agents/drone/test-policy-rules.ts --claim-code "CL-XXXX" --full-agent  # Full Drone run
 *   bun run agents/drone/test-policy-rules.ts --rule-set-id <uuid>           # Inspect rule set
 */

import { parseArgs } from "util";

import { gqlQuery } from "../shared/graphql-client.ts";

// ============================================================================
// CLI Args
// ============================================================================

const { values: args } = parseArgs({
  options: {
    "claim-code": { type: "string" },
    "rule-set-id": { type: "string" },
    "full-agent": { type: "boolean", default: false },
  },
  strict: true,
});

// ============================================================================
// Test: Inspect a rule set
// ============================================================================

async function inspectRuleSet(ruleSetId: string): Promise<void> {
  console.log(`\nInspecting rule set: ${ruleSetId}\n`);

  const result = await gqlQuery<{
    policyRuleSetsById: {
      id: string;
      insurerName: string;
      status: string;
      createdAt: string;
      policyRuleSources: Array<{
        id: string;
        fileName: string;
        fileCategory: string;
        pageCount: number;
        extractionModel: string;
      }>;
    } | null;
  }>(`
    query InspectRuleSet($id: Uuid!) {
      policyRuleSetsById(id: $id) {
        id
        insurerName
        status
        createdAt
        policyRuleSources(where: { deletedAt: { _is_null: true } }) {
          id
          fileName
          fileCategory
          pageCount
          extractionModel
        }
      }
    }
  `, { id: ruleSetId });

  const ruleSet = result?.policyRuleSetsById;
  if (!ruleSet) {
    console.error(`Rule set ${ruleSetId} not found.`);
    process.exit(1);
  }

  console.log(`Insurer:  ${ruleSet.insurerName}`);
  console.log(`Status:   ${ruleSet.status}`);
  console.log(`Created:  ${ruleSet.createdAt}`);
  console.log(`Sources:  ${ruleSet.policyRuleSources.length}`);

  for (const source of ruleSet.policyRuleSources) {
    console.log(`  • ${source.fileName} (${source.fileCategory}, ${source.pageCount} pages, ${source.extractionModel})`);
  }

  // Get rule breakdown
  const rulesResult = await gqlQuery<{
    policyRules: Array<{
      category: string;
      benefitType: string | null;
      ruleKey: string;
      ruleValue: unknown;
      description: string;
      priority: number;
    }>;
  }>(`
    query GetRulesForInspection($ruleSetId: Uuid!) {
      policyRules(
        where: { ruleSetId: { _eq: $ruleSetId }, deletedAt: { _is_null: true } }
        order_by: [{ category: Asc }, { benefitType: Asc }, { ruleKey: Asc }]
      ) {
        category
        benefitType
        ruleKey
        ruleValue
        description
        priority
      }
    }
  `, { ruleSetId });

  const rules = rulesResult?.policyRules ?? [];
  console.log(`\nTotal rules: ${rules.length}\n`);

  // Group by category
  const catCounts: Record<string, number> = {};
  for (const r of rules) {
    catCounts[r.category] = (catCounts[r.category] ?? 0) + 1;
  }
  console.log("Rules by category:");
  for (const [cat, count] of Object.entries(catCounts).sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  // Print first few rules per category
  console.log("\nSample rules:\n");
  const printed = new Set<string>();
  for (const rule of rules) {
    if (printed.has(rule.category)) continue;
    printed.add(rule.category);
    console.log(`[${rule.category}] ${rule.ruleKey}${rule.benefitType ? ` (${rule.benefitType})` : ""}`);
    console.log(`  Value: ${JSON.stringify(rule.ruleValue)}`);
    console.log(`  Desc:  ${rule.description.slice(0, 120)}${rule.description.length > 120 ? "..." : ""}`);
    console.log();
  }
}

// ============================================================================
// Test: Query policyRules tool directly
// ============================================================================

async function testPolicyRulesTool(claimCode: string): Promise<void> {
  console.log(`\nTesting policyRules tool with claim code: ${claimCode}\n`);

  const { policyRulesTool } = await import("../shared/tools/policy-rules.ts");

  const startTime = Date.now();
  const result = await policyRulesTool.execute("test-call-id", { claimCode });
  const duration = Date.now() - startTime;

  console.log(`Query time: ${duration}ms`);

  if (result.isError) {
    console.error("Error:", result.content[0]?.text);
    return;
  }

  const text = result.content[0]?.text ?? "";
  if (result.details?.noRules) {
    console.log("No rules found:", text);
    return;
  }

  const data = JSON.parse(text);
  console.log(`Rule set: ${data.ruleSetId}`);
  console.log(`Insurer:  ${data.insurerName}`);
  console.log(`Status:   ${data.status}`);
  console.log(`Total:    ${data.totalRules} rules`);
  console.log(`Categories: ${Object.keys(data.rules).join(", ")}`);

  // Check performance requirement
  if (duration < 500) {
    console.log(`\n✅ Performance OK: ${duration}ms < 500ms target`);
  } else {
    console.log(`\n⚠️ Performance WARNING: ${duration}ms > 500ms target`);
  }

  // Print summary per category
  console.log("\nRules by category:");
  for (const [category, rules] of Object.entries(data.rules) as Array<[string, any[]]>) {
    console.log(`  ${category}: ${rules.length} rules`);
  }
}

// ============================================================================
// Test: Full Drone agent run with policy rules
// ============================================================================

async function testFullAgent(claimCode: string): Promise<void> {
  console.log(`\nFull Drone agent test with claim code: ${claimCode}\n`);

  const { createDroneAgent } = await import("./agent.ts");
  const agent = await createDroneAgent(claimCode, { skipCompliance: true, tier: 1 });

  // Track tool calls
  const toolCalls: string[] = [];
  agent.subscribe((e) => {
    if (e.type === "tool_execution_start") {
      const toolName = (e as any).toolName ?? "unknown";
      toolCalls.push(toolName);
      console.log(`  🔧 Tool called: ${toolName}`);
    }
  });

  // Run agent
  console.log("Starting agent...\n");
  await agent.run({
    role: "user",
    content: `Process claim ${claimCode}. Follow the assessment workflow.`,
    timestamp: Date.now(),
  });

  console.log(`\nTool calls: ${toolCalls.join(" → ")}`);
  console.log(`policyRules called: ${toolCalls.includes("policyRules") ? "YES ✅" : "NO ❌"}`);
  console.log(`assessBenefit called: ${toolCalls.includes("assessBenefit") ? "YES ✅" : "NO ❌"}`);
  console.log(`createSignOff called: ${toolCalls.includes("createSignOff") ? "YES ✅" : "NO ❌"}`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (args["rule-set-id"]) {
    await inspectRuleSet(args["rule-set-id"]);
    return;
  }

  if (!args["claim-code"]) {
    console.error("Usage: bun run agents/drone/test-policy-rules.ts --claim-code <code> [--full-agent] [--rule-set-id <uuid>]");
    process.exit(1);
  }

  if (args["full-agent"]) {
    await testFullAgent(args["claim-code"]);
  } else {
    await testPolicyRulesTool(args["claim-code"]);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
