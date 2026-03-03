#!/usr/bin/env bun
/**
 * Document forensics LOCAL test script.
 *
 * Calls forensics functions directly (no HTTP server needed).
 *
 * Usage:
 *   bun scripts/forensics-test-local.ts <folder> --market VN
 *   bun scripts/forensics-test-local.ts /path/to/test-cases-v2/case-03 --market TH
 *
 * Output is saved to /Volumes/work/git/papaya-org/test-cases-v2-output/<sub-folder>/
 */

import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";

import { advancedDocumentForensics } from "../agents/document-forensics/forensics.ts";
import type { DocumentForensicsResult } from "../agents/document-forensics/types.ts";

// ── CLI args ─────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const i = rawArgs.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < rawArgs.length) {
    const val = rawArgs[i + 1]!;
    rawArgs.splice(i, 2);
    return val;
  }
  return fallback;
}

const MARKET = flag("market", "");

const folder = rawArgs[0];
if (!folder || !MARKET) {
  console.error("Usage: bun scripts/forensics-test-local.ts <folder> --market VN|TH|HK|ID");
  process.exit(1);
}

const inputDir = resolve(folder);
const caseName = basename(inputDir);
const OUTPUT_BASE = "/Volumes/work/git/papaya-org/test-cases-v2-output";
const outputDir = join(OUTPUT_BASE, `${caseName}-local`);
mkdirSync(outputDir, { recursive: true });

// ── Image scanning ───────────────────────────────────────────────────────────

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff"]);

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
console.log(`Market:  ${MARKET}`);
console.log(`Output:  ${outputDir}\n`);

// ── Process ──────────────────────────────────────────────────────────────────

interface ImageReport {
  file: string;
  sizeKb: number;
  result: DocumentForensicsResult;
  timeMs: number;
  summarySaved?: string;
}

const reports: ImageReport[] = [];
const totalStart = Date.now();

for (const imgPath of images) {
  const name = basename(imgPath);
  const stem = basename(name, extname(name));
  const sizeKb = Math.round(statSync(imgPath).size / 1024);

  console.log(`  Processing: ${name} (${sizeKb} KB)...`);
  const start = Date.now();

  const result = await advancedDocumentForensics(imgPath, MARKET);
  const timeMs = Date.now() - start;

  // Save summary image
  let summarySaved: string | undefined;
  if (result.heatmap_b64) {
    const buf = Buffer.from(result.heatmap_b64, "base64");
    const outPath = join(outputDir, `${stem}_summary.jpg`);
    writeFileSync(outPath, buf);
    summarySaved = outPath;
    console.log(`    Summary saved: ${outPath} (${Math.round(buf.length / 1024)} KB)`);
  }

  // Save JSON result (without heatmap_b64 to keep file small)
  const jsonResult = { ...result, heatmap_b64: undefined };
  writeFileSync(join(outputDir, `${stem}.json`), JSON.stringify(jsonResult, null, 2));

  reports.push({ file: name, sizeKb, result, timeMs, summarySaved });
}

const totalTime = Date.now() - totalStart;

// ── Report ───────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(80));
console.log("FORENSICS LOCAL TEST REPORT");
console.log("=".repeat(80));
console.log(`Market:      ${MARKET}`);
console.log(`Images:      ${reports.length}`);
console.log(`Total time:  ${(totalTime / 1000).toFixed(1)}s`);
console.log(`Output:      ${outputDir}`);
console.log("-".repeat(80));

for (const r of reports) {
  console.log(`\n  ${r.file} (${r.sizeKb} KB) — ${(r.timeMs / 1000).toFixed(1)}s`);

  if (!r.result.success) {
    console.log(`    Status:  FAILED — ${r.result.error ?? "unknown error"}`);
    continue;
  }

  const a = r.result;
  console.log(`    Verdict: ${a.verdict} (score: ${a.overall_score}, risk: ${a.risk_level})`);
  console.log(`    TruFor:  global=${a.trufor.global_score.toFixed(3)}, detection=${a.trufor.detection_score ?? "n/a"}`);
  console.log(`    Image:   ${a.image.width}x${a.image.height}`);
  console.log(`    Engine:  ${a.ocr_engine} | Device: ${a.device}`);
  console.log(`    Fields:  ${a.ocr_analysis.total_fields} total, ${a.fields.length} scored`);

  // Show top risky fields
  const topRisky = [...a.fields]
    .sort((x, y) => y.scores.anomaly - x.scores.anomaly)
    .filter((f) => f.scores.anomaly > 0.15)
    .slice(0, 5);
  if (topRisky.length > 0) {
    console.log(`    Top risky fields:`);
    for (const f of topRisky) {
      console.log(`      - ${f.scores.anomaly.toFixed(3)} [${f.type}] "${f.text.slice(0, 50)}"`);
    }
  }

  if (a.highest_risk_field) {
    const h = a.highest_risk_field;
    console.log(`    Highest: [${h.type}] "${h.text.slice(0, 50)}" anomaly=${h.scores.anomaly}`);
  }
  if (a.notes.length > 0) {
    console.log(`    Notes:   ${a.notes.join("; ")}`);
  }
  if (r.summarySaved) {
    console.log(`    Summary: ${r.summarySaved}`);
  }
}

// Summary table
if (reports.length > 1) {
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
    const a = r.result;
    console.log(
      `${r.file.slice(0, 44).padEnd(45)} ${a.verdict.padEnd(12)} ${String(a.overall_score).padEnd(8)} ${String(a.ocr_analysis.total_fields).padEnd(8)} ${(r.timeMs / 1000).toFixed(1)}s`,
    );
  }
}

// Save JSON report
const reportPath = join(outputDir, `report-local-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`);
const reportData = reports.map((r) => ({ ...r, result: { ...r.result, heatmap_b64: undefined } }));
writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
console.log(`\nFull report: ${reportPath}`);
