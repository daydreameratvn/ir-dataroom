#!/usr/bin/env bun
/**
 * Document forensics backend test script.
 *
 * Usage:
 *   bun scripts/forensics-test.ts <folder> --market VN
 *   bun scripts/forensics-test.ts <folder> --market TH --url http://localhost:4001
 *   bun scripts/forensics-test.ts <folder> --market HK --endpoint extract
 *
 * Scans <folder> for image files, sends each to the forensics backend,
 * prints a summary report, and saves heatmap images to output/.
 */

import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length) {
    const val = args[i + 1]!;
    args.splice(i, 2);
    return val;
  }
  return fallback;
}

const BASE_URL = flag("url", "https://prod.banyan.services.papaya.asia");
const ENDPOINT = flag("endpoint", "analyze") as "analyze" | "extract";
const MARKET = flag("market", "");

const folder = args[0];
if (!folder || !MARKET) {
  console.error("Usage: bun scripts/forensics-test.ts <folder> --market VN|TH|HK|ID [--url <base>] [--endpoint analyze|extract]");
  process.exit(1);
}

const inputDir = resolve(folder);
const caseName = basename(inputDir);
const OUTPUT_BASE = "/Volumes/work/git/papaya-org/test-cases-v2-output";
const outputDir = join(OUTPUT_BASE, caseName);
mkdirSync(outputDir, { recursive: true });

// ── Image scanning ───────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".pdf"]);

function scanImages(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanImages(full));
    } else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files.sort();
}

const images = scanImages(inputDir);
if (images.length === 0) {
  console.error(`No images found in ${inputDir}`);
  process.exit(1);
}

console.log(`Found ${images.length} image(s) in ${inputDir}`);
console.log(`Backend: ${BASE_URL}/forensics/${ENDPOINT}`);
console.log(`Market:  ${MARKET}\n`);

// ── Call backend ─────────────────────────────────────────────────────────────

interface AnalyzeResult {
  success: boolean;
  verdict: string;
  overall_score: number;
  risk_level: string;
  trufor: { global_score: number; detection_score: number | null };
  image: { path: string; width: number; height: number };
  ocr_analysis: { total_fields: number; field_types_found: string[] };
  highest_risk_field: { type: string; text: string; scores: { anomaly: number; heatmap_mean: number; heatmap_max: number } } | null;
  fields: Array<{ type: string; text: string; confidence: number; scores: { anomaly: number; heatmap_mean: number; heatmap_max: number } }>;
  heatmap_b64?: string | null;
  notes: string[];
  ocr_engine?: string;
  error?: string;
}

interface ExtractResult {
  success: boolean;
  engine: string;
  document_type: string;
  image: { path: string; width: number; height: number };
  fields: Array<{ label: string; text: string; confidence: number; bbox: unknown; page_number?: number }>;
  total_fields: number;
  processing_time_ms: number;
  error?: string;
}

type Result = AnalyzeResult | ExtractResult;

interface ImageReport {
  file: string;
  sizeKb: number;
  result: Result;
  timeMs: number;
  heatmapSaved?: string;
}

