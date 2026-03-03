#!/usr/bin/env bun
/**
 * Document forensics PROD test script.
 *
 * Sends images to the production backend via multipart upload
 * and saves results for comparison with local runs.
 *
 * Usage:
 *   bun scripts/forensics-test-prod.ts <folder> --market VN
 *   bun scripts/forensics-test-prod.ts <folder> --market TH
 *   bun scripts/forensics-test-prod.ts <folder> --market TH --url http://localhost:4001
 *
 * Output is saved to /Volumes/work/git/papaya-org/test-cases-v2-output/<sub-folder>-prod/
 *
 * After running, pass --compare to compare prod vs local results:
 *   bun scripts/forensics-test-prod.ts <folder> --compare
 */

import { readdirSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename, extname, resolve } from "node:path";

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

function hasFlag(name: string): boolean {
  const i = rawArgs.indexOf(`--${name}`);
  if (i >= 0) {
    rawArgs.splice(i, 1);
    return true;
  }
  return false;
}

const BASE_URL = flag("url", "https://prod.banyan.services.papaya.asia");
const MARKET = flag("market", "");
const compareOnly = hasFlag("compare");

const folder = rawArgs[0];
if (!folder || (!compareOnly && !MARKET)) {
  console.error("Usage: bun scripts/forensics-test-prod.ts <folder> --market VN|TH|HK|ID [--url <base>] [--compare]");
  process.exit(1);
}

const inputDir = resolve(folder);
const caseName = basename(inputDir);
const OUTPUT_BASE = "/Volumes/work/git/papaya-org/test-cases-v2-output";
const prodOutputDir = join(OUTPUT_BASE, `${caseName}-prod`);
const localOutputDir = join(OUTPUT_BASE, `${caseName}-local`);

// ── Types ────────────────────────────────────────────────────────────────────

interface FieldScore {
  anomaly: number;
  heatmap_mean: number;
  heatmap_max: number;
}

interface Field {
  type: string;
  text: string;
  confidence: number;
  risk_weight: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  scores: FieldScore;
}

interface AnalyzeResult {
  success: boolean;
  method: string;
  ocr_engine: string;
  device: string;
  verdict: string;
  overall_score: number;
  risk_level: string;
  trufor: { global_score: number; detection_score: number | null };
  image: { path: string; width: number; height: number };
  ocr_analysis: { total_fields: number; field_types_found: string[] };
  highest_risk_field: {
    type: string;
    text: string;
    risk_weight: number;
    bbox: { x: number; y: number; width: number; height: number } | null;
    scores: FieldScore;
  } | null;
  fields: Field[];
  heatmap_b64?: string | null;
  notes: string[];
  error?: string;
}

interface ImageReport {
  file: string;
  sizeKb: number;
  result: AnalyzeResult;
  timeMs: number;
  summarySaved?: string;
}

// ── Compare mode ─────────────────────────────────────────────────────────────

if (compareOnly) {
  compareResults();
  process.exit(0);
}

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

mkdirSync(prodOutputDir, { recursive: true });

console.log(`Found ${images.length} image(s) in ${inputDir}`);
console.log(`Backend: ${BASE_URL}/forensics/analyze`);
console.log(`Market:  ${MARKET}`);
console.log(`Output:  ${prodOutputDir}\n`);

// ── Call prod backend ────────────────────────────────────────────────────────

const reports: ImageReport[] = [];
const totalStart = Date.now();

