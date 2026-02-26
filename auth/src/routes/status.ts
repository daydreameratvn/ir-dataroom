import { Hono } from "hono";
import { query } from "../db/pool.ts";

const status = new Hono();

type ServiceStatus = "operational" | "degraded" | "outage" | "maintenance";

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  message?: string;
}

interface IncidentSummary {
  id: string;
  title: string;
  status: string;
  severity: string;
  source: string;
  createdAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
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
    "https://banyan-prod.ddn.hasura.app/graphql";
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

async function getRecentIncidents(): Promise<IncidentSummary[]> {
  try {
    const result = await query<{
      id: string;
      message: string;
      status: string;
      severity: string;
      source: string;
      created_at: string;
      last_seen_at: string;
      occurrence_count: number;
    }>(
      `SELECT id, message, status, severity, source, created_at, last_seen_at, occurrence_count
       FROM error_reports
       WHERE deleted_at IS NULL
         AND severity IN ('critical', 'error')
         AND created_at > now() - interval '7 days'
       ORDER BY last_seen_at DESC
       LIMIT 10`
    );

    return result.rows.map((r) => ({
      id: r.id,
      title: r.message,
      status: r.status,
      severity: r.severity,
      source: r.source,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      occurrenceCount: r.occurrence_count,
    }));
  } catch {
    return [];
  }
}

// GET /status — Public system status (no auth required)
status.get("/status", async (c) => {
  // Run health checks concurrently
  const [platform, db, hasura, bedrock, incidents] = await Promise.all([
    checkPlatform(),
    checkDatabase(),
    checkHasura(),
    checkBedrock(),
    getRecentIncidents(),
  ]);

  // Auth service is operational if we're responding
  const auth: ServiceHealth = {
    name: "Authentication",
    status: "operational",
    latencyMs: 0,
  };

  const services = [platform, auth, hasura, bedrock, db];

  return c.json({
    services,
    incidents,
    checkedAt: new Date().toISOString(),
  });
});

export default status;