async function processImage(imagePath: string): Promise<ImageReport> {
  const name = basename(imagePath);
  const sizeKb = Math.round(statSync(imagePath).size / 1024);
  const url = `${BASE_URL}/forensics/${ENDPOINT}`;

  console.log(`  Processing: ${name} (${sizeKb} KB)...`);

  const form = new FormData();
  const fileBytes = Bun.file(imagePath);
  form.append("image", fileBytes, name);
  form.append("options", JSON.stringify({ market: MARKET }));

  const start = Date.now();
  const resp = await fetch(url, { method: "POST", body: form });
  const timeMs = Date.now() - start;

  if (!resp.ok) {
    const text = await resp.text();
    console.log(`    ERROR: HTTP ${resp.status} — ${text.slice(0, 200)}`);
    return { file: name, sizeKb, result: { success: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` } as any, timeMs };
  }

  const result: Result = await resp.json();

  // Save heatmap if present (analyze endpoint only)
  let heatmapSaved: string | undefined;
  if ("heatmap_b64" in result && result.heatmap_b64) {
    const stem = basename(name, extname(name));
    const outPath = join(outputDir, `${stem}_summary.jpg`);
    writeFileSync(outPath, Buffer.from(result.heatmap_b64, "base64"));
    heatmapSaved = outPath;
    console.log(`    Summary saved: ${outPath} (${Math.round(Buffer.from(result.heatmap_b64, "base64").length / 1024)} KB)`);
  }

  // Save JSON result (without heatmap_b64)
  if ("heatmap_b64" in result) {
    const jsonResult = { ...result, heatmap_b64: undefined };
    const stem = basename(name, extname(name));
    writeFileSync(join(outputDir, `${stem}.json`), JSON.stringify(jsonResult, null, 2));
  }

  return { file: name, sizeKb, result, timeMs, heatmapSaved };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const reports: ImageReport[] = [];
const totalStart = Date.now();

for (const img of images) {
  const report = await processImage(img);
  reports.push(report);
}

const totalTime = Date.now() - totalStart;

// ── Report ───────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(80));
console.log("FORENSICS TEST REPORT");
console.log("=".repeat(80));
console.log(`Endpoint:    ${ENDPOINT}`);
console.log(`Market:      ${MARKET}`);
console.log(`Images:      ${reports.length}`);
console.log(`Total time:  ${(totalTime / 1000).toFixed(1)}s`);
console.log("-".repeat(80));

for (const r of reports) {
  console.log(`\n  ${r.file} (${r.sizeKb} KB) — ${(r.timeMs / 1000).toFixed(1)}s`);

  if (!r.result.success) {
    console.log(`    Status:  FAILED — ${r.result.error ?? "unknown error"}`);
    continue;
  }

  if (ENDPOINT === "analyze") {
    const a = r.result as AnalyzeResult;
    console.log(`    Verdict: ${a.verdict} (score: ${a.overall_score}, risk: ${a.risk_level})`);
    console.log(`    TruFor:  global=${a.trufor.global_score}, detection=${a.trufor.detection_score ?? "n/a"}`);
    console.log(`    Image:   ${a.image.width}x${a.image.height}`);
    console.log(`    Fields:  ${a.ocr_analysis.total_fields} (${a.ocr_analysis.field_types_found.join(", ")})`);
    if (a.highest_risk_field) {
      const h = a.highest_risk_field;
      console.log(`    Highest risk: [${h.type}] "${h.text.slice(0, 50)}" anomaly=${h.scores.anomaly}`);
    }
    if (a.notes.length > 0) {
      console.log(`    Notes:   ${a.notes.join("; ")}`);
    }
    if (r.heatmapSaved) {
      console.log(`    Heatmap: ${r.heatmapSaved}`);
    }
  } else {
    const e = r.result as ExtractResult;
    console.log(`    Engine:  ${e.engine}`);
    console.log(`    Image:   ${e.image.width}x${e.image.height}`);
    console.log(`    Fields:  ${e.total_fields} (${(e.processing_time_ms / 1000).toFixed(1)}s server-side)`);

    // Show first 10 fields
    const show = e.fields.slice(0, 10);
    for (const f of show) {
      console.log(`      [${f.label}] "${f.text.slice(0, 60)}" (conf: ${f.confidence})`);
    }
    if (e.fields.length > 10) {
      console.log(`      ... and ${e.fields.length - 10} more fields`);
    }
  }
}

// Summary table for analyze
if (ENDPOINT === "analyze" && reports.length > 1) {
  console.log("\n" + "-".repeat(80));
  console.log("SUMMARY");
  console.log("-".repeat(80));
  console.log(`${"File".padEnd(45)} ${"Verdict".padEnd(12)} ${"Score".padEnd(8)} ${"Fields".padEnd(8)} Time`);
  console.log("-".repeat(80));
  for (const r of reports) {
    if (!r.result.success) {
      console.log(`${r.file.padEnd(45)} ${"ERROR".padEnd(12)} ${"-".padEnd(8)} ${"-".padEnd(8)} ${(r.timeMs / 1000).toFixed(1)}s`);
      continue;
    }
    const a = r.result as AnalyzeResult;
    console.log(
      `${r.file.slice(0, 44).padEnd(45)} ${a.verdict.padEnd(12)} ${String(a.overall_score).padEnd(8)} ${String(a.ocr_analysis.total_fields).padEnd(8)} ${(r.timeMs / 1000).toFixed(1)}s`,
    );
  }
}

// Save JSON report
const reportPath = join(outputDir, `report-${ENDPOINT}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`);
writeFileSync(reportPath, JSON.stringify(reports, null, 2));
console.log(`\nFull report: ${reportPath}`);
