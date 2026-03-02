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
import { PYTHON_PROJECT_PATH, PYTHON_BRIDGE_TIMEOUT, ensureOutputDir } from './config.ts';
import { GeminiExtractor } from './extraction/gemini-extractor.ts';
import { scoreFieldsAgainstHeatmap, computeVerdict } from './extraction/field-scorer.ts';
import type { FieldResult, DocumentForensicsResult, BatchForensicsResult, FieldExtractionResult } from './types.ts';

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
}

/**
 * Run TruFor and return the raw float32 heatmap alongside scores.
 */
async function runTruForRaw(
  imagePath: string,
  device: string = 'auto',
): Promise<TruForRawResult> {
  const pythonScript = `
import sys, json, base64
import numpy as np
from config import resolve_device
device = resolve_device('${device}')

try:
    from methods.trufor.predictor import TruForPredictor
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
      { timeout: PYTHON_BRIDGE_TIMEOUT, maxBuffer: 100 * 1024 * 1024, cwd: PYTHON_PROJECT_PATH },
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
// Gemini hybrid pipeline
// ─────────────────────────────────────────────────────────────────────────────

async function runGeminiDocumentForensics(
  imagePath: string,
  _outputDir: string | null,
  device: string,
): Promise<DocumentForensicsResult> {
  let extractionResult;
  try {
    const extractor = new GeminiExtractor();
    extractionResult = await extractor.extract(imagePath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
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
      error: `Gemini extraction failed: ${msg}`,
    };
  }

  const { fields: extractedFields, image_width, image_height } = extractionResult;

  // Step 2: TruFor raw heatmap
  const truforResult = await runTruForRaw(imagePath, device);

  // Encode TruFor heatmap as grayscale PNG base64
  let heatmapPngB64: string | null = null;
  if (truforResult.heatmap && truforResult.width > 0 && truforResult.height > 0) {
    try {
      const uint8 = Buffer.alloc(truforResult.heatmap.length);
      for (let i = 0; i < truforResult.heatmap.length; i++) {
        uint8[i] = Math.min(255, Math.round(truforResult.heatmap[i]! * 255));
      }
      const pngBuf = await sharp(uint8, {
        raw: { width: truforResult.width, height: truforResult.height, channels: 1 },
      }).png().toBuffer();
      heatmapPngB64 = pngBuf.toString('base64');
    } catch { /* skip heatmap if encoding fails */ }
  }

  // Step 3: Score fields against heatmap
  let scoredFields: FieldResult[];
  if (truforResult.heatmap && truforResult.width > 0 && truforResult.height > 0) {
    scoredFields = scoreFieldsAgainstHeatmap(
      extractedFields,
      truforResult.heatmap,
      truforResult.width,
      truforResult.height,
      image_width,
      image_height,
    );
  } else {
    scoredFields = extractedFields.map((f) => ({
      type: f.label,
      risk_weight: 0.5,
      text: f.text.slice(0, 100),
      confidence: f.confidence,
      bbox: f.bbox,
      scores: { anomaly: 0, heatmap_mean: 0, heatmap_max: 0 },
    }));
  }

  // Step 4: Compute verdict
  const { verdict, overall_score, risk_level } = computeVerdict(scoredFields);

  const highestRisk = scoredFields.length > 0
    ? scoredFields.reduce((a, b) =>
        a.scores.anomaly >= b.scores.anomaly ? a : b,
      )
    : null;

  const notes: string[] = [
    `Gemini extracted ${extractedFields.length} fields`,
  ];
  if (truforResult.success && truforResult.heatmap) {
    notes.push(`TruFor heatmap generated (mean=${truforResult.global_score.toFixed(3)})`);
  } else if (truforResult.error) {
    notes.push(`TruFor unavailable: ${truforResult.error.slice(0, 100)}`);
    notes.push('Anomaly scores are zero (no heatmap data)');
  }

  return {
    success: true,
    verdict: truforResult.heatmap ? verdict : 'NORMAL',
    overall_score,
    risk_level,
    trufor: {
      global_score: truforResult.global_score,
      detection_score: truforResult.detection_score,
    },
    image: { path: imagePath, width: image_width, height: image_height },
    ocr_analysis: {
      total_fields: scoredFields.length,
      field_types_found: [...new Set(scoredFields.map((f) => f.type))],
    },
    highest_risk_field: highestRisk
      ? {
          type: highestRisk.type,
          risk_weight: highestRisk.risk_weight,
          text: highestRisk.text,
          scores: highestRisk.scores,
        }
      : null,
    fields: scoredFields,
    visualization_path: null,
    heatmap_b64: heatmapPngB64,
    notes,
    ocr_engine: 'gemini',
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
  outputDir?: string,
  device: string = 'auto',
  ocrEngine: string = 'gemini',
  includeVisualization: boolean = true,
): Promise<DocumentForensicsResult> {
  const outDir = includeVisualization ? outputDir ?? ensureOutputDir() : null;
  return runGeminiDocumentForensics(imagePath, outDir, device);
}

/**
 * Standalone field extraction — returns bounding boxes + text, no TruFor scoring.
 */
export async function extractDocumentFields(
  imagePath: string,
  ocrEngine: string = 'gemini',
  documentType: string = 'auto',
): Promise<FieldExtractionResult> {
  if (ocrEngine !== 'gemini') {
    return {
      success: false,
      engine: ocrEngine,
      document_type: documentType,
      image: { path: imagePath, width: 0, height: 0 },
      fields: [],
      total_fields: 0,
      processing_time_ms: 0,
      error: `Unsupported engine for standalone extraction: ${ocrEngine}. Use "gemini".`,
    };
  }

  try {
    const extractor = new GeminiExtractor();
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
      engine: ocrEngine,
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
        const result = await advancedDocumentForensics(imgPath, outDir, device);

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
