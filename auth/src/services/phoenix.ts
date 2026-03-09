import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { gqlQuery } from "./gql.ts";

const region = process.env.AWS_REGION || "ap-southeast-1";
const s3Client = new S3Client({ region });
const CLAIMS_BUCKET = process.env.CLAIMS_BUCKET || "banyan-prod-claims";

// ── Domain types (camelCase — matches GraphQL field names) ──

export interface Policy {
  id: string;
  tenantId: string;
  policyNumber: string;
  status: string;
  productId: string | null;
  insuredName: string;
  insuredIdNumber: string | null;
  insuredEmail: string | null;
  insuredPhone: string | null;
  insuredDateOfBirth: string | null;
  insuredAddress: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  premium: string | null;
  sumInsured: string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  id: string;
  tenantId: string;
  claimNumber: string;
  status: string;
  policyId: string;
  claimantName: string | null;
  providerName: string | null;
  amountClaimed: string | null;
  amountApproved: string | null;
  amountPaid: string | null;
  currency: string | null;
  dateOfLoss: string | null;
  dateOfService: string | null;
  submittedBy: string | null;
  assignedTo: string | null;
  aiSummary: string | null;
  aiScore: string | null;
  aiRecommendation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimDocument {
  id: string;
  claimId: string;
  tenantId: string;
  fileName: string;
  fileType: string | null;
  fileUrl: string | null;
  fileSizeBytes: string | null;
  documentType: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimNote {
  id: string;
  claimId: string;
  tenantId: string;
  authorId: string | null;
  agentName: string | null;
  content: string;
  noteType: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimDetail extends Claim {
  documents: ClaimDocument[];
  notes: ClaimNote[];
}

export interface CreateClaimInput {
  claimantName: string;
  amountClaimed: number;
  currency: string;
  dateOfLoss?: string;
  dateOfService?: string;
  providerName?: string;
}

export interface DocInput {
  fileName: string;
  fileType: string;
  documentType?: string;
}

// ── GraphQL field selections ──

const POLICY_FIELDS = `
  id tenantId policyNumber status productId
  insuredName insuredIdNumber insuredEmail insuredPhone
  insuredDateOfBirth insuredAddress
  effectiveDate expiryDate premium sumInsured currency
  createdAt updatedAt
`;

const CLAIM_FIELDS = `
  id tenantId claimNumber status policyId
  claimantName providerName
  amountClaimed amountApproved amountPaid currency
  dateOfLoss dateOfService
  submittedBy assignedTo
  aiSummary aiScore aiRecommendation
  createdAt updatedAt
`;

const CLAIM_DOCUMENT_FIELDS = `
  id claimId tenantId
  fileName fileType fileUrl fileSizeBytes
  documentType uploadedBy
  createdAt updatedAt
`;

const CLAIM_NOTE_FIELDS = `
  id claimId tenantId
  authorId agentName content noteType visibility
  createdAt updatedAt
`;

// ── Query functions ──

export async function findPolicyByNumber(
  tenantId: string,
  policyNumber: string
): Promise<Policy | null> {
  const data = await gqlQuery<{
    policies: Policy[];
  }>(
    `query FindPolicy($where: PoliciesBoolExp!) {
      policies(where: $where, limit: 1) {
        ${POLICY_FIELDS}
      }
    }`,
    {
      where: {
        tenantId: { _eq: tenantId },
        policyNumber: { _eq: policyNumber },
        deletedAt: { _is_null: true },
      },
    }
  );

  return data.policies[0] ?? null;
}

export async function listClaimsForPolicy(
  tenantId: string,
  policyId: string
): Promise<Claim[]> {
  const data = await gqlQuery<{
    claims: Claim[];
  }>(
    `query ListClaims($where: ClaimsBoolExp!) {
      claims(where: $where, order_by: [{ createdAt: Desc }]) {
        ${CLAIM_FIELDS}
      }
    }`,
    {
      where: {
        tenantId: { _eq: tenantId },
        policyId: { _eq: policyId },
        deletedAt: { _is_null: true },
      },
    }
  );

  return data.claims;
}

export async function getClaimWithDetails(
  tenantId: string,
  claimId: string,
  policyId: string
): Promise<ClaimDetail | null> {
  const data = await gqlQuery<{
    claimsById: (Claim & {
      claimDocuments: ClaimDocument[];
      claimNotes: ClaimNote[];
    }) | null;
  }>(
    `query GetClaimDetail($id: Uuid!) {
      claimsById(id: $id) {
        ${CLAIM_FIELDS}
        claimDocuments(
          where: { deletedAt: { _is_null: true } }
          order_by: [{ createdAt: Desc }]
        ) {
          ${CLAIM_DOCUMENT_FIELDS}
        }
        claimNotes(
          where: { visibility: { _eq: "external" }, deletedAt: { _is_null: true } }
          order_by: [{ createdAt: Desc }]
        ) {
          ${CLAIM_NOTE_FIELDS}
        }
      }
    }`,
    { id: claimId }
  );

  const claim = data.claimsById;
  if (!claim) return null;

  // Verify the claim belongs to the right tenant and policy
  if (claim.tenantId !== tenantId || claim.policyId !== policyId) return null;

  return {
    ...claim,
    documents: claim.claimDocuments,
    notes: claim.claimNotes,
  };
}

function generateClaimNumber(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CLM-${timestamp}-${random}`;
}

export async function createClaim(
  tenantId: string,
  policyId: string,
  data: CreateClaimInput
): Promise<Claim> {
  const result = await gqlQuery<{
    insertClaims: { returning: Claim[] };
  }>(
    `mutation CreateClaim($objects: [ClaimsInsertInput!]!) {
      insertClaims(objects: $objects) {
        returning {
          ${CLAIM_FIELDS}
        }
      }
    }`,
    {
      objects: [
        {
          tenantId,
          claimNumber: generateClaimNumber(),
          status: "submitted",
          policyId,
          claimantName: data.claimantName,
          providerName: data.providerName ?? null,
          amountClaimed: data.amountClaimed,
          currency: data.currency,
          dateOfLoss: data.dateOfLoss ?? null,
          dateOfService: data.dateOfService ?? null,
          submittedBy: policyId,
          createdBy: policyId,
          updatedBy: policyId,
        },
      ],
    }
  );

  return result.insertClaims.returning[0]!;
}

export async function createClaimDocument(
  tenantId: string,
  claimId: string,
  data: DocInput
): Promise<{ uploadUrl: string; document: ClaimDocument }> {
  const docId = randomUUID();
  const s3Key = `${tenantId}/${claimId}/${docId}/${data.fileName}`;

  // Generate presigned upload URL
  const command = new PutObjectCommand({
    Bucket: CLAIMS_BUCKET,
    Key: s3Key,
    ContentType: data.fileType,
  });
  const uploadUrl = await (getSignedUrl as Function)(s3Client, command, { expiresIn: 3600 }) as string;

  const fileUrl = `https://${CLAIMS_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;

  const result = await gqlQuery<{
    insertClaimDocuments: { returning: ClaimDocument[] };
  }>(
    `mutation CreateClaimDocument($objects: [ClaimDocumentsInsertInput!]!) {
      insertClaimDocuments(objects: $objects) {
        returning {
          ${CLAIM_DOCUMENT_FIELDS}
        }
      }
    }`,
    {
      objects: [
        {
          id: docId,
          tenantId,
          claimId,
          fileName: data.fileName,
          fileType: data.fileType,
          fileUrl,
          documentType: data.documentType ?? null,
          uploadedBy: tenantId,
          createdBy: tenantId,
          updatedBy: tenantId,
        },
      ],
    }
  );

  return {
    uploadUrl,
    document: result.insertClaimDocuments.returning[0]!,
  };
}

export async function getExternalNotes(
  tenantId: string,
  claimId: string
): Promise<ClaimNote[]> {
  const data = await gqlQuery<{
    claimNotes: ClaimNote[];
  }>(
    `query ExternalNotes($where: ClaimNotesBoolExp!) {
      claimNotes(where: $where, order_by: [{ createdAt: Desc }]) {
        ${CLAIM_NOTE_FIELDS}
      }
    }`,
    {
      where: {
        tenantId: { _eq: tenantId },
        claimId: { _eq: claimId },
        visibility: { _eq: "external" },
        deletedAt: { _is_null: true },
      },
    }
  );

  return data.claimNotes;
}
