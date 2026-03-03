import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";
import { WebClient } from "@slack/web-api";
import dedent from "dedent";

import { getClient } from "../graphql-client.ts";

const slackClient = new WebClient(process.env.SLACK_TOKEN);
const client = getClient();

// ============================================================================
// GraphQL Documents
// ============================================================================

const ClaimFragment = graphql(`
  fragment ClaimV2 on claim_cases {
    id
    assessment_summary
    code
    physical_examination_date
    policy_citations: assessment_explanation
    request_amount
    treatment_method
    claim_case_assessed_diagnoses {
      id
      icd {
        id
        title
        value
      }
    }
    claim_case_details(where: { deleted_at: { _is_null: true } }) {
      id
      deductible_amount
      paid_time
      request_amount
      total_paid_amount
      total_request_amount
      plan_insured_benefit {
        id
        insured_benefit {
          id
          name
          code
        }
      }
    }
    claim_case_status {
      comment
      value
    }
    claim_notes {
      id
      content_md
    }
    insured_benefit_type {
      comment
      value
    }
    old_policy_citations: claim_notes(where: { type: { _eq: ASSESSMENT_EXPLANATION } }) {
      id
      content
    }
  }
`);

const ClaimCaseDocument = graphql(
  `
    query ClaimCaseV2($code: bpchar!) {
      claim_cases(where: { code: { _eq: $code } }, limit: 1) {
        id
        ...ClaimV2
        code
        claim_case_payment {
          id
          co_payment_ratio
          deductible_amount
        }
        insured_certificate {
          id
          insured_person {
            id
            name
            citizen_identification_number: paper_id
          }
          policy_plan {
            id
            plan_code
            plan_id
            plan_name
          }
        }
      }
    }
  `,
  [ClaimFragment],
);

const UpdateClaimDocument = graphql(
  `
    mutation UpdateClaimV2($id: uuid!, $input: claim_cases_set_input!) {
      update_claim_cases_by_pk(pk_columns: { claim_case_id: $id }, _set: $input) {
        id
        ...ClaimV2
      }
    }
  `,
  [ClaimFragment],
);

const SaveAssessedDiagnosesDocument = graphql(
  `
    mutation SaveAssessedDiagnosesV2($input: [claim_case_assessed_diagnoses_insert_input!]!) {
      insert_claim_case_assessed_diagnoses(
        objects: $input
        on_conflict: { constraint: claim_case_assessed_diagnoses_claim_case_id_icd_metadata_id_key, update_columns: [updated_at] }
      ) {
        affected_rows
      }
    }
  `,
  [ClaimFragment],
);

// ============================================================================
// Tools
// ============================================================================

export const claimTool: AgentTool = {
  name: "claim",
  label: "Get Claim Case",
  description: "Get the claim case by id or claim code",
  parameters: Type.Object({
    code: Type.String({ description: "The claim code of the claim case" }),
  }),
  execute: async (toolCallId, { code }) => {
    const { data } = await client.query({ query: ClaimCaseDocument, variables: { code } });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { claimCode: code },
    };
  },
};

