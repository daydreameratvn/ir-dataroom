import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import { APPROVAL_SENTINEL } from "../../shared/types.ts";
import { appleQuery } from "../../shared/graphql-client.ts";

const SUBMIT_CLAIM_MUTATION = `mutation SubmitClaim(
  $insuredCertificateId: ID!
  $benefitType: String!
  $requestAmount: Int!
  $physicalExaminationDate: String
  $diagnosis: String
  $treatmentMethod: String
  $icdCodeIds: [UUID!]
  $medicalProviderId: ID
  $medicalProviderName: String
  $bankId: ID
  $paymentAccountName: String
  $paymentAccountNumber: String
  $paymentBankName: String
  $source: String
) {
  submitClaim(
    insuredCertificateId: $insuredCertificateId
    benefitType: $benefitType
    requestAmount: $requestAmount
    physicalExaminationDate: $physicalExaminationDate
    diagnosis: $diagnosis
    treatmentMethod: $treatmentMethod
    icdCodeIds: $icdCodeIds
    medicalProviderId: $medicalProviderId
    medicalProviderName: $medicalProviderName
    bankId: $bankId
    paymentAccountName: $paymentAccountName
    paymentAccountNumber: $paymentAccountNumber
    paymentBankName: $paymentBankName
    source: $source
  ) {
    success
    message
    claimId
    claim { id code }
  }
}`;

const SUBMIT_CLAIM_WITH_OTP_MUTATION = `mutation SubmitClaimWithOtp(
  $insuredCertificateId: ID!
  $benefitType: String!
  $requestAmount: Int!
  $otp: String!
  $recipient: String!
  $physicalExaminationDate: String
  $diagnosis: String
  $treatmentMethod: String
  $icdCodeIds: [UUID!]
  $medicalProviderId: ID
  $medicalProviderName: String
  $bankId: ID
  $paymentAccountName: String
  $paymentAccountNumber: String
  $paymentBankName: String
  $source: String
) {
  submitClaimWithOtp(
    insuredCertificateId: $insuredCertificateId
    benefitType: $benefitType
    requestAmount: $requestAmount
    otp: $otp
    recipient: $recipient
    physicalExaminationDate: $physicalExaminationDate
    diagnosis: $diagnosis
    treatmentMethod: $treatmentMethod
    icdCodeIds: $icdCodeIds
    medicalProviderId: $medicalProviderId
    medicalProviderName: $medicalProviderName
    bankId: $bankId
    paymentAccountName: $paymentAccountName
    paymentAccountNumber: $paymentAccountNumber
    paymentBankName: $paymentBankName
    source: $source
  ) {
    success
    message
    claimId
    claim { id code }
  }
}`;

export type SubmitClaimApprovalState = {
  approved: boolean;
};

/**
 * Factory that creates a submitClaim tool with approval gating.
 *
 * Two-track approval:
 * - No OTP required + not yet approved → returns APPROVAL_SENTINEL (triggers approval_request SSE)
 * - No OTP required + approved → actually submits the claim
 * - OTP provided → providing OTP = implicit approval, submits directly
 */
export function createSubmitClaimTool(approvalState: SubmitClaimApprovalState): AgentTool {
  return {
    name: "submitClaim",
    label: "Submit Claim",
    description:
      "Submit an insurance claim. If OTP is required (from findInsured response), include otp and recipient. " +
      "If requiresOtp is false, omit otp and recipient. " +
      "IMPORTANT: After this succeeds, you MUST call uploadDocuments to attach documents to the claim.",
    parameters: Type.Object({
      insuredCertificateId: Type.String({ description: "The insured certificate ID" }),
      benefitType: Type.String({ description: "Benefit type: OutPatient or InPatient" }),
      requestAmount: Type.Number({ description: "Request amount in VND" }),
      otp: Type.Optional(Type.String({ description: "OTP code — required only when requiresOtp is true" })),
      recipient: Type.Optional(Type.String({ description: "The email or phone that received the OTP — required only when otp is provided" })),
      physicalExaminationDate: Type.Optional(Type.String({ description: "Date of examination (YYYY-MM-DD)" })),
      diagnosis: Type.Optional(Type.String({ description: "Diagnosis text" })),
      treatmentMethod: Type.Optional(Type.String({ description: "Treatment method" })),
      icdCodeIds: Type.Optional(Type.Array(Type.String(), { description: "Array of ICD code UUIDs" })),
      medicalProviderId: Type.Optional(Type.String({ description: "Medical provider UUID" })),
      medicalProviderName: Type.Optional(Type.String({ description: "Medical provider name (used if medicalProviderId is not available)" })),
      bankId: Type.Optional(Type.String({ description: "Bank UUID for payment" })),
      paymentAccountName: Type.Optional(Type.String({ description: "Bank account holder name" })),
      paymentAccountNumber: Type.Optional(Type.String({ description: "Bank account number" })),
      paymentBankName: Type.Optional(Type.String({ description: "Bank name" })),
    }),
    execute: async (toolCallId, params: any) => {
      const useOtp = params.otp && params.recipient;

      // Two-track approval:
      // - OTP provided → implicit approval, submit directly
      // - No OTP + not approved → return APPROVAL_SENTINEL to trigger approval request
      if (!useOtp && !approvalState.approved) {
        return {
          content: [{ type: "text", text: APPROVAL_SENTINEL }],
          details: {
            params: {
              insuredCertificateId: params.insuredCertificateId,
              benefitType: params.benefitType,
              requestAmount: params.requestAmount,
              diagnosis: params.diagnosis,
              treatmentMethod: params.treatmentMethod,
              medicalProviderName: params.medicalProviderName,
            },
          },
        };
      }

      try {
        const mutation = useOtp ? SUBMIT_CLAIM_WITH_OTP_MUTATION : SUBMIT_CLAIM_MUTATION;

        const variables: Record<string, unknown> = {
          insuredCertificateId: params.insuredCertificateId,
          benefitType: params.benefitType,
          requestAmount: Math.round(params.requestAmount),
          physicalExaminationDate: params.physicalExaminationDate,
          diagnosis: params.diagnosis,
          treatmentMethod: params.treatmentMethod,
          icdCodeIds: params.icdCodeIds,
          medicalProviderId: params.medicalProviderId,
          medicalProviderName: params.medicalProviderName,
          bankId: params.bankId,
          paymentAccountName: params.paymentAccountName,
          paymentAccountNumber: params.paymentAccountNumber,
          paymentBankName: params.paymentBankName,
          source: "AGENT_CARE_APP",
        };

        if (useOtp) {
          variables.otp = params.otp;
          variables.recipient = params.recipient;
        }

        // Reset approval state after submission so subsequent claims require new approval
        approvalState.approved = false;

        const data = await appleQuery<Record<string, any>>(mutation, variables);

        const result = useOtp ? data?.submitClaimWithOtp : data?.submitClaim;
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: {
            success: result?.success,
            claimId: result?.claimId,
            claimCode: result?.claim?.code,
          },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error submitting claim: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: { error: true },
          isError: true,
        };
      }
    },
  };
}

// Keep backward-compatible export for direct/non-session usage
export const submitClaimTool: AgentTool = createSubmitClaimTool({ approved: true });
