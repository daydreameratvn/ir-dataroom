import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import { graphql } from "@papaya/graphql/sdk";
import dedent from "dedent";

import { getClient } from "../graphql-client.ts";

const client = getClient();

// ============================================================================
// Constants
// ============================================================================

const DOCUMENT_REQUIREMENTS: Record<string, { required: string[]; optional: string[] }> = {
  OutPatient: { required: ["PrescriptionPaper", "InvoicePaper"], optional: ["MEDICAL_TEST_RESULT", "RECEIPT", "OtherPaper", "POLST", "MedicalRecord"] },
  InPatient: { required: ["DischargePaper", "InvoicePaper", "PrescriptionPaper"], optional: ["MEDICAL_TEST_RESULT", "MedicalRecord", "OtherPaper", "POLST", "RECEIPT", "CertificateOfSurgery"] },
  Dental: { required: ["DentalTreatmentProof", "InvoicePaper"], optional: ["PrescriptionPaper", "OtherPaper", "MedicalRecord", "POLST"] },
  Maternity: { required: ["MedicalRecord", "InvoicePaper"], optional: ["OtherPaper", "RECEIPT", "MEDICAL_TEST_RESULT"] },
  Accident: { required: ["AccidentProof", "InvoicePaper"], optional: ["PoliceRelatedPaper", "MEDICAL_TEST_RESULT", "OtherPaper", "MedicalRecord"] },
  Life: { required: ["DeathCertificate", "MedicalRecord"], optional: ["PoliceRelatedPaper", "OtherPaper"] },
  Others: { required: ["OtherPaper"], optional: ["InvoicePaper", "MedicalRecord"] },
};

// ============================================================================
// GraphQL Documents
// ============================================================================

const ClaimWithDocumentsFragment = graphql(`
  fragment ClaimWithDocumentsV2Pi on claim_cases {
    id
    code
    diagnosis
    request_amount
    physical_examination_date
    treatment_method
    claim_case_status { value comment }
    insured_benefit_type { value comment }
    claim_case_assessed_diagnoses {
      id
      icd { id value title }
    }
    claim_documents(where: { deleted_at: { _is_null: true } }) {
      id type
      claim_document_type { value comment }
      file { id url name }
    }
    medical_provider { id name }
  }
`);

const SimilarApprovedClaimsDocument = graphql(
  `
    query SimilarApprovedClaimsV2Pi(
      $benefitType: insured_benefit_types_enum!
      $limit: Int!
      $offset: Int!
    ) {
      claim_cases(
        where: { status: { _eq: Paid }, insured_benefit_type: { value: { _eq: $benefitType } } }
        order_by: { approved_at: desc }
        limit: $limit
        offset: $offset
      ) {
        ...ClaimWithDocumentsV2Pi
      }
    }
  `,
  [ClaimWithDocumentsFragment],
);

const ClaimDocumentsForComplianceDocument = graphql(
  `
    query ClaimDocumentsForComplianceV2Pi($claimCode: String!) {
      claim_cases(where: { code_v2: { _eq: $claimCode } }, limit: 1) {
        ...ClaimWithDocumentsV2Pi
        insured_certificate {
          id
          insured_person { id name paper_id dob }
        }
      }
    }
  `,
  [ClaimWithDocumentsFragment],
);

