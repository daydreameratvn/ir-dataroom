import { Hono } from "hono";
import {
  requireAuth,
  requireAdmin,
  getEffectiveTenantId,
} from "../middleware.ts";
import { gqlQuery } from "../services/gql.ts";

const activityLogs = new Hono();

activityLogs.use("/admin/activity-logs", requireAuth, requireAdmin);

// GET /auth/admin/activity-logs — List activity logs
activityLogs.get("/admin/activity-logs", async (c) => {
  const tenantId = getEffectiveTenantId(c);

  const action = c.req.query("action");
  const resourceType = c.req.query("resource_type");
  const page = parseInt(c.req.query("page") || "1", 10);
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 100);
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = {
    tenantId: { _eq: tenantId },
    deletedAt: { _is_null: true },
  };

  if (action) {
    where.action = { _eq: action };
  }

  if (resourceType) {
    where.resourceType = { _eq: resourceType };
  }

  const data = await gqlQuery<{
    tenantActivityLogsAggregate: { _count: number };
    tenantActivityLogs: Array<{
      id: string;
      tenantId: string;
      actorId: string;
      action: string;
      description: string | null;
      resourceType: string | null;
      resourceId: string | null;
      metadata: unknown | null;
      createdAt: string;
    }>;
  }>(`
    query ListActivityLogs($where: TenantActivityLogsBoolExp!, $limit: Int!, $offset: Int!, $filterInput: TenantActivityLogsFilterInput) {
      tenantActivityLogsAggregate(filter_input: $filterInput) { _count }
      tenantActivityLogs(
        where: $where, limit: $limit, offset: $offset,
        order_by: [{ createdAt: Desc }]
      ) {
        id tenantId actorId action description
        resourceType resourceId metadata createdAt
      }
    }
  `, { where, limit, offset, filterInput: { where } });

  const total = data.tenantActivityLogsAggregate._count;

  return c.json({
    data: data.tenantActivityLogs,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export default activityLogs;
