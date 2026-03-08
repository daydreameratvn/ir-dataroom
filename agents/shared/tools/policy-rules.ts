import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient, gqlQuery } from "../graphql-client.ts";

const client = getClient();

// ============================================================================
// GraphQL: Resolve claim code → insurer name
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
  policyNumber: string | null;
  status: string;
  rules: Record<string, PolicyRule[]>;
  totalRules: number;
}

// ============================================================================
// GraphQL queries via fetch (avoids Apollo DDN type mismatches)
// ============================================================================

const FIND_ACTIVE_RULE_SET = `
  query FindActiveRuleSet($insurerName: String_1!) {
    policyRuleSets(
      where: {
        insurerName: { _ilike: $insurerName }
        status: { _eq: "active" }
        deletedAt: { _is_null: true }
      }
      limit: 1
    ) {
      id
      insurerName
      policyNumber
      status
    }
  }
`;

const FIND_RULE_SET_BY_INSURER = `
  query FindRuleSetByInsurer($insurerName: String_1!) {
    policyRuleSets(
      where: {
        insurerName: { _ilike: $insurerName }
        deletedAt: { _is_null: true }
      }
      order_by: [
        { status: Asc }
      ]
      limit: 1
    ) {
      id
      insurerName
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
  // Separate amendments from base rules
  const amendments = rules.filter(r => r.category === "amendment_override");
  const baseRules = rules.filter(r => r.category !== "amendment_override");

  if (amendments.length === 0) return baseRules;

  // For each amendment, find and replace the base rule it overrides
  const overriddenKeys = new Set<string>();
  for (const amendment of amendments) {
    const value = amendment.ruleValue as Record<string, unknown>;
    const overridesKey = value?.overrides_rule_key as string;
    if (overridesKey) {
      overriddenKeys.add(overridesKey);
    }
  }

  // Filter out overridden base rules, keep amendments as regular rules
  const filtered = baseRules.filter(r => !overriddenKeys.has(r.ruleKey));
  // Add amendments back (they contain the new_value)
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
    "coverage terms. If no rules are found, fall back to policyDocSearch + policyDocFetch.",
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
    // 1. Resolve claim → insurer name
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
        content: [{ type: "text", text: `No insurer found for claim "${params.claimCode}". Use policyDocSearch instead.` }],
        details: { noRules: true },
        isError: false,
      };
    }

    // 2. Find active rule set for this insurer
    try {
      // Try exact active match first
      const result = await gqlQuery<{
        policyRuleSets: Array<{ id: string; insurerName: string; policyNumber: string | null; status: string }>;
      }>(FIND_ACTIVE_RULE_SET, { insurerName: `%${insurerName}%` });

      let ruleSet = result?.policyRuleSets?.[0] ?? null;

      // If no active rule set, try any status (draft/reviewed)
      if (!ruleSet) {
        const fallbackResult = await gqlQuery<{
          policyRuleSets: Array<{ id: string; insurerName: string; policyNumber: string | null; status: string }>;
        }>(FIND_RULE_SET_BY_INSURER, { insurerName: `%${insurerName}%` });
        ruleSet = fallbackResult?.policyRuleSets?.[0] ?? null;
      }

      if (!ruleSet) {
        return {
          content: [{ type: "text", text: `No policy rules compiled for insurer "${insurerName}". Fall back to policyDocSearch + policyDocFetch for on-demand extraction.` }],
          details: { noRules: true, insurerName },
          isError: false,
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
          status: ruleSet.status,
          totalRules: rules.length,
          categories: Object.keys(grouped.rules),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `ERROR: Failed to query policy rules: ${message}. Fall back to policyDocSearch + policyDocFetch.` }],
        details: { error: true },
        isError: true,
      };
    }
  },
};
