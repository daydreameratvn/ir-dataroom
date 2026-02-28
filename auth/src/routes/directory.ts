import { Hono } from "hono";
import { createHmac } from "crypto";
import { getJwtKey } from "../config.ts";
import { requireAuth, requireAdmin, getEffectiveTenantId } from "../middleware.ts";
import { query } from "../db/pool.ts";
import { encryptToken, decryptToken } from "../services/encryption.ts";
import {
  getAdminConsentUrl,
  exchangeAdminConsentCode,
  getCustomerId,
} from "../services/google-directory.ts";
import { syncGoogleDirectory } from "../services/directory-sync.ts";

const directory = new Hono();

// All routes require auth + admin
directory.use("/admin/directory/*", requireAuth, requireAdmin);

// ── List providers for tenant ──
directory.get("/admin/directory/providers", async (c) => {
  const tenantId = getEffectiveTenantId(c);

  const result = await query(
    `SELECT id, tenant_id, provider_type, display_name, domains,
            auto_join_enabled, auto_join_user_type, auto_join_user_level,
            auto_offboard_enabled, admin_email, google_customer_id,
            last_sync_at, last_sync_status, last_sync_error, is_active,
            created_at, updated_at
     FROM tenant_identity_providers
     WHERE tenant_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [tenantId]
  );

  return c.json({ data: result.rows });
});

// ── Create provider ──
directory.post("/admin/directory/providers", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const body = await c.req.json<{
    providerType: string;
    displayName: string;
    domains?: string[];
    autoJoinEnabled?: boolean;
    autoJoinUserType?: string;
    autoJoinUserLevel?: string;
    autoOffboardEnabled?: boolean;
  }>();

  const id = crypto.randomUUID();
  const result = await query(
    `INSERT INTO tenant_identity_providers
       (id, tenant_id, provider_type, display_name, domains,
        auto_join_enabled, auto_join_user_type, auto_join_user_level,
        auto_offboard_enabled, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     RETURNING *`,
    [
      id,
      tenantId,
      body.providerType,
      body.displayName,
      body.domains ?? [],
      body.autoJoinEnabled ?? false,
      body.autoJoinUserType ?? null,
      body.autoJoinUserLevel ?? null,
      body.autoOffboardEnabled ?? false,
      user.sub,
    ]
  );

  return c.json(result.rows[0], 201);
});

// ── Get provider details ──
directory.get("/admin/directory/providers/:id", async (c) => {
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");

  const result = await query(
    `SELECT id, tenant_id, provider_type, display_name, domains,
            auto_join_enabled, auto_join_user_type, auto_join_user_level,
            auto_offboard_enabled, admin_email, google_customer_id,
            last_sync_at, last_sync_status, last_sync_error, is_active,
            created_at, updated_at
     FROM tenant_identity_providers
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId]
  );

  if (!result.rows[0]) {
    return c.json({ error: "Provider not found" }, 404);
  }

  return c.json(result.rows[0]);
});

