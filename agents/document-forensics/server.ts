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

// ── Temp file helpers ───────────────────────────────────────────────────────

function writeTempFile(data: Buffer | Uint8Array, ext: string): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const filePath = join(TMP_DIR, `${randomUUID()}${ext}`);
  writeFileSync(filePath, data);
  return filePath;
}

function cleanupTempFile(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Extract image from request body. Supports:
 *   - multipart/form-data  → file upload in "image" field, JSON options in "options" field
 *   - application/json     → { image_base64, image_path, ...options }
 *
 * Returns the parsed options + a tempFile path to clean up (if created).
 */
async function extractImage<T extends Record<string, unknown>>(
  req: Request,
): Promise<{ opts: T; tempFile?: string }> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image");
    const optionsRaw = form.get("options");

    if (!file || !(file instanceof File)) {
      return { opts: {} as T };
    }

    const ext = extFromMime(file.type) || extFromName(file.name) || ".img";
    const buf = Buffer.from(await file.arrayBuffer());
    const tempFile = writeTempFile(buf, ext);
    const opts = optionsRaw ? (JSON.parse(String(optionsRaw)) as T) : ({} as T);
    (opts as Record<string, unknown>).image_path = tempFile;
    return { opts, tempFile };
  }

  // JSON body (base64 or image_path)
  const body = (await req.json()) as T & { image_base64?: string; content_type?: string };
  if (!body.image_path && body.image_base64) {
    const buf = Buffer.from(body.image_base64, "base64");
    const ext = body.content_type
      ? extFromMime(body.content_type)
      : detectImageExt(buf);
    const tempFile = writeTempFile(buf, ext || ".png");
    (body as Record<string, unknown>).image_path = tempFile;
    delete body.image_base64;
    delete body.content_type;
    return { opts: body, tempFile };
  }

  return { opts: body };
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("pdf")) return ".pdf";
  if (mime.includes("tiff")) return ".tiff";
  return "";
}

/** Detect image format from magic bytes */
function detectImageExt(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ".png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return ".jpg";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return ".webp";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return ".pdf";
  if ((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d)) return ".tiff";
  if (buf[0] === 0x42 && buf[1] === 0x4d) return ".bmp";
  return ".png"; // default fallback
}

function extFromName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
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

// ── Route handlers ──────────────────────────────────────────────────────────

async function handleAnalyzeRoute(req: Request): Promise<Response> {
  const { opts, tempFile } = await extractImage<AnalyzeRequest>(req);

  try {
    const result = await handleAnalyze(opts);
    return jsonResponse(result, result.success ? 200 : 422);
  } finally {
    if (tempFile) cleanupTempFile(tempFile);
  }
}

async function handleBatchRoute(req: Request): Promise<Response> {
  const body = (await req.json()) as BatchRequest;
  const result = await handleBatch(body);
  return jsonResponse(result, result.success ? 200 : 422);
}

async function handleExtractRoute(req: Request): Promise<Response> {
  const { opts, tempFile } = await extractImage<ExtractFieldsRequest>(req);

  try {
    const result = await handleExtractFields(opts);
    return jsonResponse(result, result.success ? 200 : 422);
  } finally {
    if (tempFile) cleanupTempFile(tempFile);
  }
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
