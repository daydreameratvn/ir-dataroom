import { Hono } from "hono";
import { requireAuth } from "../middleware.ts";
import { query } from "../db/pool.ts";

const preferences = new Hono();

// GET /auth/me/preferences — return current user's preferences
preferences.get("/me/preferences", requireAuth, async (c) => {
  const user = c.get("user");

  const result = await query<{ preferences: Record<string, unknown> }>(
    `SELECT preferences FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [user.sub]
  );

  const row = result.rows[0];
  if (!row) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(row.preferences);
});

// PATCH /auth/me/preferences — shallow merge into user preferences
preferences.patch("/me/preferences", requireAuth, async (c) => {
  const user = c.get("user");
  const patch = await c.req.json<Record<string, unknown>>();

  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return c.json({ error: "Request body must be a JSON object" }, 400);
  }

  const result = await query<{ preferences: Record<string, unknown> }>(
    `UPDATE users
     SET preferences = preferences || $2::jsonb,
         updated_at = now(),
         updated_by = $1
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING preferences`,
    [user.sub, JSON.stringify(patch)]
  );

  const row = result.rows[0];
  if (!row) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(row.preferences);
});

export default preferences;
