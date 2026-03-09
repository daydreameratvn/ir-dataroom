import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient, gqlQuery } from "../graphql-client.ts";

const client = getClient();

// ============================================================================
// GraphQL: Resolve claim code → insurer name + policy number
// ============================================================================

const ClaimPolicyContextDocument = graphql(`
  query ClaimPolicyContextForRules($code: bpchar!) {
    claim_cases(where: { code: { _eq: $code } }, limit: 1) {
      id
      insured_certificate {
        id
        policy {
          id
          policy_number
          insurer_company {
            company_id
            name
          }
        }
      }
    }
  }
`);

// ============================================================================
// Types
// ============================================================================

interface PolicyRule {
  id: string;
  category: string;
  benefitType: string | null;
  ruleKey: string;
  ruleValue: unknown;
  description: string;
  priority: number;
  sourcePage: number | null;
}

interface GroupedRules {
  ruleSetId: string;
  insurerName: string;
  companyName: string | null;
  policyNumber: string | null;
  status: string;
  rules: Record<string, PolicyRule[]>;
  totalRules: number;
}

// ============================================================================
// GraphQL queries via fetch (avoids Apollo DDN type mismatches)
// ============================================================================

/**
 * Primary matching: find rule set by policy number.
 * The policy number is stored directly on the rule set (from the Drive folder name).
 * Uses ILIKE for fuzzy matching (claim may have "33.02.01.0107.25" while folder is "HD33.02.01.0107.25").
 */
const FIND_RULE_SET_BY_POLICY_NUMBER = `
  query FindRuleSetByPolicyNumber($policyNumber: String_1!) {
    policyRuleSets(
      where: {
        policyNumber: { _ilike: $policyNumber }
        deletedAt: { _is_null: true }
      }
      order_by: [{ status: Asc }]
      limit: 1
    ) {
      id
      insurerName
      companyName
      policyNumber
      status
    }
  }
`;

const GET_POLICY_RULES = `
  query GetPolicyRules($ruleSetId: Uuid!, $where: PolicyRulesBoolExp!) {
    policyRules(
      where: {
        _and: [
          { ruleSetId: { _eq: $ruleSetId } }
          { deletedAt: { _is_null: true } }
          $where
        ]
      }
      order_by: [{ category: Asc }, { priority: Desc }, { ruleKey: Asc }]
    ) {
      id
      category
      benefitType
      ruleKey
      ruleValue
      description
      priority
      sourcePage
    }
  }
`;

const GET_ALL_POLICY_RULES = `
  query GetAllPolicyRules($ruleSetId: Uuid!) {
    policyRules(
      where: {
        ruleSetId: { _eq: $ruleSetId }
        deletedAt: { _is_null: true }
      }
      order_by: [{ category: Asc }, { priority: Desc }, { ruleKey: Asc }]
    ) {
      id
      category
      benefitType
      ruleKey
      ruleValue
      description
      priority
      sourcePage
    }
  }
`;

// ============================================================================
// Helper: Apply amendment overrides
// ============================================================================

function applyAmendmentOverrides(rules: PolicyRule[]): PolicyRule[] {
  const amendments = rules.filter(r => r.category === "amendment_override");
  const baseRules = rules.filter(r => r.category !== "amendment_override");

  if (amendments.length === 0) return baseRules;

  const overriddenKeys = new Set<string>();
  for (const amendment of amendments) {
    const value = amendment.ruleValue as Record<string, unknown>;
    const overridesKey = value?.overrides_rule_key as string;
    if (overridesKey) {
      overriddenKeys.add(overridesKey);
    }
  }

  const filtered = baseRules.filter(r => !overriddenKeys.has(r.ruleKey));
  return [...filtered, ...amendments];
}

// ============================================================================
// Helper: Group rules by category
// ============================================================================

function groupByCategory(rules: PolicyRule[]): Record<string, PolicyRule[]> {
  const groups: Record<string, PolicyRule[]> = {};
  for (const rule of rules) {
    const cat = rule.category;
    if (!groups[cat]) groups[cat] = [];
    groups[cat]!.push(rule);
  }
  return groups;
}

// ============================================================================
// Tool
// ============================================================================

