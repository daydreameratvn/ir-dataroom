import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../graphql-client.ts";

const client = getClient();

const ClaimFragment = graphql(`
  fragment ClaimInsV2 on claim_cases {
    id
    assessment_summary
    code
    physical_examination_date
    policy_citations: assessment_explanation
    request_amount
    treatment_method
    claim_case_assessed_diagnoses {
      id
      icd { id title value }
    }
    claim_case_status { comment value }
    insured_benefit_type { comment value }
  }
`);

const InsuredDocument = graphql(
  `
  query InsuredCertificateV2($id: uuid!) {
    insured_certificates_by_pk(insured_certificate_id: $id) {
      id
      effective_date
      expiry_date
      issued_at
      dued_at
      phone
      parent_insured_certificate_id
      parent_insured_certificate { id phone }
      claim_cases { id code }
      insured_certificate_histories(where: {deleted_at: {_is_null: true}}) {
        id start_date end_date insured_certificate_id created_at
      }
      insured_person {
        id name email phone dob
        insured_certificates {
          id
          claim_cases { id ...ClaimInsV2 }
        }
        user { id email phone }
      }
      policy { id policy_setting { id claim_form_type } }
    }
  }
  `,
  [ClaimFragment],
);

export const insuredTool: AgentTool = {
  name: "insured",
  label: "Get Insured Certificate",
  description: "Get insured certificate details by id",
  parameters: Type.Object({
    id: Type.String({ description: "The id of the insured certificate" }),
  }),
  execute: async (toolCallId, { id }) => {
    const { data } = await client.query({ query: InsuredDocument, variables: { id } });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { insuredId: id },
    };
  },
};

export const benefitsTool: AgentTool = {
  name: "benefits",
  label: "Benefits",
  description: "Tool to get the benefits of the claim case",
  parameters: Type.Object({
    claim_code: Type.String({ description: "The code of the claim case from claim_case.code" }),
  }),
  execute: async (toolCallId, { claim_code }) => {
    const claimQuery = graphql(`
      query ClaimForBenefitsV2($code: bpchar!) {
        claim_cases(where: { code: { _eq: $code } }, limit: 1) {
          id
          insured_certificate {
            id
            policy_plan { id plan_code plan_id plan_name }
          }
        }
      }
    `);
    const claimData = await client.query({ query: claimQuery, variables: { code: claim_code } });
    const planId = claimData.data?.claim_cases[0]?.insured_certificate?.policy_plan?.plan_id;
    if (planId == null) {
      return {
        content: [{ type: "text", text: `Plan of claim case ${claim_code} not found` }],
        details: { error: true },
      };
    }
    const PlanDocument = graphql(`
      query PlansForClaimCaseV2($planIds: [uuid!]!, $insuredBenefitType: insured_benefit_types_enum) {
        plans(where: { plan_id: { _in: $planIds } }) {
          id name copay_mechanism plan_id
          plan_insured_benefits(
            where: { deleted_at: { _is_null: true }, plan_balances: {}, insured_benefit: { type: { _eq: $insuredBenefitType } } }
            order_by: { insured_benefit: { name: asc } }
          ) {
            id apply_copay insured_benefit_id is_direct_billing
            insured_benefit {
              id name code type
              insured_benefit_type { id: value comment value }
            }
            plan_balance_benefits {
              id plan_balance_id
              plan_balance { id name }
            }
          }
          plan_remarks(order_by: { created_at: desc }) { id description plan_id created_at }
        }
      }
    `);
    const { data } = await client.query({
      query: PlanDocument,
      variables: { insuredBenefitType: "OutPatient", planIds: [planId] },
    });
    const benefits = data?.plans
      .find((p) => p.id === planId)
      ?.plan_insured_benefits.map((i) => ({
        id: i.id,
        key: i.id,
        code: i.insured_benefit.code,
        insured_benefit_type: i.insured_benefit.insured_benefit_type.comment,
        name: i.insured_benefit.name,
        value: i.id,
      }));
    return {
      content: [{ type: "text", text: JSON.stringify(benefits) }],
      details: { claimCode: claim_code, planId },
    };
  },
};

export const balanceTool: AgentTool = {
  name: "balance",
  label: "Balance",
  description: "Tool to get the balance of a benefit",
  parameters: Type.Object({
    claim_case_id: Type.String({ description: "The claim case ID" }),
    insured_certificate_history_id: Type.String({ description: "The insured certificate history ID" }),
    plan_insured_benefit_id: Type.String({ description: "The plan insured benefit ID" }),
  }),
  execute: async (toolCallId, { claim_case_id, insured_certificate_history_id, plan_insured_benefit_id }) => {
    const { data } = await client.query({
      query: graphql(`
        query ClaimInsuredBenefitDetailV2($claimCaseId: UUID!, $planInsuredBenefitId: UUID!, $insuredCertificateHistoryId: UUID!, $gracePeriodStartDate: DateTime) {
          claimInsuredBenefitDetail(
            claimCaseId: $claimCaseId
            planInsuredBenefitId: $planInsuredBenefitId
            insuredCertificateHistoryId: $insuredCertificateHistoryId
            gracePeriodStartDate: $gracePeriodStartDate
          ) {
            coPaymentRatio key paidAmount planInsuredBenefitId
            balanceDetails {
              id name balance balanceRemaining balanceRemainingBuffer balanceUsed
              currentBalanceUseBuffer exclusiveBalanceRemainingBuffer otherBalanceUsedBuffer
              planBalanceId type
              balance_detail { id name contract_reference_phrase plan_id type value }
              plan_balance_type { comment value }
            }
            plan_insured_benefit {
              id apply_copay coefficient formula_type plan_id
              insured_benefit { id code }
            }
          }
        }
      `),
      variables: { claimCaseId: claim_case_id, insuredCertificateHistoryId: insured_certificate_history_id, planInsuredBenefitId: plan_insured_benefit_id },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { claimCaseId: claim_case_id },
    };
  },
};
