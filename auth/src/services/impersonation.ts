import { gqlQuery } from "./gql.ts";

export async function logImpersonation(opts: {
  tenantId: string;
  impersonatorId: string;
  targetUserId: string;
  sessionId?: string;
  action: "start" | "end";
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await gqlQuery(`
    mutation LogImpersonation($object: InsertImpersonationLogsObjectInput!) {
      insertImpersonationLogs(objects: [$object]) { affectedRows }
    }
  `, {
    object: {
      tenantId: opts.tenantId,
      impersonatorId: opts.impersonatorId,
      targetUserId: opts.targetUserId,
      sessionId: opts.sessionId ?? null,
      action: opts.action,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      createdBy: opts.impersonatorId,
      updatedBy: opts.impersonatorId,
    },
  });
}