for (const imgPath of images) {
  const name = basename(imgPath);
  const stem = basename(name, extname(name));
  const sizeKb = Math.round(statSync(imgPath).size / 1024);

  console.log(`  Processing: ${name} (${sizeKb} KB)...`);

  const form = new FormData();
  form.append("image", Bun.file(imgPath), name);
  form.append("options", JSON.stringify({ market: MARKET }));

  const start = Date.now();
  let result: AnalyzeResult;

  try {
    const resp = await fetch(`${BASE_URL}/forensics/analyze`, {
      method: "POST",
      body: form,
    });
    const timeMs = Date.now() - start;

    if (!resp.ok) {
      const text = await resp.text();
      console.log(`    ERROR: HTTP ${resp.status} — ${text.slice(0, 200)}`);
      reports.push({
        file: name,
        sizeKb,
        result: { success: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` } as any,
        timeMs,
      });
      continue;
    }

    result = await resp.json();

    // Save summary image
    let summarySaved: string | undefined;
    if (result.heatmap_b64) {
      const buf = Buffer.from(result.heatmap_b64, "base64");
      const outPath = join(prodOutputDir, `${stem}_summary.jpg`);
      writeFileSync(outPath, buf);
      summarySaved = outPath;
      console.log(`    Summary saved: ${outPath} (${Math.round(buf.length / 1024)} KB)`);
    }

    // Save JSON result (without heatmap_b64 to keep file small)
    const jsonResult = { ...result, heatmap_b64: undefined };
    writeFileSync(join(prodOutputDir, `${stem}.json`), JSON.stringify(jsonResult, null, 2));

    reports.push({ file: name, sizeKb, result, timeMs, summarySaved });
  } catch (err) {
    const timeMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    ERROR: ${msg}`);
    reports.push({
      file: name,
      sizeKb,
      result: { success: false, error: msg } as any,
      timeMs,
    });
  }
}

const totalTime = Date.now() - totalStart;

// ── Report ───────────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(80));
console.log("FORENSICS PROD TEST REPORT");
console.log("=".repeat(80));
console.log(`Backend:     ${BASE_URL}`);
console.log(`Market:      ${MARKET}`);
console.log(`Images:      ${reports.length}`);
console.log(`Total time:  ${(totalTime / 1000).toFixed(1)}s`);
console.log(`Output:      ${prodOutputDir}`);
console.log("-".repeat(80));

for (const r of reports) {
  console.log(`\n  ${r.file} (${r.sizeKb} KB) — ${(r.timeMs / 1000).toFixed(1)}s`);

  if (!r.result.success) {
    console.log(`    Status:  FAILED — ${r.result.error ?? "unknown error"}`);
    continue;
  }

  const a = r.result;
  console.log(`    Verdict: ${a.verdict} (score: ${a.overall_score}, risk: ${a.risk_level})`);
  console.log(`    TruFor:  global=${a.trufor.global_score}, detection=${a.trufor.detection_score ?? "n/a"}`);
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
const reportPath = join(prodOutputDir, `report-prod-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`);
const reportData = reports.map((r) => ({ ...r, result: { ...r.result, heatmap_b64: undefined } }));
writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
console.log(`\nFull report: ${reportPath}`);

// ── Auto-compare if local results exist ──────────────────────────────────────

if (existsSync(localOutputDir)) {
  console.log("\n");
  compareResults();
}

// ── Compare function ─────────────────────────────────────────────────────────

function compareResults() {
  console.log("=".repeat(80));
  console.log("COMPARISON: LOCAL vs PROD");
  console.log("=".repeat(80));

  if (!existsSync(localOutputDir)) {
    console.log(`\n  Local output not found: ${localOutputDir}`);
    console.log(`  Run local first: bun scripts/forensics-test-local.ts ${folder}`);
    return;
  }
  if (!existsSync(prodOutputDir)) {
    console.log(`\n  Prod output not found: ${prodOutputDir}`);
    console.log(`  Run prod first (this script without --compare)`);
    return;
  }

  // Collect JSON files from both folders
  const localJsons = readdirSync(localOutputDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("report-"))
    .sort();
  const prodJsons = readdirSync(prodOutputDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("report-"))
    .sort();

  const allFiles = new Set([...localJsons, ...prodJsons]);

  console.log(`\n  Local dir:  ${localOutputDir} (${localJsons.length} results)`);
  console.log(`  Prod dir:   ${prodOutputDir} (${prodJsons.length} results)\n`);

  // Header
  const W = 100;
  console.log("-".repeat(W));
  console.log(
    `${"Image".padEnd(30)} ` +
    `${"".padEnd(3)} ` +
    `${"Verdict".padEnd(10)} ` +
    `${"Score".padEnd(8)} ` +
    `${"TruFor".padEnd(8)} ` +
    `${"Fields".padEnd(8)} ` +
    `${"TopRisk".padEnd(8)} ` +
    `${"TopType".padEnd(15)} `
  );
  console.log("-".repeat(W));

  let matches = 0;
  let mismatches = 0;

  for (const jsonFile of [...allFiles].sort()) {
    const stem = basename(jsonFile, ".json");
    const localPath = join(localOutputDir, jsonFile);
    const prodPath = join(prodOutputDir, jsonFile);

    const hasLocal = existsSync(localPath);
    const hasProd = existsSync(prodPath);

    if (!hasLocal && !hasProd) continue;

    const localData: AnalyzeResult | null = hasLocal
      ? JSON.parse(readFileSync(localPath, "utf-8"))
      : null;
    const prodData: AnalyzeResult | null = hasProd
      ? JSON.parse(readFileSync(prodPath, "utf-8"))
      : null;

    const label = stem.slice(0, 29).padEnd(30);

    // Print local row
    if (localData?.success) {
      const topField = localData.highest_risk_field;
      console.log(
        `${label} ` +
        `${"L".padEnd(3)} ` +
        `${localData.verdict.padEnd(10)} ` +
        `${String(localData.overall_score).padEnd(8)} ` +
        `${localData.trufor.global_score.toFixed(3).padEnd(8)} ` +
        `${String(localData.ocr_analysis.total_fields).padEnd(8)} ` +
        `${(topField?.scores.anomaly.toFixed(3) ?? "-").padEnd(8)} ` +
        `${(topField?.type ?? "-").padEnd(15)} `
      );
    } else if (localData) {
      console.log(`${label} ${"L".padEnd(3)} ERROR: ${localData.error ?? "unknown"}`);
    } else {
      console.log(`${label} ${"L".padEnd(3)} (missing)`);
    }

    // Print prod row
    if (prodData?.success) {
      const topField = prodData.highest_risk_field;
      console.log(
        `${"".padEnd(30)} ` +
        `${"P".padEnd(3)} ` +
        `${prodData.verdict.padEnd(10)} ` +
        `${String(prodData.overall_score).padEnd(8)} ` +
        `${prodData.trufor.global_score.toFixed(3).padEnd(8)} ` +
        `${String(prodData.ocr_analysis.total_fields).padEnd(8)} ` +
        `${(topField?.scores.anomaly.toFixed(3) ?? "-").padEnd(8)} ` +
        `${(topField?.type ?? "-").padEnd(15)} `
      );
    } else if (prodData) {
      console.log(`${"".padEnd(30)} ${"P".padEnd(3)} ERROR: ${prodData.error ?? "unknown"}`);
    } else {
      console.log(`${"".padEnd(30)} ${"P".padEnd(3)} (missing)`);
    }

    // Verdict match check
    if (localData?.success && prodData?.success) {
      const verdictMatch = localData.verdict === prodData.verdict;
      const scoreDiff = Math.abs(localData.overall_score - prodData.overall_score);
      const truforDiff = Math.abs(localData.trufor.global_score - prodData.trufor.global_score);

      if (verdictMatch && scoreDiff < 0.01 && truforDiff < 0.01) {
        console.log(`${"".padEnd(30)}  ✓  MATCH`);
        matches++;
      } else {
        const diffs: string[] = [];
        if (!verdictMatch) diffs.push(`verdict: ${localData.verdict}→${prodData.verdict}`);
        if (scoreDiff >= 0.01) diffs.push(`score: Δ${scoreDiff.toFixed(3)}`);
        if (truforDiff >= 0.01) diffs.push(`trufor: Δ${truforDiff.toFixed(3)}`);
        console.log(`${"".padEnd(30)}  ✗  DIFF — ${diffs.join(", ")}`);
        mismatches++;
      }
    } else {
      mismatches++;
    }

    console.log("");
  }

  // Summary
  console.log("-".repeat(W));
  console.log(`Total: ${matches + mismatches} images | ${matches} match | ${mismatches} differ`);
  console.log("-".repeat(W));

  // Detailed field comparison for mismatches
  if (mismatches > 0) {
    console.log("\nDETAILED FIELD COMPARISON (mismatches only):");
    console.log("-".repeat(W));

    for (const jsonFile of [...allFiles].sort()) {
      const localPath = join(localOutputDir, jsonFile);
      const prodPath = join(prodOutputDir, jsonFile);
      if (!existsSync(localPath) || !existsSync(prodPath)) continue;

      const localData: AnalyzeResult = JSON.parse(readFileSync(localPath, "utf-8"));
      const prodData: AnalyzeResult = JSON.parse(readFileSync(prodPath, "utf-8"));

      if (!localData.success || !prodData.success) continue;
      if (localData.verdict === prodData.verdict &&
          Math.abs(localData.overall_score - prodData.overall_score) < 0.01) continue;

      const stem = basename(jsonFile, ".json");
      console.log(`\n  ${stem}:`);

      // Compare top 5 fields by anomaly from each
      const localTop = [...localData.fields].sort((a, b) => b.scores.anomaly - a.scores.anomaly).slice(0, 5);
      const prodTop = [...prodData.fields].sort((a, b) => b.scores.anomaly - a.scores.anomaly).slice(0, 5);

      console.log(`    LOCAL top fields (${localData.fields.length} total):`);
      for (const f of localTop) {
        console.log(`      ${f.scores.anomaly.toFixed(3)} [${f.type}] w=${f.risk_weight} "${f.text.slice(0, 45)}"`);
      }
      console.log(`    PROD top fields (${prodData.fields.length} total):`);
      for (const f of prodTop) {
        console.log(`      ${f.scores.anomaly.toFixed(3)} [${f.type}] w=${f.risk_weight} "${f.text.slice(0, 45)}"`);
      }
    }
  }
}
