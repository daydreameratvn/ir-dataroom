/**
 * Bun HTTP server for the document forensics service.
 *
 * Endpoints:
 *   GET  /forensics/health   — readiness probe (503 until warmup completes)
 *   POST /forensics/analyze  — single document analysis
 *   POST /forensics/batch    — parallel batch analysis
 *   POST /forensics/extract  — OCR-only field extraction
 */

import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { handleAnalyze, handleBatch, handleExtractFields } from "./handler.ts";
import type { AnalyzeRequest, BatchRequest, ExtractFieldsRequest } from "./handler.ts";
import { checkPythonAvailable, checkTruForWeights } from "./bridge/python-bridge.ts";

const PORT = Number(process.env.PORT ?? 4001);
const TMP_DIR = "/tmp/forensics";

// ── SSM-based secret loading ────────────────────────────────────────────────

async function loadGeminiKeyFromSSM(): Promise<void> {
  if (process.env.GEMINI_API_KEY) return; // local env takes precedence

  try {
    const { SSMClient, GetParameterCommand } = await import("@aws-sdk/client-ssm");
    const ssm = new SSMClient({ region: process.env.AWS_REGION ?? "ap-southeast-1" });
    const resp = await ssm.send(
      new GetParameterCommand({
        Name: "/banyan/forensics/gemini-api-key",
        WithDecryption: true,
      }),
    );
    if (resp.Parameter?.Value) {
      process.env.GEMINI_API_KEY = resp.Parameter.Value;
      console.log("[server] GEMINI_API_KEY loaded from SSM");
    }
  } catch (err) {
    console.warn("[server] Failed to load GEMINI_API_KEY from SSM:", err);
  }
}

// ── Warmup state ────────────────────────────────────────────────────────────

let ready = false;

async function warmup(): Promise<void> {
  console.log("[server] Running warmup checks...");

  await loadGeminiKeyFromSSM();

  const pythonOk = await checkPythonAvailable();
  console.log(`[server]   Python available: ${pythonOk}`);

  const weightsOk = checkTruForWeights();
  console.log(`[server]   TruFor weights:   ${weightsOk}`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn("[server]   GEMINI_API_KEY not set — OCR will fail");
  }

  ready = pythonOk && weightsOk;
  console.log(`[server] Warmup complete. Ready: ${ready}`);
}

// ── Base64 → temp file helper ───────────────────────────────────────────────

function base64ToTempFile(b64: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const filePath = join(TMP_DIR, `${randomUUID()}.img`);
  const buffer = Buffer.from(b64, "base64");
  writeFileSync(filePath, buffer);
  return filePath;
}

function cleanupTempFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // ignore cleanup errors
  }
}

// ── JSON helpers ────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}

async function parseJsonBody<T>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleAnalyzeRoute(req: Request): Promise<Response> {
  const body = await parseJsonBody<AnalyzeRequest & { image_base64?: string }>(req);
  let tempFile: string | undefined;

  try {
    if (!body.image_path && body.image_base64) {
      tempFile = base64ToTempFile(body.image_base64);
      body.image_path = tempFile;
    }

    const result = await handleAnalyze(body);
    return jsonResponse(result, result.success ? 200 : 422);
  } finally {
    if (tempFile) cleanupTempFile(tempFile);
  }
}

async function handleBatchRoute(req: Request): Promise<Response> {
  const body = await parseJsonBody<BatchRequest>(req);
  const result = await handleBatch(body);
  return jsonResponse(result, result.success ? 200 : 422);
}

async function handleExtractRoute(req: Request): Promise<Response> {
  const body = await parseJsonBody<ExtractFieldsRequest>(req);
  const result = await handleExtractFields(body);
  return jsonResponse(result, result.success ? 200 : 422);
}

// ── Server ──────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Health check
    if (path === "/forensics/health" && method === "GET") {
      return ready
        ? jsonResponse({ status: "ok" })
        : errorResponse("Service warming up", 503);
    }

    // Analyze
    if (path === "/forensics/analyze" && method === "POST") {
      return handleAnalyzeRoute(req);
    }

    // Batch
    if (path === "/forensics/batch" && method === "POST") {
      return handleBatchRoute(req);
    }

    // Extract
    if (path === "/forensics/extract" && method === "POST") {
      return handleExtractRoute(req);
    }

    return errorResponse("Not Found", 404);
  },
});

console.log(`[server] Document forensics listening on port ${server.port}`);

// Run warmup in the background — server is already accepting connections
warmup();