export const saveDetailFormTool: AgentTool = {
  name: "saveDetailForm",
  label: "Save Claim Details",
  description: "Tool to save the details of the claim case. Skip calling this tool if input of this tool is already present on claim case.",
  parameters: Type.Object({
    claim_case_id: Type.String({ description: "The id of the claim case" }),
    claim_code: Type.String({ description: "The code of the claim case from claim_case.code" }),
    physical_examination_date: Type.String({ description: "The date of the physical examination, ISO format without timezone" }),
    assessed_diagnoses: Type.Array(
      Type.Object({
        icd_id: Type.String({ description: "The id of the icd" }),
        icd_code: Type.String({ description: "The code of the icd from icd.value" }),
        icd_name: Type.String({ description: "The name of the icd" }),
      }),
      { description: "The assessed diagnoses of the claim case" },
    ),
    diagnosis: Type.String({ description: "The diagnosis of the claim case" }),
    medical_provider: Type.Object({
      id: Type.String({ description: "The id of the medical provider" }),
      name: Type.String({ description: "The name of the medical provider" }),
    }),
    request_amount: Type.Number({ description: "The request amount of the claim case" }),
    treatment_method: Type.String({ description: "The diagnosis of the claim case" }),
  }),
  execute: async (toolCallId, { claim_case_id, claim_code, physical_examination_date, assessed_diagnoses, diagnosis, medical_provider, request_amount, treatment_method }) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Sanitize UUIDs: empty strings → null (PostgreSQL rejects "" for uuid columns)
    const sanitizeUuid = (v: string | undefined | null) => v && UUID_RE.test(v) ? v : null;

    const validDiagnoses = assessed_diagnoses.filter((d) => sanitizeUuid(d.icd_id));
    if (validDiagnoses.length > 0) {
      await client.mutate({
        mutation: SaveAssessedDiagnosesDocument,
        variables: {
          input: validDiagnoses.map((d: { icd_id: string }) => ({
            claim_case_id,
            icd_metadata_id: d.icd_id,
          })),
        },
      });
    }
    const { data } = await client.mutate({
      mutation: UpdateClaimDocument,
      variables: {
        id: claim_case_id,
        input: {
          medical_provider_id: sanitizeUuid(medical_provider.id),
          physical_examination_date: physical_examination_date || null,
          diagnosis,
          request_amount,
          treatment_method,
        },
      },
    });
    slackClient.chat.postMessage({
      channel: "C0A9MDAUR6Y",
      text: `Claim case ${claim_case_id} has been saved with details`,
    }).catch(console.error);
    return {
      content: [{ type: "text", text: JSON.stringify(data?.update_claim_cases_by_pk) }],
      details: { claimCode: claim_code },
    };
  },
};