interface ComplianceRule {
  id: string;
  benefit_type: string;
  insurer_id: string | null;
  required_documents: string[];
  optional_documents: string[];
  validation_rules: Record<string, unknown>;
  source: string;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

const InsertComplianceRuleDocument = graphql(`
  mutation InsertComplianceRuleV2Pi($object: cerebrate_document_compliance_rules_insert_input!) {
    insert_cerebrate_document_compliance_rules_one(
      object: $object
      on_conflict: {
        constraint: cerebrate_document_compliance_rules_benefit_type_insurer_id_key
        update_columns: [required_documents, optional_documents, validation_rules, confidence_score, updated_at]
      }
    ) {
      id benefit_type insurer_id required_documents optional_documents
      validation_rules source confidence_score created_at updated_at
    }
  }
`);

const GetComplianceRulesDocument = graphql(`
  query GetComplianceRulesV2Pi($benefitType: String!, $insurerId: uuid) {
    cerebrate_document_compliance_rules(
      where: {
        benefit_type: { _eq: $benefitType }
        _or: [{ insurer_id: { _eq: $insurerId } }, { insurer_id: { _is_null: true } }]
      }
      order_by: [{ insurer_id: desc_nulls_last }, { confidence_score: desc }]
      limit: 1
    ) {
      id benefit_type insurer_id required_documents optional_documents
      validation_rules source confidence_score created_at updated_at
    }
  }
`);

// ============================================================================
// Tools
// ============================================================================

export const runComplianceCheckTool: AgentTool = {
  name: "runComplianceCheck",
  label: "Running Compliance Check",
  description: dedent`
    Run a deterministic document compliance check on a claim.
    Checks which required documents are present or missing for the claim's benefit type.
    Returns structured compliance status with missing/present document lists.
  `,
  parameters: Type.Object({
    claimCode: Type.String({ description: "The claim code to check compliance for" }),
  }),
  execute: async (toolCallId, { claimCode }) => {
    const { data } = await client.query({
      query: ClaimDocumentsForComplianceDocument,
      variables: { claimCode },
    });

    const claim = data?.claim_cases?.[0];
    if (!claim) {
      return {
        content: [{ type: "text", text: JSON.stringify({ claimCode, compliant: false, error: "Claim not found" }) }],
        details: { error: true },
      };
    }

    const benefitType = claim.insured_benefit_type?.value;
    if (!benefitType) {
      return {
        content: [{ type: "text", text: JSON.stringify({ claimCode, compliant: false, error: "No benefit type" }) }],
        details: { error: true },
      };
    }

    const requirements = DOCUMENT_REQUIREMENTS[benefitType] ?? { required: [], optional: [] };
    const presentDocumentTypes = claim.claim_documents.map((doc) => String(doc.type));
    const missingRequired = requirements.required.filter((type) => !presentDocumentTypes.includes(type));
    const compliant = missingRequired.length === 0;

    const result = {
      claimCode,
      benefitType,
      compliant,
      status: compliant ? "PASSED" : "NEEDS_SUPPLEMENT",
      documentPresence: {
        valid: compliant,
        presentDocuments: presentDocumentTypes,
        missingRequired,
        requiredDocuments: requirements.required,
      },
      claimDetails: {
        diagnosis: claim.diagnosis,
        requestAmount: claim.request_amount,
        medicalProvider: claim.medical_provider?.name,
        insuredName: claim.insured_certificate?.insured_person?.name,
      },
      summary: compliant
        ? `Claim ${claimCode} passed all compliance checks.`
        : `Claim ${claimCode} missing ${missingRequired.length} required document(s): ${missingRequired.join(", ")}`,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: { compliant },
    };
  },
};

export const findSimilarApprovedClaimsTool: AgentTool = {
  name: "findSimilarApprovedClaims",
  label: "Finding Similar Approved Claims",
  description: dedent`
    Find similar approved claims to learn document patterns.
    Use this to understand what documents are typically required for a specific benefit type.
  `,
  parameters: Type.Object({
    benefitType: Type.Union([
      Type.Literal("OutPatient"), Type.Literal("InPatient"), Type.Literal("Dental"),
      Type.Literal("Maternity"), Type.Literal("Accident"), Type.Literal("Life"), Type.Literal("Others"),
    ], { description: "The benefit type to find similar claims for" }),
    limit: Type.Optional(Type.Number({ description: "Maximum number of claims to return (default 10)" })),
    offset: Type.Optional(Type.Number({ description: "Offset for pagination (default 0)" })),
  }),
  execute: async (toolCallId, { benefitType, limit = 10, offset = 0 }) => {
    const { data } = await client.query({
      query: SimilarApprovedClaimsDocument,
      variables: { benefitType, limit, offset },
    });

    const claims = data?.claim_cases ?? [];
    const documentPatterns = claims.map((claim) => ({
      claimCode: claim.code,
      diagnosis: claim.diagnosis,
      documentTypes: claim.claim_documents.map((doc) => doc.type),
      documentCount: claim.claim_documents.length,
    }));

    const documentTypeCounts: Record<string, number> = {};
    for (const pattern of documentPatterns) {
      for (const type of pattern.documentTypes) {
        documentTypeCounts[type] = (documentTypeCounts[type] ?? 0) + 1;
      }
    }

    const result = {
      claims: documentPatterns,
      documentTypeCounts,
      totalClaims: claims.length,
      commonDocuments: Object.entries(documentTypeCounts)
        .filter(([, count]) => count >= claims.length * 0.8)
        .map(([type]) => type),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: { totalClaims: claims.length },
    };
  },
};

export const getComplianceRuleTool: AgentTool = {
  name: "getComplianceRule",
  label: "Get Compliance Rule",
  description: dedent`
    Get stored compliance rules for a benefit type.
    Returns insurer-specific rules if available, otherwise falls back to global or built-in rules.
  `,
  parameters: Type.Object({
    benefitType: Type.Union([
      Type.Literal("OutPatient"), Type.Literal("InPatient"), Type.Literal("Dental"),
      Type.Literal("Maternity"), Type.Literal("Accident"), Type.Literal("Life"), Type.Literal("Others"),
    ], { description: "The benefit type to get rules for" }),
    insurerId: Type.Optional(Type.String({ description: "Optional insurer ID to get insurer-specific rules" })),
  }),
  execute: async (toolCallId, { benefitType, insurerId }) => {
    const { data } = await client.query({
      query: GetComplianceRulesDocument,
      variables: { benefitType, insurerId: insurerId ?? null },
    });

    const rules = ((data as { cerebrate_document_compliance_rules?: ComplianceRule[] })
      ?.cerebrate_document_compliance_rules ?? []) as ComplianceRule[];

    if (rules.length === 0) {
      const builtIn = DOCUMENT_REQUIREMENTS[benefitType];
      if (builtIn) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            source: "builtin", benefitType,
            requiredDocuments: builtIn.required, optionalDocuments: builtIn.optional,
            confidenceScore: 1.0, message: "Using built-in requirements (no learned rules found)",
          }) }],
          details: { source: "builtin" },
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `No compliance rules found for ${benefitType}` }) }],
        details: { error: true },
      };
    }

    const rule = rules[0];
    return {
      content: [{ type: "text", text: JSON.stringify({
        source: rule.source, benefitType: rule.benefit_type, insurerId: rule.insurer_id,
        requiredDocuments: rule.required_documents, optionalDocuments: rule.optional_documents,
        validationRules: rule.validation_rules, confidenceScore: rule.confidence_score,
        updatedAt: rule.updated_at,
      }) }],
      details: { source: rule.source },
    };
  },
};

