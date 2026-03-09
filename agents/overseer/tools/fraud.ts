import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";
import dedent from "dedent";

import { getClient } from "../../shared/graphql-client.ts";

const client = getClient();

const FraudDetectionClaimFragment = graphql(`
  fragment FraudDetectionClaim on claim_cases {
    id
    admission_date
    code
    diagnosis
    discharge_date
    event_date
    physical_examination_date
    request_amount
    treatment_method
    created_at
    claim_case_assessed_diagnoses {
      id
      icd { id title value }
    }
    claim_documents {
      id
      claim_document_type { comment }
      file { id url }
    }
    insured_benefit_type { comment value }
    medical_provider { id name address }
  }
`);

const InsuredClaimHistoryDocument = graphql(`
  query InsuredClaimHistory($insuredPersonId: uuid!) {
    insured_persons_by_pk(insured_person_id: $insuredPersonId) {
      id name dob
      insured_certificates {
        id effective_date expiry_date issued_at dued_at
        claim_cases { ...FraudDetectionClaim }
      }
    }
  }
`, [FraudDetectionClaimFragment]);

const ClaimsForFraudScanDocument = graphql(`
  query ClaimsForFraudScan($where: claim_cases_bool_exp!, $limit: Int!, $offset: Int!) {
    claim_cases_aggregate(where: $where, limit: $limit, offset: $offset) {
      aggregate { count }
      nodes {
        ...FraudDetectionClaim
        insured_certificate {
          id
          insured_person { id name dob gender paper_id }
          policy { id policy_number }
        }
      }
    }
  }
`, [FraudDetectionClaimFragment]);

const InsuredPersonDataDocument = graphql(`
  query InsuredPersonData($id: uuid!) {
    insured_persons_by_pk(insured_person_id: $id) {
      id name dob gender paper_id
      insured_certificates {
        id effective_date expiry_date issued_at dued_at
        claim_cases(order_by: { physical_examination_date: desc }, limit: 50) {
          ...FraudDetectionClaim
        }
        policy { id policy_number }
      }
    }
  }
`, [FraudDetectionClaimFragment]);

const SimilarPatternClaimsDocument = graphql(`
  query SimilarPatternClaims($where: claim_cases_bool_exp!, $limit: Int!, $offset: Int!) {
    claim_cases(where: $where, order_by: { physical_examination_date: desc }, limit: $limit, offset: $offset) {
      ...FraudDetectionClaim
      insured_certificate {
        id
        insured_person { id name dob paper_id }
      }
    }
  }
`, [FraudDetectionClaimFragment]);

const RecordFraudFindingDocument = graphql(`
  mutation RecordFraudFinding($input: fraud_detection_logs_insert_input!) {
    insert_fraud_detection_logs_one(object: $input) {
      id description detection_type severity created_at
    }
  }
`);

export const claimForFraudAnalysisTool: AgentTool = {
  name: "claimForFraudAnalysis",
  label: "Get Claim for Fraud Analysis",
  description: dedent`Retrieve detailed claim case data by claim code for fraud pattern analysis.`,
  parameters: Type.Object({
    code: Type.String({ description: "The claim code to analyze" }),
  }),
  execute: async (toolCallId, { code }) => {
    const ClaimForAnalysisDocument = graphql(`
      query ClaimForAnalysis($code: String!) {
        claim_cases(where: { code_v2: { _eq: $code } }, limit: 1) {
          ...FraudDetectionClaim
          insured_certificate {
            id effective_date expiry_date
            claim_cases_aggregate { aggregate { count sum { request_amount } } }
            insured_person { id name dob gender paper_id }
            policy { id policy_number insurer_company { id name } }
          }
        }
      }
    `, [FraudDetectionClaimFragment]);
    const { data } = await client.query({ query: ClaimForAnalysisDocument, variables: { code } });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { code },
    };
  },
};

export const insuredClaimHistoryTool: AgentTool = {
  name: "insuredClaimHistory",
  label: "Get Insured Claim History",
  description: dedent`Retrieve historical claims for a specific insured person for pattern detection.`,
  parameters: Type.Object({
    insuredPersonId: Type.String({ description: "The insured person ID" }),
  }),
  execute: async (toolCallId, { insuredPersonId }) => {
    const { data } = await client.query({ query: InsuredClaimHistoryDocument, variables: { insuredPersonId } });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { insuredPersonId },
    };
  },
};

