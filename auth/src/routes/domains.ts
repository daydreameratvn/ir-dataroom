import { Hono } from "hono";
import {
  requireAuth,
  requireAdmin,
  getEffectiveTenantId,
} from "../middleware.ts";
import { gqlQuery } from "../services/gql.ts";

const domains = new Hono();

domains.use("/admin/domains/*", requireAuth, requireAdmin);

// GET /auth/admin/domains — List all domains for tenant
domains.get("/admin/domains", async (c) => {
  const tenantId = getEffectiveTenantId(c);

  const data = await gqlQuery<{
    tenantDomains: Array<{
      id: string;
      tenantId: string;
      domain: string;
      verified: boolean;
      autoAdmit: boolean;
      verificationToken: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }>(`
    query ListDomains($tenantId: Uuid!) {
      tenantDomains(
        where: { tenantId: { _eq: $tenantId }, deletedAt: { _is_null: true } }
        order_by: [{ createdAt: Desc }]
      ) {
        id tenantId domain verified autoAdmit
        verificationToken createdAt updatedAt
      }
    }
  `, { tenantId });

  return c.json({ data: data.tenantDomains });
});

// POST /auth/admin/domains — Add domain
domains.post("/admin/domains", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);

  const body = await c.req.json<{ domain: string }>();

  if (!body.domain) {
    return c.json({ error: "domain is required" }, 400);
  }

  const verificationToken = crypto.randomUUID();

  const data = await gqlQuery<{
    insertTenantDomains: {
      returning: Array<{
        id: string;
        tenantId: string;
        domain: string;
        verified: boolean;
        autoAdmit: boolean;
        verificationToken: string;
        createdAt: string;
        updatedAt: string;
      }>;
    };
  }>(`
    mutation AddDomain($object: InsertTenantDomainsObjectInput!) {
      insertTenantDomains(objects: [$object]) {
        returning {
          id tenantId domain verified autoAdmit
          verificationToken createdAt updatedAt
        }
      }
    }
  `, {
    object: {
      tenantId,
      domain: body.domain,
      verified: false,
      autoAdmit: false,
      verificationToken,
      createdBy: user.sub,
      updatedBy: user.sub,
    },
  });

  return c.json(data.insertTenantDomains.returning[0], 201);
});

// POST /auth/admin/domains/:domainId/verify — Verify domain
domains.post("/admin/domains/:domainId/verify", async (c) => {
  const user = c.get("user");
  const domainId = c.req.param("domainId");

  const now = new Date().toISOString();

  const data = await gqlQuery<{
    updateTenantDomainsById: {
      returning: Array<{
        id: string;
        tenantId: string;
        domain: string;
        verified: boolean;
        autoAdmit: boolean;
        verificationToken: string | null;
        createdAt: string;
        updatedAt: string;
      }>;
    };
  }>(`
    mutation VerifyDomain($keyId: Uuid!, $updateColumns: UpdateTenantDomainsByIdUpdateColumnsInput!) {
      updateTenantDomainsById(keyId: $keyId, updateColumns: $updateColumns) {
        returning {
          id tenantId domain verified autoAdmit
          verificationToken createdAt updatedAt
        }
      }
    }
  `, {
    keyId: domainId,
    updateColumns: {
      verified: { set: true },
      updatedAt: { set: now },
      updatedBy: { set: user.sub },
    },
  });

  const domain = data.updateTenantDomainsById.returning[0];

  return c.json({ success: true, domain });
});

// PUT /auth/admin/domains/:domainId — Update domain settings
domains.put("/admin/domains/:domainId", async (c) => {
  const user = c.get("user");
  const domainId = c.req.param("domainId");

  const body = await c.req.json<{ auto_admit?: boolean }>();

  const now = new Date().toISOString();
  const updateColumns: Record<string, { set: unknown }> = {
    updatedAt: { set: now },
    updatedBy: { set: user.sub },
  };

  if (body.auto_admit !== undefined) {
    updateColumns.autoAdmit = { set: body.auto_admit };
  }

  await gqlQuery(`
    mutation UpdateDomain($keyId: Uuid!, $updateColumns: UpdateTenantDomainsByIdUpdateColumnsInput!) {
      updateTenantDomainsById(keyId: $keyId, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: domainId,
    updateColumns,
  });

  return c.json({ success: true });
});

// DELETE /auth/admin/domains/:domainId — Soft delete domain
domains.delete("/admin/domains/:domainId", async (c) => {
  const user = c.get("user");
  const domainId = c.req.param("domainId");

  const now = new Date().toISOString();

  await gqlQuery(`
    mutation SoftDeleteDomain($keyId: Uuid!, $updateColumns: UpdateTenantDomainsByIdUpdateColumnsInput!) {
      updateTenantDomainsById(keyId: $keyId, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: domainId,
    updateColumns: {
      deletedAt: { set: now },
      deletedBy: { set: user.sub },
      updatedAt: { set: now },
      updatedBy: { set: user.sub },
    },
  });

  return c.json({ success: true });
});

export default domains;
