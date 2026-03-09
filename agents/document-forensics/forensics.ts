/**
 * Advanced Document Forensics — Main Orchestration
 *
 * Combines OCR field detection with TruFor heatmap analysis for
 * per-field tampering detection in documents.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';

import sharp from 'sharp';
import { PYTHON_PROJECT_PATH, PYTHON_BRIDGE_TIMEOUT, ensureOutputDir, getOcrEngine } from './config.ts';
import type { OcrEngine } from './config.ts';
import { GeminiExtractor } from './extraction/gemini-extractor.ts';
import { EasyOCRExtractor } from './extraction/easyocr-extractor.ts';
import { resolveMarket } from './extraction/market-config.ts';
import type { MarketCode } from './extraction/market-config.ts';
import { scoreFieldsAgainstHeatmap, scoreTablesAgainstHeatmap, computeVerdict } from './extraction/field-scorer.ts';
import { KEY_FIELDS } from './extraction/types.ts';
import type { ExtractionResult } from './extraction/types.ts';
import { analyzeDocumentWithGemini } from './extraction/gemini-table-analyzer.ts';
import type { SuspiciousRegion } from './extraction/gemini-table-analyzer.ts';
import { getGeminiApiKey } from './config.ts';
import { generateForensicsSummary } from './utils/forensics-visualizer.ts';
import type { BboxField, BboxTable } from './utils/forensics-visualizer.ts';
import type { FieldResult, ScoredTable, DocumentForensicsResult, BatchForensicsResult, FieldExtractionResult } from './types.ts';

const execFileAsync = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
// TruFor raw heatmap bridge
// ─────────────────────────────────────────────────────────────────────────────

interface TruForRawResult {
  success: boolean;
  global_score: number;
  detection_score: number | null;
  heatmap: Float32Array | null;
  width: number;
  height: number;
  error?: string;
  /** Resolved device: 'cuda', 'cpu', or 'mps'. */
  device?: string;
  cuda_available?: boolean;
  gpu_name?: string | null;
  torch_version?: string;
}

/**
 * Run TruFor and return the raw float32 heatmap alongside scores.
 */
