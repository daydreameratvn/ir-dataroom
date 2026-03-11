import { query } from "../db/pool.ts";

// ── Row type (snake_case from DB) ──

interface DocumentRow {
  id: string;
  tenant_id: string;
  round_id: string;
  name: string;
  description: string | null;
  category: string;
  mime_type: string | null;
  file_size_bytes: string | null;
  s3_key: string | null;
  s3_bucket: string | null;
  sort_order: number;
  watermark_enabled: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

// ── Domain type (camelCase) ──

export interface Document {
  id: string;
  tenantId: string;
  roundId: string;
  name: string;
  description: string | null;
  category: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  s3Key: string | null;
  s3Bucket: string | null;
  sortOrder: number;
  watermarkEnabled: boolean;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

// ── Row to domain mapping ──

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    roundId: row.round_id,
    name: row.name,
    description: row.description,
    category: row.category,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    s3Key: row.s3_key,
    s3Bucket: row.s3_bucket,
    sortOrder: row.sort_order,
    watermarkEnabled: row.watermark_enabled,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

// ── List options ──

export interface ListDocumentsOptions {
  category?: string;
  excludeCategory?: string;
  requireS3Key?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListDocumentsResult {
  data: Document[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ── Column constant ──

const DOCUMENT_COLUMNS = `id, tenant_id, round_id, name, description, category, mime_type,
  file_size_bytes, s3_key, s3_bucket, sort_order, watermark_enabled,
  created_at, created_by, updated_at`;

// ── CRUD functions ──

export async function listDocuments(
  roundId: string,
  opts?: ListDocumentsOptions
): Promise<ListDocumentsResult> {
  const page = opts?.page ?? 1;
  const pageSize = Math.min(opts?.pageSize ?? 50, 200);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = ["round_id = $1", "deleted_at IS NULL"];
  const params: unknown[] = [roundId];
  let paramIdx = 2;

  if (opts?.requireS3Key) {
    conditions.push("s3_key IS NOT NULL");
  }

  if (opts?.category) {
    conditions.push(`category = $${paramIdx}`);
    params.push(opts.category);
    paramIdx++;
  }

  if (opts?.excludeCategory) {
    conditions.push(`category != $${paramIdx}`);
    params.push(opts.excludeCategory);
    paramIdx++;
  }

  const where = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM ir_documents WHERE ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const dataResult = await query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM ir_documents
     WHERE ${where}
     ORDER BY sort_order ASC, created_at ASC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, pageSize, offset]
  );

  return {
    data: dataResult.rows.map(rowToDocument),
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
}

export async function getDocumentById(id: string): Promise<Document | null> {
  const result = await query<DocumentRow>(
    `SELECT ${DOCUMENT_COLUMNS}
     FROM ir_documents
     WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );

  const row = result.rows[0];
  return row ? rowToDocument(row) : null;
}

export interface CreateDocumentData {
  name: string;
  description?: string;
  category?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  s3Key?: string;
  s3Bucket?: string;
  sortOrder?: number;
  watermarkEnabled?: boolean;
}

export async function createDocument(
  tenantId: string,
  roundId: string,
  data: CreateDocumentData,
  userId: string | null
): Promise<{ id: string }> {
  const params = [
    tenantId,
    roundId,
    data.name,
    data.description ?? null,
    data.category ?? "other",
    data.mimeType ?? null,
    data.fileSizeBytes ?? null,
    data.s3Key ?? null,
    data.s3Bucket ?? null,
    data.sortOrder ?? 0,
    data.watermarkEnabled ?? true,
    userId,
  ];

  // Retry once on transient DB errors (connection reset, timeout)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await query<{ id: string }>(
        `INSERT INTO ir_documents (tenant_id, round_id, name, description, category, mime_type, file_size_bytes, s3_key, s3_bucket, sort_order, watermark_enabled, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
         RETURNING id`,
        params
      );
      return { id: result.rows[0]!.id };
    } catch (err) {
      if (attempt === 0 && isTransientDbError(err)) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  throw new Error("createDocument: max retries exceeded");
}

function isTransientDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("connection") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("terminating connection")
  );
}

export interface UpdateDocumentData {
  name?: string;
  description?: string;
  category?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  s3Key?: string;
  s3Bucket?: string;
  sortOrder?: number;
  watermarkEnabled?: boolean;
}

export async function updateDocument(
  id: string,
  data: UpdateDocumentData,
  userId: string | null
): Promise<Document | null> {
  const setClauses: string[] = ["updated_at = now()", "updated_by = $2"];
  const params: unknown[] = [id, userId];
  let paramIdx = 3;

  const fieldMap: Record<string, string> = {
    name: "name",
    description: "description",
    category: "category",
    mimeType: "mime_type",
    fileSizeBytes: "file_size_bytes",
    s3Key: "s3_key",
    s3Bucket: "s3_bucket",
    sortOrder: "sort_order",
    watermarkEnabled: "watermark_enabled",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = data[key as keyof UpdateDocumentData];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  if (setClauses.length === 2) {
    return getDocumentById(id);
  }

  const result = await query<DocumentRow>(
    `UPDATE ir_documents
     SET ${setClauses.join(", ")}
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING ${DOCUMENT_COLUMNS}`,
    params
  );

  const row = result.rows[0];
  return row ? rowToDocument(row) : null;
}

export async function softDeleteDocument(
  id: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE ir_documents
     SET deleted_at = now(), deleted_by = $2, updated_at = now(), updated_by = $2
     WHERE id = $1 AND deleted_at IS NULL`,
    [id, userId]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

export async function reorderDocuments(
  roundId: string,
  order: { id: string; sortOrder: number }[]
): Promise<void> {
  // Use a single UPDATE with CASE for efficiency
  if (order.length === 0) return;

  const ids: string[] = [];
  const whenClauses: string[] = [];
  const params: unknown[] = [roundId];
  let paramIdx = 2;

  for (const item of order) {
    ids.push(`$${paramIdx}`);
    whenClauses.push(`WHEN id = $${paramIdx} THEN $${paramIdx + 1}`);
    params.push(item.id, item.sortOrder);
    paramIdx += 2;
  }

  await query(
    `UPDATE ir_documents
     SET sort_order = CASE ${whenClauses.join(" ")} ELSE sort_order END,
         updated_at = now()
     WHERE round_id = $1 AND id IN (${ids.join(", ")}) AND deleted_at IS NULL`,
    params
  );
}
