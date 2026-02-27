import { query } from "../db/pool.ts";

// ── Row type (snake_case from DB) ──

interface NdaTemplateRow {
  id: string;
  tenant_id: string;
  round_id: string;
  version: number;
  content: string;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

// ── Domain type (camelCase) ──

export interface NdaTemplate {
  id: string;
  tenantId: string;
  roundId: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

// ── Row to domain mapping ──

function rowToNdaTemplate(row: NdaTemplateRow): NdaTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    roundId: row.round_id,
    version: row.version,
    content: row.content,
    isActive: row.is_active,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
  };
}

// ── Column constant ──

const NDA_COLUMNS = `id, tenant_id, round_id, version, content, is_active,
  created_at, created_by, updated_at`;

// ── NDA functions ──

export async function getActiveNda(
  roundId: string
): Promise<NdaTemplate | null> {
  const result = await query<NdaTemplateRow>(
    `SELECT ${NDA_COLUMNS}
     FROM ir_nda_templates
     WHERE round_id = $1 AND is_active = true AND deleted_at IS NULL
     ORDER BY version DESC
     LIMIT 1`,
    [roundId]
  );

  const row = result.rows[0];
  return row ? rowToNdaTemplate(row) : null;
}

export async function createNdaTemplate(
  tenantId: string,
  roundId: string,
  content: string,
  userId: string
): Promise<NdaTemplate> {
  // Get the current max version for this round
  const versionResult = await query<{ max_version: number | null }>(
    `SELECT MAX(version) AS max_version
     FROM ir_nda_templates
     WHERE round_id = $1 AND deleted_at IS NULL`,
    [roundId]
  );
  const nextVersion = (versionResult.rows[0]?.max_version ?? 0) + 1;

  // Deactivate all previous active templates for this round
  await query(
    `UPDATE ir_nda_templates
     SET is_active = false, updated_at = now(), updated_by = $2
     WHERE round_id = $1 AND is_active = true AND deleted_at IS NULL`,
    [roundId, userId]
  );

  // Create the new template
  const result = await query<NdaTemplateRow>(
    `INSERT INTO ir_nda_templates (tenant_id, round_id, version, content, is_active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, true, $5, $5)
     RETURNING ${NDA_COLUMNS}`,
    [tenantId, roundId, nextVersion, content, userId]
  );

  return rowToNdaTemplate(result.rows[0]!);
}

export async function acceptNda(
  investorRoundId: string,
  roundId: string,
  ipAddress: string | undefined,
  userAgent: string | undefined
): Promise<boolean> {
  // Get the active NDA template to record which version was signed
  const activeNda = await getActiveNda(roundId);

  const result = await query(
    `UPDATE ir_investor_rounds
     SET nda_accepted_at = now(),
         nda_ip_address = $2,
         nda_user_agent = $3,
         nda_template_id = $4,
         status = 'nda_accepted',
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL AND nda_accepted_at IS NULL`,
    [investorRoundId, ipAddress ?? null, userAgent ?? null, activeNda?.id ?? null]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

/** Get the NDA template that a specific investor signed (for PDF generation) */
export async function getSignedNdaTemplate(
  ndaTemplateId: string
): Promise<NdaTemplate | null> {
  const result = await query<NdaTemplateRow>(
    `SELECT ${NDA_COLUMNS}
     FROM ir_nda_templates
     WHERE id = $1 AND deleted_at IS NULL`,
    [ndaTemplateId]
  );

  const row = result.rows[0];
  return row ? rowToNdaTemplate(row) : null;
}