export const scanClaimsForFraudTool: AgentTool = {
  name: "scanClaimsForFraud",
  label: "Scan Claims for Fraud",
  description: dedent`Scan claim cases for potential fraud patterns. Use filters to narrow down by status, date, provider, or policy.`,
  parameters: Type.Object({
    limit: Type.Optional(Type.Number({ description: "Maximum number of claims to scan (default 20)" })),
    offset: Type.Optional(Type.Number({ description: "Offset for pagination (default 0)" })),
    where: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Filter conditions for scanning" })),
  }),
  execute: async (toolCallId, { limit = 20, offset = 0, where = {} }) => {
    const { data } = await client.query({
      query: ClaimsForFraudScanDocument,
      variables: { limit, offset, where },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { limit, offset },
    };
  },
};

export const insuredPersonDetailsTool: AgentTool = {
  name: "insuredPersonDetails",
  label: "Get Insured Person Details",
  description: dedent`Get detailed information about an insured person including personal data, certificates, policies, and claim history.`,
  parameters: Type.Object({
    insuredPersonId: Type.String({ description: "The insured person ID" }),
  }),
  execute: async (toolCallId, { insuredPersonId }) => {
    const { data } = await client.query({ query: InsuredPersonDataDocument, variables: { id: insuredPersonId } });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { insuredPersonId },
    };
  },
};

export const findSimilarClaimsTool: AgentTool = {
  name: "findSimilarClaims",
  label: "Find Similar Pattern Claims",
  description: dedent`Find claims with similar patterns at the same medical provider within a date range.`,
  parameters: Type.Object({
    dateFrom: Type.Optional(Type.String({ description: "Start date for search (YYYY-MM-DD)" })),
    dateTo: Type.Optional(Type.String({ description: "End date for search (YYYY-MM-DD)" })),
    policyId: Type.Optional(Type.String({ description: "Policy ID to search claims at" })),
    medicalProviderId: Type.Optional(Type.String({ description: "Medical provider ID to search claims at" })),
    offset: Type.Optional(Type.Number({ description: "Offset for pagination (default 0)" })),
  }),
  execute: async (toolCallId, { dateFrom, dateTo, policyId, medicalProviderId, offset = 0 }) => {
    const whereConditions = [
      medicalProviderId ? { medical_provider_id: { _eq: medicalProviderId } } : undefined,
      dateFrom || dateTo ? { physical_examination_date: { _gte: dateFrom, _lte: dateTo } } : undefined,
      policyId ? { insured_certificate: { policy_id: { _eq: policyId } } } : undefined,
    ].filter(Boolean);
    const { data } = await client.query({
      query: SimilarPatternClaimsDocument,
      variables: { where: { _or: whereConditions }, limit: 400, offset },
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      details: { offset },
    };
  },
};

export const recordFraudFindingTool: AgentTool = {
  name: "recordFraudFinding",
  label: "Record Fraud Finding",
  description: dedent`Record a fraud detection finding with evidence.
    Severity levels: GREEN (first warning), YELLOW (second occurrence), RED (multiple occurrences).
    Detection types: IDENTITY_MISMATCH, PATTERN_ANOMALY, TIME_PATTERN, DOCUMENT_INCONSISTENCY, PROVIDER_COLLUSION.`,
  parameters: Type.Object({
    claimCaseId: Type.String({ description: "The claim case ID that triggered detection" }),
    insuredCertificateId: Type.String({ description: "The insured certificate ID" }),
    severity: Type.Union([Type.Literal("GREEN"), Type.Literal("YELLOW"), Type.Literal("RED")], { description: "Severity level" }),
    detectionType: Type.Union([
      Type.Literal("IDENTITY_MISMATCH"),
      Type.Literal("PATTERN_ANOMALY"),
      Type.Literal("TIME_PATTERN"),
      Type.Literal("DOCUMENT_INCONSISTENCY"),
      Type.Literal("PROVIDER_COLLUSION"),
    ], { description: "Type of fraud detected" }),
    description: Type.String({ description: "Detailed description of the finding" }),
    evidence: Type.String({ description: "JSON string containing evidence data" }),
  }),
  execute: async (toolCallId, { claimCaseId, insuredCertificateId, severity, detectionType, description, evidence }) => {
    try {
      const { data } = await client.mutate({
        mutation: RecordFraudFindingDocument,
        variables: {
          input: {
            claim_case_id: claimCaseId,
            insured_certificate_id: insuredCertificateId,
            description,
            detection_type: detectionType,
            evidence,
            severity,
          },
        },
      });
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        details: { severity, detectionType },
      };
    } catch (error) {
      console.error("recordFraudFinding: Failed to record", error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Fraud detection logging not yet enabled" }) }],
        details: { error: true },
      };
    }
  },
};
