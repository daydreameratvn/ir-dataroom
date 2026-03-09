import { Hono } from "hono";
import { query } from "../db/pool.ts";
import { requireAuth, requireAdmin } from "../middleware.ts";
import {
  createIncident,
  getIncidentById,
  listIncidents,
  listActiveIncidents,
  updateIncident,
  resolveIncident,
  softDeleteIncident,
  postUpdate,
} from "../services/status-incident.ts";
import { recordSnapshot, getDailyStatusHistory } from "../services/status-snapshot.ts";
import {
  getActiveOverrides,
  setOverride,
  clearOverride,
} from "../services/status-override.ts";

const status = new Hono();

type ServiceStatus = "operational" | "degraded" | "outage" | "maintenance";

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

async function checkDatabase(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await query("SELECT 1");
    return {
      name: "Database",
      status: "operational",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: "Database",
      status: "outage",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

async function checkHasura(): Promise<ServiceHealth> {
  const endpoint =
    process.env.HASURA_ENDPOINT ||
    "https://banyan.services.papaya.asia/graphql";
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    if (resp.ok) {
      return { name: "API Gateway", status: "operational", latencyMs };
    }
    return {
      name: "API Gateway",
      status: resp.status >= 500 ? "outage" : "degraded",
      latencyMs,
      message: `HTTP ${resp.status}`,
    };
  } catch (err) {
    return {
      name: "API Gateway",
      status: "outage",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Unreachable",
    };
  }
}

async function checkBedrock(): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      "@aws-sdk/client-bedrock-runtime"
    );
    const client = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || "us-east-1",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Minimal invocation to test Bedrock connectivity
    await client.send(
      new InvokeModelCommand({
        modelId: "anthropic.claude-instant-v1",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
      { abortSignal: controller.signal }
    );
    clearTimeout(timeout);

    return {
      name: "AI Agents",
      status: "operational",
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : "Unreachable";

    // Distinguish between "model not found" (service is up) vs real failures
    if (
      message.includes("is not authorized") ||
      message.includes("not found") ||
      message.includes("AccessDeniedException")
    ) {
      return {
        name: "AI Agents",
        status: "operational",
        latencyMs,
        message: "Bedrock reachable (auth-only check)",
      };
    }

    // Timeout or network error = degraded/outage
    return {
      name: "AI Agents",
      status: latencyMs > 6000 ? "degraded" : "outage",
      latencyMs,
      message,
    };
  }
}

async function checkPlatform(): Promise<ServiceHealth> {
  const url =
    process.env.PLATFORM_URL || "https://d2y563mglh62j8.cloudfront.net";
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;
    if (resp.ok || resp.status === 304) {
      return { name: "Platform", status: "operational", latencyMs };
    }
    return {
      name: "Platform",
      status: resp.status >= 500 ? "outage" : "degraded",
      latencyMs,
      message: `HTTP ${resp.status}`,
    };
  } catch (err) {
    return {
      name: "Platform",
      status: "outage",
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : "Unreachable",
    };
  }
}

// GET /status — Public system status (no auth required)
status.get("/status", async (c) => {
  // Run health checks and fetch data concurrently
  const [platform, db, hasura, bedrock, incidents, uptimeHistory, overrides] =
    await Promise.all([
      checkPlatform(),
      checkDatabase(),
      checkHasura(),
      checkBedrock(),
      listActiveIncidents(),
      getDailyStatusHistory(90),
      getActiveOverrides(),
    ]);

  // Auth service is operational if we're responding
  const auth: ServiceHealth = {
    name: "Authentication",
    status: "operational",
    latencyMs: 0,
  };

  let services: ServiceHealth[] = [platform, auth, hasura, bedrock, db];

  // Apply active overrides — override status wins over live check
  const overrideMap = new Map(overrides.map((o) => [o.serviceName, o]));
  services = services.map((svc) => {
    const override = overrideMap.get(svc.name);
    if (override) {
      return {
        ...svc,
        status: override.status as ServiceStatus,
        message: override.reason ?? svc.message,
      };
    }
    return svc;
  });

  // Record snapshot (non-blocking, throttled)
  recordSnapshot(
    services.map((s) => ({ name: s.name, status: s.status, latencyMs: s.latencyMs }))
  );

  return c.json({
    services,
    incidents,
    uptimeHistory,
    overrides,
    checkedAt: new Date().toISOString(),
  });
});

