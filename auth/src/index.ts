import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authConfig } from "./config.ts";
import sso from "./routes/sso.ts";
import otp from "./routes/otp.ts";
import passkey from "./routes/passkey.ts";
import token from "./routes/token.ts";
import fatima from "./routes/fatima.ts";
import admin from "./routes/admin.ts";
import errorRoutes from "./routes/errors.ts";
import statusRoutes from "./routes/status.ts";
import drone from "./routes/drone.ts";
import fwa from "./routes/fwa.ts";
import ir from "./routes/ir.ts";

const app = new Hono();

// Middleware
app.use(
  "*",
  cors({
    origin: [authConfig.rpOrigin, "http://localhost:3000", "https://investors.papaya.asia"],
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);
app.use("*", logger());

// Health check
app.get("/auth/health", (c) => {
  return c.json({ status: "ok", service: "auth", timestamp: new Date().toISOString() });
});

// Routes
app.route("/auth", sso);
app.route("/auth", otp);
app.route("/auth", passkey);
app.route("/auth", token);
app.route("/auth", fatima);
app.route("/auth", admin);
app.route("/auth", errorRoutes);
app.route("/auth", statusRoutes);
app.route("/auth", drone);
app.route("/auth", fwa);
app.route("/auth", ir);

// Global error handler — auto-reports unhandled errors
app.onError(async (err, c) => {
  console.error("Unhandled error:", err);
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
  return c.json({ error: "Internal server error" }, 500);
});

console.log(`Auth service starting on port ${authConfig.port}`);

export default {
  port: authConfig.port,
  fetch: app.fetch,
};