async function runTruForRaw(
  imagePath: string,
  device: string = 'auto',
): Promise<TruForRawResult> {
  // Run from the parent of python/ so that `python/` is a proper top-level package.
  // This allows `from ...base` (3-level relative import inside methods/trufor/method.py)
  // to resolve correctly: python.methods.trufor.method → python.methods.trufor → python.methods → python → ✓
  const parentDir = PYTHON_PROJECT_PATH.replace(/\/python\/?$/, '');
  const pythonScript = `
import sys, json, base64
import numpy as np
import torch
from python.config import resolve_device
device = resolve_device('${device}')

try:
    from python.methods.trufor.predictor import TruForPredictor
    pred = TruForPredictor(device=device)
    out  = pred.predict('${imagePath}')

    hm = np.array(out.heatmap, dtype=np.float32)
    heatmap_b64 = base64.b64encode(hm.tobytes()).decode()

    print(json.dumps({
        'success': True,
        'global_score':    float(out.score or 0),
        'detection_score': float(out.detection) if out.detection is not None else None,
        'heatmap_b64':     heatmap_b64,
        'width':           int(hm.shape[1]),
        'height':          int(hm.shape[0]),
        'device':          device,
        'cuda_available':  torch.cuda.is_available(),
        'gpu_name':        torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        'torch_version':   torch.__version__,
    }))
except Exception as e:
    import traceback
    print(json.dumps({
        'success': False,
        'global_score': 0,
        'detection_score': None,
        'heatmap_b64': None,
        'width': 0,
        'height': 0,
        'error': str(e),
    }))
`.trim();

  try {
    const { stdout } = await execFileAsync(
      'uv',
      ['run', '--project', PYTHON_PROJECT_PATH, 'python', '-c', pythonScript],
      { timeout: PYTHON_BRIDGE_TIMEOUT, maxBuffer: 100 * 1024 * 1024, cwd: parentDir },
    );

    const lines = stdout.trim().split('\n');
    let jsonLine = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]!.startsWith('{')) { jsonLine = lines[i]!; break; }
    }
    if (!jsonLine) throw new Error(`No JSON output: ${stdout}`);

    const parsed = JSON.parse(jsonLine) as {
      success: boolean;
      global_score: number;
      detection_score: number | null;
      heatmap_b64: string | null;
      width: number;
      height: number;
      error?: string;
    };

    let heatmap: Float32Array | null = null;
    if (parsed.heatmap_b64) {
      const buf = Buffer.from(parsed.heatmap_b64, 'base64');
      heatmap = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    }

    return {
      success: parsed.success,
      global_score: parsed.global_score,
      detection_score: parsed.detection_score,
      heatmap,
      width: parsed.width,
      height: parsed.height,
      error: parsed.error,
      device: parsed.device,
      cuda_available: parsed.cuda_available,
      gpu_name: parsed.gpu_name,
      torch_version: parsed.torch_version,
    };
  } catch (err: unknown) {
    return {
      success: false,
      global_score: 0,
      detection_score: null,
      heatmap: null,
      width: 0,
      height: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Heatmap → JET-colormap PNG (passed to the forensics-visualizer overlay)
// ─────────────────────────────────────────────────────────────────────────────

/** OpenCV JET colormap LUT — maps 0–255 → [R,G,B]. */
function jetColor(v: number): [number, number, number] {
  const t = v / 255;
  const r = Math.min(255, Math.max(0, Math.round(255 * (t < 0.375 ? 0 : t < 0.625 ? (t - 0.375) * 4 : t < 0.875 ? 1 : 1 - (t - 0.875) * 4))));
  const g = Math.min(255, Math.max(0, Math.round(255 * (t < 0.125 ? 0 : t < 0.375 ? (t - 0.125) * 4 : t < 0.625 ? 1 : t < 0.875 ? 1 - (t - 0.625) * 4 : 0))));
  const b = Math.min(255, Math.max(0, Math.round(255 * (t < 0.125 ? (t + 0.125) * 4 : t < 0.375 ? 1 : t < 0.625 ? 1 - (t - 0.375) * 4 : 0))));
  return [r, g, b];
}

/**
 * Convert raw TruFor float32 heatmap to a JET-colormap RGBA PNG buffer.
 * This is passed to generateForensicsSummary as the heatmap overlay layer.
 */
async function heatmapToJetPng(
  heatmap: Float32Array,
  hmW: number,
  hmH: number,
): Promise<Buffer> {
  // Normalize heatmap 0–255
  let hMin = Infinity, hMax = -Infinity;
  for (let i = 0; i < heatmap.length; i++) {
    if (heatmap[i]! < hMin) hMin = heatmap[i]!;
    if (heatmap[i]! > hMax) hMax = heatmap[i]!;
  }
  const range = hMax - hMin > 1e-6 ? hMax - hMin : 1;

  // Build JET-colored RGB buffer at heatmap resolution
  const jetBuf = Buffer.alloc(hmW * hmH * 3);
  for (let i = 0; i < heatmap.length; i++) {
    const norm = Math.round(((heatmap[i]! - hMin) / range) * 255);
    const [r, g, b] = jetColor(norm);
    jetBuf[i * 3] = r;
    jetBuf[i * 3 + 1] = g;
    jetBuf[i * 3 + 2] = b;
  }

  return sharp(jetBuf, { raw: { width: hmW, height: hmH, channels: 3 } })
    .png()
    .toBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR + TruFor hybrid pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function runHybridForensics(
  imagePath: string,
  _outputDir: string | null,
  device: string,
  ocrEngine: OcrEngine = 'easyocr',
  market: MarketCode,
): Promise<DocumentForensicsResult> {
  const t0 = Date.now();
  console.log(`[forensics] START image=${imagePath} engine=${ocrEngine} market=${market} device=${device}`);

  // Step 1: OCR extraction (EasyOCR or Gemini)
  let extractionResult: ExtractionResult;
  try {
    if (ocrEngine === 'gemini') {
      extractionResult = await new GeminiExtractor(market).extract(imagePath);
    } else {
      extractionResult = await new EasyOCRExtractor(market).extract(imagePath);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      method: 'advanced_document_forensics',
      ocr_engine: ocrEngine,
      device,
      verdict: 'ERROR',
      overall_score: 0,
      risk_level: 'low',
      trufor: { global_score: 0, detection_score: null },
      image: { path: imagePath, width: 0, height: 0 },
      ocr_analysis: { total_fields: 0, field_types_found: [] },
      highest_risk_field: null,
      fields: [],
      visualization_path: null,
      notes: [],
      error: `OCR extraction failed: ${msg}`,
    };
  }

  const { fields: extractedFields, tables: extractedTables, image_width, image_height } = extractionResult;
  const tableCount = extractedTables?.length ?? 0;
  const tableCellCount = extractedTables?.reduce((s, t) => s + t.cells.length, 0) ?? 0;
  console.log(`[forensics] OCR done: ${extractedFields.length} fields, ${tableCount} tables (${tableCellCount} cells) in ${Date.now() - t0}ms`);

  // Step 2: TruFor raw heatmap
  const t1 = Date.now();
  const truforResult = await runTruForRaw(imagePath, device);
  console.log(`[forensics] TruFor done: success=${truforResult.success} score=${truforResult.global_score} device=${truforResult.device ?? '?'} cuda=${truforResult.cuda_available ?? '?'} gpu=${truforResult.gpu_name ?? 'N/A'} torch=${truforResult.torch_version ?? '?'} in ${Date.now() - t1}ms${truforResult.error ? ` error=${truforResult.error.slice(0, 300)}` : ''}`);

  // Step 3: Score ALL fields against heatmap (needed for verdict computation)
  let allScoredFields: FieldResult[];
  if (truforResult.heatmap && truforResult.width > 0 && truforResult.height > 0) {
    allScoredFields = scoreFieldsAgainstHeatmap(
      extractedFields,
      truforResult.heatmap,
      truforResult.width,
      truforResult.height,
      image_width,
      image_height,
    );
  } else {
    allScoredFields = extractedFields.map((f) => ({
      type: f.label,
      risk_weight: 0.5,
      text: f.text.slice(0, 100),
      confidence: f.confidence,
      bbox: f.bbox,
      scores: { anomaly: 0, heatmap_mean: 0, heatmap_max: 0 },
    }));
  }

  // Step 3b: Score tables against heatmap
  let scoredTables: ScoredTable[] | undefined;
  if (extractedTables && extractedTables.length > 0) {
    if (truforResult.heatmap && truforResult.width > 0 && truforResult.height > 0) {
      scoredTables = scoreTablesAgainstHeatmap(
        extractedTables,
        truforResult.heatmap,
        truforResult.width,
        truforResult.height,
        image_width,
        image_height,
      );
    } else {
      scoredTables = extractedTables.map((t) => ({
        bbox: t.bbox,
        rows: t.rows,
        columns: t.columns,
        headers: t.headers,
        cells: t.cells.map((c) => ({
          ...c,
          scores: { anomaly: 0, heatmap_mean: 0, heatmap_max: 0 },
        })),
        confidence: t.confidence,
        overall_anomaly: 0,
      }));
    }
  }

  // Step 4: Compute verdict from ALL fields
  let { verdict, overall_score, risk_level } = computeVerdict(allScoredFields);

  // For Gemini: filter to key fields only. For EasyOCR: keep all fields (no semantic labels).
  const keyFields = ocrEngine === 'gemini'
    ? allScoredFields.filter((f) => KEY_FIELDS.has(f.type))
    : allScoredFields;

  const highestRisk = keyFields.length > 0
    ? keyFields.reduce((a, b) =>
        a.scores.anomaly >= b.scores.anomaly ? a : b,
      )
    : null;

  // Step 5: Build heatmap buffer + Gemini analysis
  let heatmapBuf: Buffer | null = null;
  if (truforResult.heatmap && truforResult.width > 0 && truforResult.height > 0) {
    heatmapBuf = await heatmapToJetPng(
      truforResult.heatmap, truforResult.width, truforResult.height,
    );
  }

  // Step 5b: Single Gemini call — table analysis + suspicious region summary
  let suspiciousRegions: Array<{ region: string; content: string; concern: string }> | undefined;
  let geminiSummary: string | undefined;
  if (getGeminiApiKey()) {
    try {
      const geminiResult = await analyzeDocumentWithGemini(
        imagePath, extractedTables ?? [], market, heatmapBuf, allScoredFields,
      );
      // Merge table analysis into scored tables
      if (scoredTables && geminiResult.tables.length > 0) {
        for (let i = 0; i < Math.min(scoredTables.length, geminiResult.tables.length); i++) {
          const gr = geminiResult.tables[i]!;
          const st = scoredTables[i]!;
          st.gemini_headers = gr.headers;
          st.gemini_cells = gr.cells.map((c) => ({
            row: c.row, column: c.column, header: c.header, text: c.text,
            is_abnormal: c.is_abnormal, abnormal_reason: c.abnormal_reason,
          }));
          st.abnormal_cells = gr.abnormal_cells.map((c) => ({
            row: c.row, column: c.column, header: c.header, text: c.text,
            reason: c.abnormal_reason,
          }));
        }
      }
      suspiciousRegions = geminiResult.suspicious_regions.length > 0
        ? geminiResult.suspicious_regions : undefined;
      geminiSummary = geminiResult.summary || undefined;

      const totalAbnormal = scoredTables?.reduce((s, t) => s + (t.abnormal_cells?.length ?? 0), 0) ?? 0;
      const suspCount = geminiResult.suspicious_regions.length;
      console.log(`[forensics] Gemini analysis: ${geminiResult.tables.length} tables, ${totalAbnormal} abnormal cells, ${suspCount} suspicious regions`);

      // Re-compute verdict factoring in Gemini findings.
      // Suspicious regions and abnormal cells are strong signals that the
      // heatmap-only scoring misses (heatmap may be low-intensity but Gemini
      // can identify the semantic meaning of those regions).
      if (suspCount > 0 || totalAbnormal > 0) {
        // Gemini boost: each suspicious region adds 0.06, each abnormal cell adds 0.04
        const geminiBoost = Math.min(0.35, suspCount * 0.06 + totalAbnormal * 0.04);
        const boostedScore = Math.min(1, overall_score + geminiBoost);

        // Determine boosted max for verdict thresholds
        const boostedMax = Math.min(1, (overall_score / 0.6) * 0.6 + geminiBoost);
        // Re-derive verdict with boosted score
        if (boostedMax >= 0.50) {
          verdict = 'TAMPERED';
        } else if (boostedMax >= 0.40) {
          verdict = 'SUSPICIOUS';
        }

        overall_score = Math.round(boostedScore * 10000) / 10000;
        risk_level = overall_score > 0.45 ? 'high' : overall_score > 0.25 ? 'medium' : 'low';

        console.log(`[forensics] Verdict boosted by Gemini: +${geminiBoost.toFixed(2)} → score=${overall_score} verdict=${verdict}`);
      }
    } catch (err) {
      console.warn(`[forensics] Gemini analysis skipped: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Step 6: Generate forensics summary image (heatmap overlay + bboxes + sidebar)
  let summaryB64: string | null = null;
  try {

    // Map scored fields → BboxField format for the visualizer
    const bboxFields: BboxField[] = allScoredFields.map((f) => ({
      label: f.type,
      text: f.text,
      confidence: f.confidence,
      anomaly: f.scores.anomaly,
      bbox: f.bbox,
    }));

    // Map scored tables → BboxTable format for the visualizer
    const bboxTables = scoredTables?.map((t) => ({
      bbox: t.bbox,
      rows: t.rows,
      columns: t.columns,
      headers: t.headers,
      overall_anomaly: t.overall_anomaly,
      cells: t.cells.map((c) => ({
        row: c.row,
        column: c.column,
        text: c.text,
        bbox: c.bbox,
        anomaly: c.scores.anomaly,
      })),
      gemini_headers: t.gemini_headers,
      abnormal_cells: t.abnormal_cells,
    })) ?? null;

    const finalVerdict = truforResult.heatmap ? verdict : 'NORMAL';
    const summaryBuf = await generateForensicsSummary(
      imagePath, bboxFields, finalVerdict, overall_score, null, heatmapBuf, bboxTables,
      suspiciousRegions, geminiSummary,
    );
    summaryB64 = summaryBuf.toString('base64');
  } catch (vizErr) {
    console.error('[forensics] Summary generation failed:', vizErr instanceof Error ? vizErr.message : vizErr);
  }

  const handwrittenFields = allScoredFields.filter((f) => f.handwritten);
  const notes: string[] = [
    `${ocrEngine} extracted ${extractedFields.length} fields, ${keyFields.length} key regions`,
  ];
  if (handwrittenFields.length > 0) {
    const hwLabels = handwrittenFields.map((f) => `${f.type}:"${f.text.slice(0, 20)}"`).join(', ');
    notes.push(`Handwritten fields (score discounted): ${hwLabels}`);
  }
  if (scoredTables && scoredTables.length > 0) {
    for (const t of scoredTables) {
      const hdrs = t.gemini_headers ?? t.headers;
      notes.push(`Table detected: ${t.rows}×${t.columns} (${hdrs.join(', ')})${t.overall_anomaly > 0 ? ` anomaly=${t.overall_anomaly.toFixed(3)}` : ''}`);
      if (t.abnormal_cells && t.abnormal_cells.length > 0) {
        for (const ac of t.abnormal_cells) {
          notes.push(`  ABNORMAL [${ac.header}]: "${ac.text}"${ac.reason ? ` — ${ac.reason}` : ''}`);
        }
      }
    }
  }
  if (geminiSummary) {
    notes.push(`Gemini assessment: ${geminiSummary}`);
  }
  if (suspiciousRegions) {
    for (const sr of suspiciousRegions) {
      notes.push(`  SUSPICIOUS [${sr.region}]: ${sr.content} — ${sr.concern}`);
    }
  }
  if (truforResult.success && truforResult.heatmap) {
    notes.push(`TruFor heatmap generated (mean=${truforResult.global_score.toFixed(3)})`);
  } else if (truforResult.error) {
    notes.push(`TruFor unavailable: ${truforResult.error.slice(0, 500)}`);
    notes.push('Anomaly scores are zero (no heatmap data)');
  }

  console.log(`[forensics] DONE verdict=${truforResult.heatmap ? verdict : 'NORMAL'} score=${overall_score} total=${Date.now() - t0}ms`);

  return {
    success: true,
    method: 'advanced_document_forensics',
    ocr_engine: ocrEngine,
    device,
    verdict: truforResult.heatmap ? verdict : 'NORMAL',
    overall_score,
    risk_level,
    trufor: {
      global_score: truforResult.global_score,
      detection_score: truforResult.detection_score,
    },
    image: { path: imagePath, width: image_width, height: image_height },
    ocr_analysis: {
      total_fields: extractedFields.length,
      field_types_found: [...new Set(allScoredFields.map((f) => f.type))],
    },
    highest_risk_field: highestRisk
      ? {
          type: highestRisk.type,
          risk_weight: highestRisk.risk_weight,
          text: highestRisk.text,
          bbox: highestRisk.bbox,
          scores: highestRisk.scores,
        }
      : null,
    fields: keyFields,
    tables: scoredTables && scoredTables.length > 0 ? scoredTables : undefined,
    suspicious_regions: suspiciousRegions,
    gemini_summary: geminiSummary,
    visualization_path: null,
    heatmap_b64: summaryB64,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advanced document forensics with full field breakdown.
 */
export async function advancedDocumentForensics(
  imagePath: string,
  market: string,
  outputDir?: string,
  device: string = 'auto',
  ocrEngine?: OcrEngine,
  includeVisualization: boolean = true,
): Promise<DocumentForensicsResult> {
  const engine = ocrEngine ?? getOcrEngine();
  const resolved = resolveMarket(market);
  const outDir = includeVisualization ? outputDir ?? ensureOutputDir() : null;
  return runHybridForensics(imagePath, outDir, device, engine, resolved);
}

/**
 * Standalone field extraction — returns bounding boxes + text, no TruFor scoring.
 */
export async function extractDocumentFields(
  imagePath: string,
  market: string,
  ocrEngine?: OcrEngine,
  documentType: string = 'auto',
): Promise<FieldExtractionResult> {
  const engine = ocrEngine ?? getOcrEngine();
  const resolved = resolveMarket(market);

  try {
    const extractor = engine === 'gemini' ? new GeminiExtractor(resolved) : new EasyOCRExtractor(resolved);
    const result = await extractor.extract(imagePath);
    return {
      success: true,
      engine: result.engine,
      document_type: documentType,
      image: {
        path: imagePath,
        width: result.image_width,
        height: result.image_height,
      },
      fields: result.fields,
      total_fields: result.fields.length,
      processing_time_ms: result.processing_time_ms,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      engine,
      document_type: documentType,
      image: { path: imagePath, width: 0, height: 0 },
      fields: [],
      total_fields: 0,
      processing_time_ms: 0,
      error: msg,
    };
  }
}

/**
 * Batch document forensics with parallel processing.
 */
export async function batchDocumentForensics(
  imagePaths: string[],
  market: string,
  outputDir?: string,
  device: string = 'auto',
  concurrency: number = 3,
): Promise<BatchForensicsResult> {
  const outDir = outputDir ?? ensureOutputDir();
  mkdirSync(outDir, { recursive: true });

  const verdicts = { NORMAL: 0, SUSPICIOUS: 0, TAMPERED: 0, ERROR: 0 };
  const scores: number[] = [];
  const results: BatchForensicsResult['results'] = [];

  const processBatch = async (batch: string[]): Promise<void> => {
    const promises = batch.map(async (imgPath) => {
      try {
        const result = await advancedDocumentForensics(imgPath, market, outDir, device);

        verdicts[result.verdict as keyof typeof verdicts]++;
        if (result.success) {
          scores.push(result.overall_score);
        }

        results.push({
          image: imgPath,
          verdict: result.verdict,
          score: result.overall_score,
          fields: result.ocr_analysis.total_fields,
          highest_risk: result.highest_risk_field
            ? {
                type: result.highest_risk_field.type,
                score: result.highest_risk_field.scores.anomaly,
              }
            : null,
          visualization: result.visualization_path,
          error: result.error,
        });
      } catch (err) {
        verdicts.ERROR++;
        results.push({
          image: imgPath,
          verdict: 'ERROR',
          score: 0,
          fields: 0,
          highest_risk: null,
          visualization: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await Promise.all(promises);
  };

  for (let i = 0; i < imagePaths.length; i += concurrency) {
    const batch = imagePaths.slice(i, i + concurrency);
    await processBatch(batch);
  }

  return {
    success: true,
    total_images: imagePaths.length,
    summary: {
      verdicts,
      avg_score: scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) / 10000
        : 0,
      max_score: scores.length > 0 ? Math.round(Math.max(...scores) * 10000) / 10000 : 0,
      min_score: scores.length > 0 ? Math.round(Math.min(...scores) * 10000) / 10000 : 0,
    },
    results,
    output_dir: outDir,
  };
}