// ── Admin routes ──

const admin = new Hono();
admin.use("*", requireAuth, requireAdmin);

// GET /incidents — List incidents (paginated)
admin.get("/", async (c) => {
  const statusFilter = c.req.query("status");
  const severity = c.req.query("severity");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const limit = parseInt(c.req.query("limit") ?? "20", 10);

  const result = await listIncidents({ status: statusFilter, severity, page, limit });
  return c.json(result);
});

// POST /incidents — Create incident
admin.post("/", async (c) => {
  const body = await c.req.json<{
    title: string;
    description?: string;
    severity: string;
    affectedServices: string[];
    startedAt?: string;
  }>();

  if (!body.title || !body.severity || !body.affectedServices) {
    return c.json({ error: "title, severity, and affectedServices are required" }, 400);
  }

  const user = c.get("user");
  const incident = await createIncident(body, user.sub);
  return c.json(incident, 201);
});

// GET /incidents/overrides — List active overrides
admin.get("/overrides", async (c) => {
  const result = await getActiveOverrides();
  return c.json({ overrides: result });
});

// POST /incidents/overrides — Set service override
admin.post("/overrides", async (c) => {
  const body = await c.req.json<{
    serviceName: string;
    status: string;
    reason?: string;
    startsAt?: string;
    endsAt?: string;
  }>();

  if (!body.serviceName || !body.status) {
    return c.json({ error: "serviceName and status are required" }, 400);
  }

  const user = c.get("user");
  const override = await setOverride(body, user.sub);
  return c.json(override, 201);
});

// DELETE /incidents/overrides/:serviceName — Clear override
admin.delete("/overrides/:serviceName", async (c) => {
  const serviceName = c.req.param("serviceName");
  const user = c.get("user");
  const cleared = await clearOverride(serviceName, user.sub);
  if (!cleared) {
    return c.json({ error: "No active override found" }, 404);
  }
  return c.json({ ok: true });
});

// GET /incidents/:id — Get incident with updates
admin.get("/:id", async (c) => {
  const id = c.req.param("id");
  const incident = await getIncidentById(id);
  if (!incident) {
    return c.json({ error: "Incident not found" }, 404);
  }
  return c.json(incident);
});

// PUT /incidents/:id — Update incident metadata
admin.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    description?: string;
    severity?: string;
    affectedServices?: string[];
    status?: string;
  }>();

  const user = c.get("user");
  const incident = await updateIncident(id, body, user.sub);
  if (!incident) {
    return c.json({ error: "Incident not found" }, 404);
  }
  return c.json(incident);
});

// POST /incidents/:id/updates — Post timeline update
admin.post("/:id/updates", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ status: string; message: string }>();

  if (!body.status || !body.message) {
    return c.json({ error: "status and message are required" }, 400);
  }

  const user = c.get("user");
  const update = await postUpdate(id, body.status, body.message, user.sub);
  return c.json(update, 201);
});

// POST /incidents/:id/resolve — Resolve incident
admin.post("/:id/resolve", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const incident = await resolveIncident(id, user.sub);
  if (!incident) {
    return c.json({ error: "Incident not found" }, 404);
  }
  return c.json(incident);
});

// DELETE /incidents/:id — Soft delete
admin.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const deleted = await softDeleteIncident(id, user.sub);
  if (!deleted) {
    return c.json({ error: "Incident not found" }, 404);
  }
  return c.json({ ok: true });
});

// Mount admin routes under /incidents
status.route("/incidents", admin);

export default status;
