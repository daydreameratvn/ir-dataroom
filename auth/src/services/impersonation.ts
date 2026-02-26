import { query } from "../db/pool.ts";

export async function logImpersonation(opts: {
  tenantId: string;
  impersonatorId: string;
  targetUserId: string;
  sessionId?: string;
  action: "start" | "end";
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await query(
    `INSERT INTO impersonation_logs (tenant_id, impersonator_id, target_user_id, session_id, action, ip_address, user_agent, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $2, $2)`,
    [
      opts.tenantId,
      opts.impersonatorId,
      opts.targetUserId,
      opts.sessionId ?? null,
      opts.action,
      opts.ipAddress ?? null,
      opts.userAgent ?? null,
    ]
  );
}