export const policyRulesTool: AgentTool = {
  name: "policyRules",
  label: "Policy Rules Lookup",
  description:
    "Look up pre-extracted policy rules for a claim's insurer/policy. Returns structured coverage rules, " +
    "benefit limits, exclusions, drug rules, and copay rates. Use BEFORE assessBenefit to determine " +
    "coverage terms. Policy rules are MANDATORY — if no rules are found, STOP the assessment.",
  parameters: Type.Object({
    claimCode: Type.String({ description: "Claim code to auto-resolve insurer/policy" }),
    category: Type.Optional(
      Type.String({
        description: "Filter by rule category (optional)",
        enum: [
          "benefit_schedule", "exclusion", "drug_rule", "test_rule", "copay",
          "deductible", "waiting_period", "network", "authorization",
          "special_clause", "general_condition", "amendment_override",
        ],
      }),
    ),
    benefitType: Type.Optional(
      Type.String({
        description: "Filter by benefit type (optional): OutPatient, Inpatient, Dental, Maternity, Surgical",
      }),
    ),
  }),
  execute: async (toolCallId, params) => {
    // 1. Resolve claim → insurer name + policy number
    let insurerName: string | null = null;
    let policyNumber: string | null = null;

    try {
      const { data } = await client.query({
        query: ClaimPolicyContextDocument,
        variables: { code: params.claimCode },
      });
      const claim = data?.claim_cases?.[0];
      if (!claim) {
        return {
          content: [{ type: "text", text: `ERROR: Claim code "${params.claimCode}" not found.` }],
          details: { error: true },
          isError: true,
        };
      }
      insurerName = claim.insured_certificate?.policy?.insurer_company?.name ?? null;
      policyNumber = claim.insured_certificate?.policy?.policy_number ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `ERROR: Failed to resolve claim: ${message}` }],
        details: { error: true },
        isError: true,
      };
    }

    if (!insurerName) {
      return {
        content: [{ type: "text", text: `STOP ASSESSMENT: No insurer found for claim "${params.claimCode}". Cannot proceed without policy rules.` }],
        details: { noRules: true },
        isError: true,
      };
    }

    // 2. Find rule set by policy number
    try {
      type RuleSetResult = { id: string; insurerName: string; companyName: string | null; policyNumber: string | null; status: string };
      let ruleSet: RuleSetResult | null = null;

      if (!policyNumber) {
        return {
          content: [{ type: "text", text: `STOP ASSESSMENT: No policy number found for claim "${params.claimCode}". Cannot look up policy rules without a policy number.` }],
          details: { noRules: true, insurerName },
          isError: true,
        };
      }

      const result = await gqlQuery<{
        policyRuleSets: RuleSetResult[];
      }>(FIND_RULE_SET_BY_POLICY_NUMBER, {
        policyNumber: `%${policyNumber}%`,
      });
      ruleSet = result?.policyRuleSets?.[0] ?? null;

      if (!ruleSet) {
        return {
          content: [{ type: "text", text: `STOP ASSESSMENT: No policy rules found for policy "${policyNumber}" (insurer: "${insurerName}"). Policy rules have not been compiled for this policy yet. Cannot proceed without policy rules.` }],
          details: { noRules: true, insurerName, policyNumber },
          isError: true,
        };
      }

      // 3. Query rules with optional filters
      let rules: PolicyRule[];

      if (params.category || params.benefitType) {
        const whereConditions: Record<string, unknown>[] = [];
        if (params.category) {
          whereConditions.push({ category: { _eq: params.category } });
        }
        if (params.benefitType) {
          whereConditions.push({
            _or: [
              { benefitType: { _eq: params.benefitType } },
              { benefitType: { _is_null: true } },
            ],
          });
        }
        const where = whereConditions.length === 1 ? whereConditions[0] : { _and: whereConditions };
        const rulesResult = await gqlQuery<{ policyRules: PolicyRule[] }>(
          GET_POLICY_RULES,
          { ruleSetId: ruleSet.id, where },
        );
        rules = rulesResult?.policyRules ?? [];
      } else {
        const rulesResult = await gqlQuery<{ policyRules: PolicyRule[] }>(
          GET_ALL_POLICY_RULES,
          { ruleSetId: ruleSet.id },
        );
        rules = rulesResult?.policyRules ?? [];
      }

      // 4. Apply amendment overrides
      rules = applyAmendmentOverrides(rules);

      // 5. Group by category
      const grouped: GroupedRules = {
        ruleSetId: ruleSet.id,
        insurerName: ruleSet.insurerName,
        companyName: ruleSet.companyName,
        policyNumber: ruleSet.policyNumber,
        status: ruleSet.status,
        rules: groupByCategory(rules),
        totalRules: rules.length,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(grouped) }],
        details: {
          ruleSetId: ruleSet.id,
          insurerName: ruleSet.insurerName,
          companyName: ruleSet.companyName,
          status: ruleSet.status,
          totalRules: rules.length,
          categories: Object.keys(grouped.rules),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `STOP ASSESSMENT: Failed to query policy rules: ${message}. Cannot proceed without policy rules.` }],
        details: { error: true },
        isError: true,
      };
    }
  },
};