export const saveComplianceRuleTool: AgentTool = {
  name: "saveComplianceRule",
  label: "Saving Compliance Rule",
  description: dedent`
    Save a learned document compliance rule to the database.
    Use this after analyzing multiple approved claims to store patterns.
  `,
  parameters: Type.Object({
    benefitType: Type.Union([
      Type.Literal("OutPatient"), Type.Literal("InPatient"), Type.Literal("Dental"),
      Type.Literal("Maternity"), Type.Literal("Accident"), Type.Literal("Life"), Type.Literal("Others"),
    ], { description: "The benefit type this rule applies to" }),
    insurerId: Type.Optional(Type.String({ description: "Optional insurer ID for insurer-specific rules" })),
    requiredDocuments: Type.Array(Type.String(), { description: "List of document types that are required" }),
    optionalDocuments: Type.Optional(Type.Array(Type.String(), { description: "List of document types that are optional" })),
    validationRules: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Additional validation rules" })),
    confidenceScore: Type.Number({ description: "Confidence score (0.0 to 1.0)" }),
  }),
  execute: async (toolCallId, { benefitType, insurerId, requiredDocuments, optionalDocuments, validationRules, confidenceScore }) => {
    const { data } = await client.mutate({
      mutation: InsertComplianceRuleDocument,
      variables: {
        object: {
          benefit_type: benefitType,
          insurer_id: insurerId ?? null,
          required_documents: requiredDocuments,
          optional_documents: optionalDocuments ?? [],
          validation_rules: validationRules ?? {},
          source: "learned",
          confidence_score: confidenceScore,
          updated_at: new Date().toISOString(),
        },
      } as any,
    });

    const rule = (data as { insert_cerebrate_document_compliance_rules_one?: ComplianceRule })
      ?.insert_cerebrate_document_compliance_rules_one;

    if (!rule) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Failed to save compliance rule" }) }],
        details: { error: true },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify({
        success: true,
        rule: {
          id: rule.id, benefitType: rule.benefit_type, insurerId: rule.insurer_id,
          requiredDocuments: rule.required_documents, optionalDocuments: rule.optional_documents,
          confidenceScore: rule.confidence_score,
        },
      }) }],
      details: { success: true },
    };
  },
};
