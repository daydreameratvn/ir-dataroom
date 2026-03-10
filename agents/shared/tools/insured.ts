import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { gqlQuery, appleQuery } from "../graphql-client.ts";

export const insuredTool: AgentTool = {
  name: "insured",
  label: "Get Insured Certificate",
  description: "Get insured certificate details by id",
  parameters: Type.Object({
    id: Type.String({ description: "The id of the insured certificate" }),
  }),
  execute: async (toolCallId, { id }) => {
    const data = await gqlQuery<{ insuredCertificatesByInsuredCertificateId: any }>(
      `query InsuredCertificate($id: Uuid_1!) {
        insuredCertificatesByInsuredCertificateId(insuredCertificateId: $id) {
          insuredCertificateId
          effectiveDate
          expiryDate
          issuedAt
          duedAt
          phone
          parentInsuredCertificateId
          claimCases { claimCaseId code }
          insuredCertificateHistories {
            id startDate endDate insuredCertificateId createdAt
          }
          insuredPerson {
            insuredPersonId name email phone dob
            insuredCertificates {
              insuredCertificateId
              claimCases {
                claimCaseId
                assessmentSummary
                code
                physicalExaminationDate
                requestAmount
                treatmentMethod
                claimCaseAssessedDiagnoses {
                  id
                  metadatum { metadataId title value }
                }
              }
            }
          }
          plan { planId }
        }
      }`,
      { id },
    );
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
    const claimData = await gqlQuery<{ claimCases: any[] }>(
      `query ClaimForBenefits($code: String!) {
        claimCases(where: { code: { _eq: $code } }, limit: 1) {
          claimCaseId
          insuredCertificate {
            insuredCertificateId
            plan { planId }
          }
        }
      }`,
      { code: claim_code },
    );
    const planId = claimData.claimCases?.[0]?.insuredCertificate?.plan?.planId;
    if (planId == null) {
      return {
        content: [{ type: "text", text: `Plan of claim case ${claim_code} not found` }],
        details: { error: true },
      };
    }
    const data = await gqlQuery<{ plans: any[] }>(
      `query PlansForClaimCase($planIds: [Uuid_1!]!) {
        plans(where: { planId: { _in: $planIds } }) {
          planId name copayMechanism
          planInsuredBenefits(
            order_by: { insuredBenefit: { name: Asc } }
          ) {
            planInsuredBenefitId: id applyCopay insuredBenefitId isDirectBilling
            insuredBenefit {
              insuredBenefitId: id name code type
            }
          }
          planRemarks(order_by: { createdAt: Desc }) { planRemarkId: id description planId createdAt }
        }
      }`,
      { planIds: [planId] },
    );
    const benefits = data.plans
      ?.find((p: any) => p.planId === planId)
      ?.planInsuredBenefits?.map((i: any) => ({
        id: i.planInsuredBenefitId,
        key: i.planInsuredBenefitId,
        code: i.insuredBenefit?.code,
        name: i.insuredBenefit?.name,
        value: i.planInsuredBenefitId,
      }));
    return {
      content: [{ type: "text", text: JSON.stringify(benefits) }],
      details: { claimCode: claim_code, planId },
    };
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Custom action — must stay on Apple v2
export const balanceTool: AgentTool = {
  name: "balance",
  label: "Balance",
  description: "Tool to get the balance of a benefit",
  parameters: Type.Object({
    claim_case_id: Type.String({ description: "The claim case ID" }),
    insured_certificate_history_id: Type.String({ description: "The insured certificate history ID — get this from insured tool" }),
    plan_insured_benefit_id: Type.String({ description: "The plan insured benefit ID" }),
  }),
  execute: async (toolCallId, { claim_case_id, insured_certificate_history_id, plan_insured_benefit_id }) => {
    if (!insured_certificate_history_id || !UUID_RE.test(insured_certificate_history_id)) {
      return {
        content: [{ type: "text", text: `ERROR: insured_certificate_history_id is invalid ("${insured_certificate_history_id}"). You must get the correct UUID from the insured tool response.` }],
        details: { error: true },
        isError: true,
      };
    }
    const data = await appleQuery<{ claimInsuredBenefitDetail: any }>(
      `query ClaimInsuredBenefitDetail($claimCaseId: UUID!, $planInsuredBenefitId: UUID!, $insuredCertificateHistoryId: UUID!, $gracePeriodStartDate: DateTime) {
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
      }`,
      { claimCaseId: claim_case_id, insuredCertificateHistoryId: insured_certificate_history_id, planInsuredBenefitId: plan_insured_benefit_id },
    );
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { claimCaseId: claim_case_id },
    };
  },
};
