import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authConfig } from "./config.ts";
import sso from "./routes/sso.ts";
import otp from "./routes/otp.ts";
import passkey from "./routes/passkey.ts";
import token from "./routes/token.ts";
import fatima from "./routes/fatima.ts";
import preferences from "./routes/preferences.ts";
import admin from "./routes/admin.ts";
import errorRoutes from "./routes/errors.ts";
import statusRoutes from "./routes/status.ts";
import drone from "./routes/drone.ts";
import fwa from "./routes/fwa.ts";
import ir from "./routes/ir.ts";
import phoenix from "./routes/phoenix.ts";
import workosRoutes from "./routes/workos.ts";
import directoryRoutes from "./routes/directory.ts";
import portal from "./routes/portal.ts";
import members from "./routes/members.ts";
import domains from "./routes/domains.ts";
import activityLogs from "./routes/activity-logs.ts";
import { maktub } from "./routes/maktub.ts";
import { startSyncScheduler } from "./services/sync-scheduler.ts";

const app = new Hono();

// Middleware
app.use(
  "*",
  cors({
    origin: [authConfig.rpOrigin, "http://localhost:3000", "http://localhost:3003", "http://oasis.localhost:1355", "https://investors.papaya.asia", "https://phoenix.papaya.asia"],
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["X-Session-Id"],
  })
);
app.use("*", logger());

// Health check — use ?deep=true to verify DB connectivity
app.get("/auth/health", async (c) => {
  const deep = c.req.query("deep") === "true";
  const result: Record<string, unknown> = {
    status: "ok",
    service: "auth",
    timestamp: new Date().toISOString(),
  };

  if (deep) {
    const { checkDbConnection } = await import("./db/pool.ts");
    const dbOk = await checkDbConnection();
    result.database = dbOk ? "connected" : "unreachable";
    if (!dbOk) result.status = "degraded";
  }

  const statusCode = result.status === "ok" ? 200 : 503;
  return c.json(result, statusCode);
});

// Routes
app.route("/auth", sso);
app.route("/auth", otp);
app.route("/auth", passkey);
app.route("/auth", token);
app.route("/auth", fatima);
app.route("/auth", preferences);
app.route("/auth", admin);
app.route("/auth", errorRoutes);
app.route("/auth", statusRoutes);
app.route("/auth", drone);
app.route("/auth", fwa);
app.route("/auth", ir);
app.route("/auth", phoenix);
app.route("/auth", workosRoutes);
app.route("/auth", directoryRoutes);
app.route("/auth", portal);
app.route("/auth", members);
app.route("/auth", domains);
app.route("/auth", activityLogs);
app.route("/auth", maktub);

// ---------------------------------------------------------------------------
// Global error handler — distinguishes DB outages from other errors
// ---------------------------------------------------------------------------
function isDbConnectionError(err: unknown): boolean {
  // Check error.code (Node.js/Bun system errors set this directly)
  if (typeof err === "object" && err !== null) {
    const code = (err as Record<string, unknown>).code;
    if (typeof code === "string" && /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(code)) {
      return true;
    }
  }
  // Fallback: check error message text
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection terminated|Connection terminated|cannot connect|too many clients|timeout expired/i.test(msg);
}

app.onError(async (err, c) => {
  const dbDown = isDbConnectionError(err);
  const status = dbDown ? 503 : 500;
  const message = dbDown
    ? "Database temporarily unavailable"
    : "Internal server error";

  console.error(
    dbDown ? "[DB DOWN]" : "[ERROR]",
    `${c.req.method} ${c.req.path}:`,
    err,
  );

  // Only attempt DB-based error reporting if DB is NOT down
  if (!dbDown) {
    try {
      const { upsertErrorReport, generateFingerprint } = await import("./services/error-report.ts");
      await upsertErrorReport({
        source: "backend_unhandled",
        message: err.message,
        stackTrace: err.stack,
        endpoint: `${c.req.method} ${c.req.path}`,
        fingerprint: generateFingerprint("backend_unhandled", err.message, err.stack),
        userAgent: c.req.header("user-agent"),
        ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      });
    } catch { /* don't crash on error reporting failure */ }
  }

  return c.json({ error: message }, status);
});

console.log(`Auth service starting on port ${authConfig.port}`);

// Start background directory sync scheduler when a database connection is available
// (sync still uses direct pg — skip when running without DATABASE_URL)
if (process.env.NODE_ENV !== "test" && (process.env.DATABASE_URL || process.env.DB_SECRET_NAME)) {
  startSyncScheduler();
}

export default {
  port: authConfig.port,
  fetch: app.fetch,
};