export const assessBenefitTool: AgentTool = {
  name: "assessBenefit",
  label: "Assessing Benefit",
  description: dedent`
    Tool to assess the benefit of the claim case. This tool will create claim case detail if it does not exist and update it if provided id exists.
  `,
  parameters: Type.Object({
    claim_case_id: Type.String({ description: "The id of the claim case" }),
    claim_code: Type.String({ description: "The code of the claim case from claim_case.code" }),
    detail: Type.Object({
      id: Type.Optional(Type.String({ description: "The id of the claim case detail" })),
      insured_certificate_history_id: Type.String({ description: "The id of the insured certificate history, retrieve from insured_certificates_by_pk.insured_certificate_histories.id" }),
      plan_insured_benefit_id: Type.String({ description: "The id of the plan insured benefit" }),
      deductible_amount: Type.Optional(Type.Number({ description: "The deductible amount of the claim case" })),
      copay_amount: Type.Number({ description: "The copay amount of the claim case" }),
      covered_amount: Type.Number({ description: "The covered amount of the claim case" }),
      insured_benefit_code: Type.String({ description: "The code of the plan insured benefit: insured_benefit.code" }),
      insured_benefit_name: Type.String({ description: "The name of the plan insured benefit: insured_benefit.name" }),
      non_paid_amount: Type.Number({ description: "The uncovered amount of the claim case" }),
      request_amount: Type.Number({ description: "The request amount of the claim case" }),
      shortfall_amount: Type.Number({ description: "Shortfall amount is the amount that exceeds the benefit balance" }),
      total_paid_amount: Type.Number({ description: "The total paid amount of the claim case" }),
      total_request_amount: Type.Number({ description: "The total request amount of the claim case" }),
    }),
  }),
  execute: async (toolCallId, { claim_case_id, claim_code, detail }) => {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!detail.insured_certificate_history_id || !UUID_RE.test(detail.insured_certificate_history_id)) {
      return {
        content: [{ type: "text", text: `ERROR: insured_certificate_history_id is invalid ("${detail.insured_certificate_history_id}"). You must get the correct UUID from the insured tool response: insured_certificates_by_pk.insured_certificate_histories[].id — pick the history whose date range covers the claim's physical_examination_date.` }],
        details: { error: true },
        isError: true,
      };
    }
    if (!detail.plan_insured_benefit_id || !UUID_RE.test(detail.plan_insured_benefit_id)) {
      return {
        content: [{ type: "text", text: `ERROR: plan_insured_benefit_id is invalid ("${detail.plan_insured_benefit_id}"). You must get the correct UUID from the benefits tool response — pick the benefit that matches the claim's insured_benefit_type (e.g. OutPatient).` }],
        details: { error: true },
        isError: true,
      };
    }

    // Auto-resolve the correct insuredCertificateHistoryId from the claim's insured certificate.
    // The agent often picks a stale/expired history; the backend rejects it with
    // "currentCertHistory.certificateHistoryId !== insuredCertificateHistoryId".
    // Fix: query the claim → cert → histories, pick the one covering physical_examination_date
    // (or the latest by created_at as fallback).
    let resolvedHistoryId = detail.insured_certificate_history_id;
    try {
      const CertHistoryQuery = graphql(`
        query CertHistoryForAssess($claimId: uuid!) {
          claim_cases_by_pk(claim_case_id: $claimId) {
            physical_examination_date
            insured_certificate {
              insured_certificate_histories(where: { deleted_at: { _is_null: true } }, order_by: { created_at: desc }) {
                id
                start_date
                end_date
              }
            }
          }
        }
      `);
      const { data: histData } = await client.query({
        query: CertHistoryQuery,
        variables: { claimId: claim_case_id },
      });
      const claim = histData?.claim_cases_by_pk;
      const histories = claim?.insured_certificate?.insured_certificate_histories ?? [];
      if (histories.length > 0) {
        const examDate = claim?.physical_examination_date ? new Date(claim.physical_examination_date) : null;
        // Pick history covering the exam date
        const covering = examDate
          ? histories.find((h) => {
              const start = h.start_date ? new Date(h.start_date) : null;
              const end = h.end_date ? new Date(h.end_date) : null;
              return (!start || start <= examDate) && (!end || end >= examDate);
            })
          : null;
        // Fallback: latest by created_at (already sorted desc)
        const best = covering ?? histories[0]!;
        if (best.id !== resolvedHistoryId) {
          console.log(`[assessBenefit] ${claim_code} auto-corrected certificateHistoryId: ${resolvedHistoryId} → ${best.id}`);
          resolvedHistoryId = best.id;
        }
      }
    } catch (err) {
      console.warn(`[assessBenefit] ${claim_code} cert history auto-resolve failed, using agent-provided value:`, err instanceof Error ? err.message : String(err));
    }

    const CreateUpdateClaimDetailDocument = graphql(`
      mutation CreateUpdateClaimDetailV2($input: CreateUpdateClaimDetailInput!, $options: CreateUpdateClaimDetailOptions) {
        createUpdateClaimDetail(input: $input, options: $options) {
          claimCaseDetailId
          claimCasePaymentId
          error {
            code
            message
            planBalanceId
          }
        }
      }
    `);
    const input = {
      assessedTime: 1,
      claimCaseDetailId: detail.id,
      claimCaseId: claim_case_id,
      copayAmount: detail.copay_amount,
      coverageAmount: detail.covered_amount,
      deductibleAmount: detail.deductible_amount,
      insuredCertificateHistoryId: resolvedHistoryId,
      isMagic: true,
      nonPaidAmount: detail.non_paid_amount,
      note: "Assessed by AI",
      paidAmount: detail.total_paid_amount,
      paidTime: 1,
      planInsuredBenefitId: detail.plan_insured_benefit_id,
      requestAmount: 1,
      requestTime: 1,
      shortfallAmount: detail.shortfall_amount,
      totalPaidAmount: detail.total_paid_amount,
      totalPaidAmountBeforeCopay: detail.covered_amount,
      totalRequestAmount: detail.total_request_amount,
    };
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[assessBenefit] ${claim_code} attempt ${attempt}/${MAX_RETRIES}`);
        const { data } = await client.mutate({
          mutation: CreateUpdateClaimDetailDocument,
          variables: { input, options: { copayDeductType: "BeforeBalance" } },
        });
        console.log(`[assessBenefit] ${claim_code} result:`, JSON.stringify(data));
        slackClient.chat.postMessage({
          channel: "C0A9MDAUR6Y",
          text: `Claim case ${claim_case_id} has been assessed with details`,
        }).catch(console.error);
        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
          details: { claimCode: claim_code },
        };
      } catch (err) {
        console.error(`[assessBenefit] ${claim_code} attempt ${attempt} ERROR:`, err instanceof Error ? err.message : String(err));
        if (attempt === MAX_RETRIES) {
          console.error(`[assessBenefit] ${claim_code} all ${MAX_RETRIES} attempts failed, input:`, JSON.stringify(input));
          return {
            content: [{ type: "text", text: `ERROR: assessBenefit failed after ${MAX_RETRIES} attempts: ${err instanceof Error ? err.message : String(err)}` }],
            details: { error: true, claimCode: claim_code },
            isError: true,
          };
        }
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    throw new Error("Unreachable");
  },
};

export const createSignOffTool: AgentTool = {
  name: "createSignOff",
  label: "Creating Sign Off",
  description: "Tool to create the sign off of the claim case",
  parameters: Type.Object({
    claim_case_id: Type.String({ description: "The id of the claim case" }),
    assessment_summary: Type.String({ description: "The assessment summary of the claim case & explanation" }),
    claim_code: Type.String({ description: "The code of the claim case from claim_case.code" }),
    content: Type.String({ description: dedent`
      Signoff markdown template:

      RE-25-252330
      **LA**: Nguyễn Huy Tùng
      **Ngày sinh**: 10/08/1972 (53 tuổi)
      **Mã HĐ**: 25CN.SK.01.01V05600058
      **Gói sản phẩm**: Chương trình 2 (Nhân viên)
      **Tên công ty**: CÔNG TY TNHH ARTELIA VIỆT NAM
      **Ngày bắt đầu tham gia**: 14/07/2024
      **Thời gian hiệu lực HĐ**: 477 ngày

      **Chi tiết lần điều trị**:
      Nơi điều trị: BỆNH VIỆN HOÀN MỸ SÀI GÒN
      - Ngày thăm khám: 02/11/2025
      Chẩn đoán: Viêm màng hoạt dịch và viêm bao gân chân trái
      Phương pháp điều trị: Thuốc

      **Tổng kết thẩm định**:
      - Số tiền yêu cầu: 135.000 ₫
      - Số tiền không chi trả (ngoài PVBH): 0 ₫
      - Số tiền không chi trả (vượt hạn mức): 0 ₫
      - Số tiền trong PVBH: 135.000 ₫
      - Số tiền chi trả: 135.000 ₫

      **Lý do**:
      - Details of exclusions or reasons
    ` }),
    policy_citations: Type.Optional(Type.String({ description: "Citations from policy terms and condition. Provide when any exclusion or uncovered expenses are found" })),
  }),
  execute: async (toolCallId, { claim_case_id, assessment_summary, content, policy_citations }) => {
    const CreateSignOffDocument = graphql(`
      mutation CreateSignOffV2($input: claim_notes_insert_input!) {
        insert_claim_notes_one(object: $input) {
          id
        }
      }
    `);
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { data: updateClaimData } = await client.mutate({
          mutation: UpdateClaimDocument,
          variables: {
            id: claim_case_id,
            input: {
              assessment_explanation: policy_citations,
              assessment_summary,
            },
          },
        });
        await client.mutate({
          mutation: CreateSignOffDocument,
          variables: {
            input: {
              claim_case_id,
              user_id: "9a34cadb-3c87-46db-b124-5d856205f18f",
              content,
              content_md: content,
              type: "SignOff",
            },
          },
        });
        return {
          content: [{ type: "text", text: JSON.stringify(updateClaimData) }],
          details: { claimCaseId: claim_case_id },
        };
      } catch (err) {
        console.error(`[createSignOff] ${claim_case_id} attempt ${attempt} ERROR:`, err instanceof Error ? err.message : String(err));
        if (attempt === MAX_RETRIES) throw err;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
    throw new Error("Unreachable");
  },
};

export const approveTool: AgentTool = {
  name: "approve",
  label: "Approving Claim Case",
  description: dedent`
    Tool to approve the claim case. If claim case doesn't have Approved status and nothing else needs to be done, this needs to be called.
  `,
  parameters: Type.Object({
    claim_case_id: Type.String({ description: "The id of the claim case" }),
    claim_code: Type.String({ description: "The code of the claim case from claim_case.code" }),
  }),
  execute: async (toolCallId, { claim_case_id, claim_code }) => {
    const ApproveClaimDocument = graphql(
      `
        mutation ApproveClaimV2($id: ID!) {
          approveClaim(claimId: $id) {
            id: claimId
            newStatus
            claim_case {
              ...ClaimV2
            }
          }
        }
      `,
      [ClaimFragment],
    );
    const { data } = await client.mutate({
      mutation: ApproveClaimDocument,
      variables: { id: claim_case_id },
    });
    slackClient.chat.postMessage({
      channel: "C0A9MDAUR6Y",
      text: dedent`
        Claim case ${claim_case_id} has been approved:
        - Claim code: ${claim_code}
      `,
    }).catch(console.error);
    return {
      content: [{ type: "text", text: JSON.stringify(data?.approveClaim) }],
      details: { claimCode: claim_code },
    };
  },
};
