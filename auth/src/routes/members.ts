import { Hono } from "hono";
import {
  requireAuth,
  requireAdmin,
  getEffectiveTenantId,
} from "../middleware.ts";
import { gqlQuery } from "../services/gql.ts";

const members = new Hono();

members.use("/admin/members/*", requireAuth, requireAdmin);

// GET /auth/admin/members — List members with pagination
members.get("/admin/members", async (c) => {
  const tenantId = getEffectiveTenantId(c);

  const search = c.req.query("search");
  const status = c.req.query("status");
  const source = c.req.query("source");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = {
    tenantId: { _eq: tenantId },
    deletedAt: { _is_null: true },
  };

  if (search) {
    const pattern = `%${search}%`;
    where._or = [{ email: { _ilike: pattern } }];
  }

  if (status) {
    where.status = { _eq: status };
  }

  if (source) {
    where.source = { _eq: source };
  }

  const data = await gqlQuery<{
    tenantMembersAggregate: { _count: number };
    tenantMembers: Array<{
      id: string;
      tenantId: string;
      userId: string | null;
      email: string;
      status: string;
      source: string | null;
      invitedBy: string | null;
      invitedAt: string | null;
      joinedAt: string | null;
      removedAt: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }>(`
    query ListMembers($where: TenantMembersBoolExp!, $limit: Int!, $offset: Int!, $filterInput: TenantMembersFilterInput) {
      tenantMembersAggregate(filter_input: $filterInput) { _count }
      tenantMembers(
        where: $where, limit: $limit, offset: $offset,
        order_by: [{ createdAt: Desc }]
      ) {
        id tenantId userId email status source
        invitedBy invitedAt joinedAt removedAt
        createdAt updatedAt
      }
    }
  `, { where, limit, offset, filterInput: { where } });

  const total = data.tenantMembersAggregate._count;

  return c.json({
    data: data.tenantMembers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// POST /auth/admin/members/invite — Invite members
members.post("/admin/members/invite", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);

  const body = await c.req.json<{ emails: string[]; source?: string }>();

  if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
    return c.json({ error: "emails array is required" }, 400);
  }

  const now = new Date().toISOString();
  let invited = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const email of body.emails) {
    try {
      // Check if member already exists for this tenant
      const existing = await gqlQuery<{
        tenantMembers: Array<{ id: string }>;
      }>(`
        query CheckExistingMember($tenantId: Uuid!, $email: String1!) {
          tenantMembers(
            where: { tenantId: { _eq: $tenantId }, email: { _eq: $email }, deletedAt: { _is_null: true } }
            limit: 1
          ) { id }
        }
      `, { tenantId, email });

      if (existing.tenantMembers.length > 0) {
        skipped++;
        continue;
      }

      await gqlQuery(`
        mutation InviteMember($object: InsertTenantMembersObjectInput!) {
          insertTenantMembers(objects: [$object]) { affectedRows }
        }
      `, {
        object: {
          tenantId,
          email,
          status: "invited",
          source: body.source || "manual",
          invitedBy: user.sub,
          invitedAt: now,
          createdBy: user.sub,
          updatedBy: user.sub,
        },
      });

      invited++;
    } catch (err) {
      errors.push(`Failed to invite ${email}: ${(err as Error).message}`);
    }
  }

  return c.json({ invited, skipped, errors });
});

// POST /auth/admin/members/import — Import from CSV
members.post("/admin/members/import", async (c) => {
  const user = c.get("user");
  const tenantId = getEffectiveTenantId(c);

  const body = await c.req.json<{ emails: string[]; source?: string }>();

  if (!body.emails || !Array.isArray(body.emails) || body.emails.length === 0) {
    return c.json({ error: "emails array is required" }, 400);
  }

  const now = new Date().toISOString();
  let invited = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const email of body.emails) {
    try {
      const existing = await gqlQuery<{
        tenantMembers: Array<{ id: string }>;
      }>(`
        query CheckExistingMember($tenantId: Uuid!, $email: String1!) {
          tenantMembers(
            where: { tenantId: { _eq: $tenantId }, email: { _eq: $email }, deletedAt: { _is_null: true } }
            limit: 1
          ) { id }
        }
      `, { tenantId, email });

      if (existing.tenantMembers.length > 0) {
        skipped++;
        continue;
      }

      await gqlQuery(`
        mutation ImportMember($object: InsertTenantMembersObjectInput!) {
          insertTenantMembers(objects: [$object]) { affectedRows }
        }
      `, {
        object: {
          tenantId,
          email,
          status: "invited",
          source: body.source || "csv",
          invitedBy: user.sub,
          invitedAt: now,
          createdBy: user.sub,
          updatedBy: user.sub,
        },
      });

      invited++;
    } catch (err) {
      errors.push(`Failed to import ${email}: ${(err as Error).message}`);
    }
  }

  return c.json({ invited, skipped, errors });
});

// PUT /auth/admin/members/:memberId/status — Update member status
members.put("/admin/members/:memberId/status", async (c) => {
  const user = c.get("user");
  const memberId = c.req.param("memberId");

  const body = await c.req.json<{ status: string }>();

  if (!body.status) {
    return c.json({ error: "status is required" }, 400);
  }

  const now = new Date().toISOString();

  await gqlQuery(`
    mutation UpdateMemberStatus($keyId: Uuid!, $updateColumns: UpdateTenantMembersByIdUpdateColumnsInput!) {
      updateTenantMembersById(keyId: $keyId, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: memberId,
    updateColumns: {
      status: { set: body.status },
      updatedAt: { set: now },
      updatedBy: { set: user.sub },
    },
  });

  return c.json({ success: true });
});

// DELETE /auth/admin/members/:memberId — Soft delete member
members.delete("/admin/members/:memberId", async (c) => {
  const user = c.get("user");
  const memberId = c.req.param("memberId");

  const now = new Date().toISOString();

  await gqlQuery(`
    mutation SoftDeleteMember($keyId: Uuid!, $updateColumns: UpdateTenantMembersByIdUpdateColumnsInput!) {
      updateTenantMembersById(keyId: $keyId, updateColumns: $updateColumns) {
        affectedRows
      }
    }
  `, {
    keyId: memberId,
    updateColumns: {
      deletedAt: { set: now },
      deletedBy: { set: user.sub },
      updatedAt: { set: now },
      updatedBy: { set: user.sub },
    },
  });

  return c.json({ success: true });
});

export default members;
