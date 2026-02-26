import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authConfig } from "./config.ts";
import sso from "./routes/sso.ts";
import otp from "./routes/otp.ts";
import passkey from "./routes/passkey.ts";
import token from "./routes/token.ts";

const app = new Hono();

// Middleware
app.use(
  "*",
  cors({
    origin: [authConfig.rpOrigin, "http://localhost:3000"],
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
    allowMethods: ["GET", "POST", "OPTIONS"],
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

console.log(`Auth service starting on port ${authConfig.port}`);

export default {
  port: authConfig.port,
  fetch: app.fetch,
};