// ── Update provider config ──
directory.put("/admin/directory/providers/:id", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");
  const body = await c.req.json<{
    displayName?: string;
    domains?: string[];
    autoJoinEnabled?: boolean;
    autoJoinUserType?: string;
    autoJoinUserLevel?: string;
    autoOffboardEnabled?: boolean;
    isActive?: boolean;
  }>();

  const setClauses: string[] = ["updated_at = now()", "updated_by = $3"];
  const params: unknown[] = [id, tenantId, user.sub];
  let paramIdx = 4;

  const fieldMap: Record<string, string> = {
    displayName: "display_name",
    domains: "domains",
    autoJoinEnabled: "auto_join_enabled",
    autoJoinUserType: "auto_join_user_type",
    autoJoinUserLevel: "auto_join_user_level",
    autoOffboardEnabled: "auto_offboard_enabled",
    isActive: "is_active",
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    const value = body[key as keyof typeof body];
    if (value !== undefined) {
      setClauses.push(`${column} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  }

  const result = await query(
    `UPDATE tenant_identity_providers
     SET ${setClauses.join(", ")}
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    params
  );

  if (!result.rows[0]) {
    return c.json({ error: "Provider not found" }, 404);
  }

  return c.json(result.rows[0]);
});

// ── Soft-delete provider ──
directory.delete("/admin/directory/providers/:id", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");

  const result = await query(
    `UPDATE tenant_identity_providers
     SET deleted_at = now(), deleted_by = $3, updated_at = now(), updated_by = $3
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [id, tenantId, user.sub]
  );

  if (result.rowCount === 0) {
    return c.json({ error: "Provider not found" }, 404);
  }

  return c.json({ success: true });
});

// ── Google admin consent: redirect ──
directory.get("/admin/directory/connect/google", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const providerId = c.req.query("provider_id");

  if (!providerId) {
    return c.json({ error: "provider_id is required" }, 400);
  }

  const key = await getJwtKey();
  const statePayload = JSON.stringify({
    tenantId,
    providerId,
    userId: user.sub,
    ts: Date.now(),
  });
  const encoded = Buffer.from(statePayload).toString("base64url");
  const sig = createHmac("sha256", key).update(encoded).digest("base64url");
  const state = `${encoded}.${sig}`;

  const url = await getAdminConsentUrl(state);
  return c.json({ url });
});

// ── Google admin consent: callback ──
directory.get("/admin/directory/callback/google", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");

  const frontendBase =
    process.env.RP_ORIGIN || "https://oasis.papaya.asia";

  if (error) {
    return c.redirect(
      `${frontendBase}/admin?tab=settings&error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !stateParam) {
    return c.redirect(`${frontendBase}/admin?tab=settings&error=missing_params`);
  }

  // Verify state
  const [encoded, signature] = stateParam.split(".");
  if (!encoded || !signature) {
    return c.redirect(`${frontendBase}/admin?tab=settings&error=invalid_state`);
  }

  const key = await getJwtKey();
  const expectedSig = createHmac("sha256", key)
    .update(encoded)
    .digest("base64url");

  if (expectedSig !== signature) {
    return c.redirect(`${frontendBase}/admin?tab=settings&error=invalid_state`);
  }

  const stateData = JSON.parse(
    Buffer.from(encoded, "base64url").toString()
  ) as {
    tenantId: string;
    providerId: string;
    userId: string;
    ts: number;
  };

  try {
    const { accessToken, refreshToken, email } =
      await exchangeAdminConsentCode(code);

    // Get the Google customer ID
    const customerId = await getCustomerId(accessToken);

    // Encrypt and store the refresh token
    const encryptedToken = await encryptToken(refreshToken);

    await query(
      `UPDATE tenant_identity_providers
       SET encrypted_refresh_token = $2,
           admin_email = $3,
           google_customer_id = $4,
           is_active = true,
           updated_at = now(),
           updated_by = $5
       WHERE id = $1 AND deleted_at IS NULL`,
      [
        stateData.providerId,
        encryptedToken,
        email,
        customerId,
        stateData.userId,
      ]
    );

    return c.redirect(
      `${frontendBase}/admin?tab=settings&connected=google`
    );
  } catch (err) {
    console.error("Google admin consent callback error:", err);
    return c.redirect(
      `${frontendBase}/admin?tab=settings&error=auth_failed`
    );
  }
});

// ── Trigger manual sync ──
directory.post("/admin/directory/providers/:id/sync", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);
  const id = c.req.param("id");

  // Verify provider belongs to tenant
  const check = await query(
    `SELECT id FROM tenant_identity_providers
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL AND is_active = true`,
    [id, tenantId]
  );
  if (!check.rows[0]) {
    return c.json({ error: "Provider not found" }, 404);
  }

  const result = await syncGoogleDirectory(id, user.sub, "manual");
  return c.json(result);
});

// ── Get sync logs ──
directory.get("/admin/directory/providers/:id/logs", async (c) => {
  const tenantId = getEffectiveTenantId(c);
  const providerId = c.req.param("id");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM directory_sync_logs
     WHERE provider_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [providerId, tenantId]
  );
  const total = parseInt(countResult.rows[0]!.count, 10);

  const result = await query(
    `SELECT id, trigger_type, triggered_by, status,
            users_fetched, users_created, users_updated,
            users_deactivated, users_skipped, errors_count,
            started_at, completed_at, duration_ms,
            error_message, error_details
     FROM directory_sync_logs
     WHERE provider_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     ORDER BY started_at DESC
     LIMIT $3 OFFSET $4`,
    [providerId, tenantId, limit, offset]
  );

  return c.json({
    data: result.rows,
    total,
    page,
    pageSize: limit,
    hasMore: page * limit < total,
  });
});

export default directory;
