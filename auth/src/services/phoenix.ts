import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { query } from "../db/pool.ts";

const region = process.env.AWS_REGION || "ap-southeast-1";
const s3Client = new S3Client({ region });
const CLAIMS_BUCKET = process.env.CLAIMS_BUCKET || "banyan-prod-claims";

// ── Row types (snake_case from DB) ──

interface PolicyRow {
  id: string;
  tenant_id: string;
  policy_number: string;
  status: string;
  product_id: string | null;
  insured_name: string;
  insured_id_number: string | null;
  insured_email: string | null;
  insured_phone: string | null;
  insured_date_of_birth: string | null;
  insured_address: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  premium: string | null;
  sum_insured: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ClaimRow {
  id: string;
  tenant_id: string;
  claim_number: string;
  status: string;
  policy_id: string;
  claimant_name: string | null;
  provider_name: string | null;
  amount_claimed: string | null;
  amount_approved: string | null;
  amount_paid: string | null;
  currency: string | null;
  date_of_loss: string | null;
  date_of_service: string | null;
  submitted_by: string | null;
  assigned_to: string | null;
  ai_summary: string | null;
  ai_score: string | null;
  ai_recommendation: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ClaimDocumentRow {
  id: string;
  claim_id: string;
  tenant_id: string;
  file_name: string;
  file_type: string | null;
  file_url: string | null;
  file_size_bytes: string | null;
  document_type: string | null;
  uploaded_by: string | null;
  extracted_text: string | null;
  extracted_amount: string | null;
  extracted_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ClaimNoteRow {
  id: string;
  claim_id: string;
  tenant_id: string;
  author_id: string | null;
  agent_name: string | null;
  content: string;
  note_type: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Domain types (camelCase) ──

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

// ── Row to domain mapping ──

function toPolicy(row: PolicyRow): Policy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    policyNumber: row.policy_number,
    status: row.status,
    productId: row.product_id,
    insuredName: row.insured_name,
    insuredIdNumber: row.insured_id_number,
    insuredEmail: row.insured_email,
    insuredPhone: row.insured_phone,
    insuredDateOfBirth: row.insured_date_of_birth,
    insuredAddress: row.insured_address,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
    premium: row.premium,
    sumInsured: row.sum_insured,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    claimNumber: row.claim_number,
    status: row.status,
    policyId: row.policy_id,
    claimantName: row.claimant_name,
    providerName: row.provider_name,
    amountClaimed: row.amount_claimed,
    amountApproved: row.amount_approved,
    amountPaid: row.amount_paid,
    currency: row.currency,
    dateOfLoss: row.date_of_loss,
    dateOfService: row.date_of_service,
    submittedBy: row.submitted_by,
    assignedTo: row.assigned_to,
    aiSummary: row.ai_summary,
    aiScore: row.ai_score,
    aiRecommendation: row.ai_recommendation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toClaimDocument(row: ClaimDocumentRow): ClaimDocument {
  return {
    id: row.id,
    claimId: row.claim_id,
    tenantId: row.tenant_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileUrl: row.file_url,
    fileSizeBytes: row.file_size_bytes,
    documentType: row.document_type,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toClaimNote(row: ClaimNoteRow): ClaimNote {
  return {
    id: row.id,
    claimId: row.claim_id,
    tenantId: row.tenant_id,
    authorId: row.author_id,
    agentName: row.agent_name,
    content: row.content,
    noteType: row.note_type,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Column constants ──

const POLICY_COLUMNS = `id, tenant_id, policy_number, status, product_id,
  insured_name, insured_id_number, insured_email, insured_phone,
  insured_date_of_birth, insured_address,
  effective_date, expiry_date, premium, sum_insured, currency,
  created_at, updated_at, deleted_at`;

const CLAIM_COLUMNS = `id, tenant_id, claim_number, status, policy_id,
  claimant_name, provider_name,
  amount_claimed, amount_approved, amount_paid, currency,
  date_of_loss, date_of_service,
  submitted_by, assigned_to,
  ai_summary, ai_score, ai_recommendation,
  created_at, updated_at, deleted_at`;

const CLAIM_DOCUMENT_COLUMNS = `id, claim_id, tenant_id,
  file_name, file_type, file_url, file_size_bytes,
  document_type, uploaded_by,
  extracted_text, extracted_amount, extracted_date,
  created_at, updated_at, deleted_at`;

const CLAIM_NOTE_COLUMNS = `id, claim_id, tenant_id,
  author_id, agent_name, content, note_type, visibility,
  created_at, updated_at, deleted_at`;

// ── Query functions ──

export async function findPolicyByNumber(
  tenantId: string,
  policyNumber: string
): Promise<Policy | null> {
  const result = await query<PolicyRow>(
    `SELECT ${POLICY_COLUMNS}
     FROM policies
     WHERE tenant_id = $1 AND policy_number = $2 AND deleted_at IS NULL`,
    [tenantId, policyNumber]
  );

  const row = result.rows[0];
  return row ? toPolicy(row) : null;
}

export async function listClaimsForPolicy(
  tenantId: string,
  policyId: string
): Promise<Claim[]> {
  const result = await query<ClaimRow>(
    `SELECT ${CLAIM_COLUMNS}
     FROM claims
     WHERE tenant_id = $1 AND policy_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, policyId]
  );

  return result.rows.map(toClaim);
}

export async function getClaimWithDetails(
  tenantId: string,
  claimId: string,
  policyId: string
): Promise<ClaimDetail | null> {
  // Get the claim
  const claimResult = await query<ClaimRow>(
    `SELECT ${CLAIM_COLUMNS}
     FROM claims
     WHERE tenant_id = $1 AND id = $2 AND policy_id = $3 AND deleted_at IS NULL`,
    [tenantId, claimId, policyId]
  );

  const claimRow = claimResult.rows[0];
  if (!claimRow) return null;

  // Get documents
  const docsResult = await query<ClaimDocumentRow>(
    `SELECT ${CLAIM_DOCUMENT_COLUMNS}
     FROM claim_documents
     WHERE tenant_id = $1 AND claim_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, claimId]
  );

  // Get external-visibility notes
  const notesResult = await query<ClaimNoteRow>(
    `SELECT ${CLAIM_NOTE_COLUMNS}
     FROM claim_notes
     WHERE tenant_id = $1 AND claim_id = $2 AND visibility = 'external' AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, claimId]
  );

  return {
    ...toClaim(claimRow),
    documents: docsResult.rows.map(toClaimDocument),
    notes: notesResult.rows.map(toClaimNote),
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
  const claimNumber = generateClaimNumber();

  const result = await query<ClaimRow>(
    `INSERT INTO claims (
      tenant_id, claim_number, status, policy_id,
      claimant_name, provider_name,
      amount_claimed, currency,
      date_of_loss, date_of_service,
      submitted_by, created_by, updated_by
    )
    VALUES ($1, $2, 'submitted', $3, $4, $5, $6, $7, $8, $9, $3, $3, $3)
    RETURNING ${CLAIM_COLUMNS}`,
    [
      tenantId,
      claimNumber,
      policyId,
      data.claimantName,
      data.providerName ?? null,
      data.amountClaimed,
      data.currency,
      data.dateOfLoss ?? null,
      data.dateOfService ?? null,
    ]
  );

  return toClaim(result.rows[0]!);
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

  // Insert document record
  const fileUrl = `https://${CLAIMS_BUCKET}.s3.${region}.amazonaws.com/${s3Key}`;
  const result = await query<ClaimDocumentRow>(
    `INSERT INTO claim_documents (
      id, tenant_id, claim_id,
      file_name, file_type, file_url,
      document_type, uploaded_by,
      created_by, updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $3, $3, $3)
    RETURNING ${CLAIM_DOCUMENT_COLUMNS}`,
    [
      docId,
      tenantId,
      claimId,
      data.fileName,
      data.fileType,
      fileUrl,
      data.documentType ?? null,
    ]
  );

  return {
    uploadUrl,
    document: toClaimDocument(result.rows[0]!),
  };
}

export async function getExternalNotes(
  tenantId: string,
  claimId: string
): Promise<ClaimNote[]> {
  const result = await query<ClaimNoteRow>(
    `SELECT ${CLAIM_NOTE_COLUMNS}
     FROM claim_notes
     WHERE tenant_id = $1 AND claim_id = $2 AND visibility = 'external' AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId, claimId]
  );

  return result.rows.map(toClaimNote);
}
