import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";

import { getClient } from "../../shared/graphql-client.ts";

export const submitClaimTool: AgentTool = {
  name: "submitClaim",
  label: "Submit Claim",
  description:
    "Submit an insurance claim with OTP verification. Returns the new claim case ID and code. " +
    "IMPORTANT: After this succeeds, you MUST call uploadDocuments to attach documents to the claim.",
  parameters: Type.Object({
    insuredCertificateId: Type.String({ description: "The insured certificate ID" }),
    benefitType: Type.String({ description: "Benefit type: OutPatient or InPatient" }),
    requestAmount: Type.Number({ description: "Request amount in VND" }),
    otp: Type.String({ description: "OTP code provided by the user" }),
    recipient: Type.String({ description: "The email or phone that received the OTP" }),
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
    try {
      const { data } = await getClient().mutate({
        mutation: graphql(`
          mutation SubmitClaimWithOtp(
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
          }
        `),
        variables: {
          insuredCertificateId: params.insuredCertificateId,
          benefitType: params.benefitType,
          requestAmount: Math.round(params.requestAmount),
          otp: params.otp,
          recipient: params.recipient,
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
        },
      });

      const result = (data as any)?.submitClaimWithOtp;
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
