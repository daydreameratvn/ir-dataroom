/**
 * Pure-TypeScript field scorer.
 *
 * Scores a list of extracted fields against a raw TruFor heatmap (Float32Array,
 * values 0–1, H×W layout) using the same formula as the Python DocumentAnalyzer.
 *
 * Formula:
 *   anomaly = (mean×0.3 + max×0.5 + std×0.2) × risk_weight
 *   overall = max(key_scores)×0.6 + mean(key_scores)×0.4
 */

import type { ExtractedField, DetectedTable } from './types.ts';
import { RISK_WEIGHTS, KEY_FIELDS } from './types.ts';
import type { FieldResult, ScoredTable, ScoredTableCell } from '../types.ts';

// ── Region extraction ─────────────────────────────────────────────────────────

interface RegionStats {
  mean: number;
  max: number;
  std: number;
}

/**
 * Extract statistics from a heatmap region corresponding to a bounding box.
 */
function extractRegionStats(
  heatmap: Float32Array,
  heatmapW: number,
  heatmapH: number,
  bbox: { x: number; y: number; width: number; height: number },
  imageW: number,
  imageH: number,
): RegionStats {
  const scaleX = heatmapW / imageW;
  const scaleY = heatmapH / imageH;

  const x0 = Math.max(0, Math.floor(bbox.x * scaleX));
  const y0 = Math.max(0, Math.floor(bbox.y * scaleY));
  const x1 = Math.min(heatmapW - 1, Math.ceil((bbox.x + bbox.width) * scaleX));
  const y1 = Math.min(heatmapH - 1, Math.ceil((bbox.y + bbox.height) * scaleY));

  if (x1 <= x0 || y1 <= y0) {
    return { mean: 0, max: 0, std: 0 };
  }

  const values: number[] = [];
  for (let row = y0; row <= y1; row++) {
    for (let col = x0; col <= x1; col++) {
      values.push(heatmap[row * heatmapW + col]!);
    }
  }

  if (values.length === 0) {
    return { mean: 0, max: 0, std: 0 };
  }

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const max = Math.max(...values);
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  return { mean, max, std };
}

// ── Handwriting detection ─────────────────────────────────────────────────────

/**
 * Discount factor applied to anomaly scores for handwritten fields.
 * Handwriting naturally produces high heatmap noise (irregular strokes,
 * variable ink density) which inflates anomaly scores without indicating
 * tampering.
 */
const HANDWRITING_DISCOUNT = 0.4;

/**
 * Heuristic: a field is likely handwritten if:
 * - OCR confidence is low (EasyOCR struggles with handwriting), AND
 * - Heatmap std is high relative to mean (noisy, variable ink patterns)
 *
 * OR if the heatmap std/mean ratio alone is very high (clear handwriting signal
 * regardless of OCR confidence).
 */
function isLikelyHandwritten(ocrConfidence: number, stats: RegionStats): boolean {
  if (stats.mean <= 0) return false;
  const stdMeanRatio = stats.std / stats.mean;

  // Strong signal: very high variance + low OCR confidence
  if (ocrConfidence < 0.6 && stdMeanRatio > 0.5) return true;

  // Moderate signal: moderate confidence + very high variance
  if (ocrConfidence < 0.75 && stdMeanRatio > 0.7) return true;

  return false;
}

// ── Anomaly scoring ───────────────────────────────────────────────────────────

function calcAnomalyScore(stats: RegionStats, riskWeight: number, handwritingDiscount: boolean = false): number {
  const raw = (stats.mean * 0.3 + stats.max * 0.5 + stats.std * 0.2) * riskWeight;
  return handwritingDiscount ? raw * HANDWRITING_DISCOUNT : raw;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score extracted fields against a TruFor heatmap.
 */
export function scoreFieldsAgainstHeatmap(
  fields: ExtractedField[],
  heatmap: Float32Array,
  heatmapW: number,
  heatmapH: number,
  imageW: number,
  imageH: number,
): FieldResult[] {
  return fields.map((field) => {
    const riskWeight = RISK_WEIGHTS[field.label] ?? RISK_WEIGHTS['unknown'] ?? 0.3;

    let anomaly = 0;
    let heatmapMean = 0;
    let heatmapMax = 0;

    let handwritten = false;

    if (field.bbox && heatmap.length > 0) {
      const stats = extractRegionStats(
        heatmap,
        heatmapW,
        heatmapH,
        field.bbox,
        imageW,
        imageH,
      );
      handwritten = isLikelyHandwritten(field.confidence, stats);
      anomaly = calcAnomalyScore(stats, riskWeight, handwritten);
      heatmapMean = stats.mean;
      heatmapMax = stats.max;
    }

    return {
      type: field.label,
      risk_weight: riskWeight,
      text: field.text.slice(0, 100),
      confidence: field.confidence,
      bbox: field.bbox,
      scores: {
        anomaly: Math.round(anomaly * 10000) / 10000,
        heatmap_mean: Math.round(heatmapMean * 10000) / 10000,
        heatmap_max: Math.round(heatmapMax * 10000) / 10000,
      },
      ...(handwritten ? { handwritten: true } : {}),
    };
  });
}

/**
 * Score detected tables against a TruFor heatmap.
 * Each cell gets its own anomaly score; the table gets the max across all cells.
 */
export function scoreTablesAgainstHeatmap(
  tables: DetectedTable[],
  heatmap: Float32Array,
  heatmapW: number,
  heatmapH: number,
  imageW: number,
  imageH: number,
): ScoredTable[] {
  const cellRiskWeight = RISK_WEIGHTS['table_cell'] ?? 0.8;

  return tables.map((table) => {
    const scoredCells: ScoredTableCell[] = table.cells.map((cell) => {
      let anomaly = 0;
      let heatmapMean = 0;
      let heatmapMax = 0;

      if (cell.bbox && heatmap.length > 0) {
        const stats = extractRegionStats(heatmap, heatmapW, heatmapH, cell.bbox, imageW, imageH);
        const hw = isLikelyHandwritten(cell.confidence, stats);
        anomaly = calcAnomalyScore(stats, cellRiskWeight, hw);
        heatmapMean = stats.mean;
        heatmapMax = stats.max;
      }

      return {
        row: cell.row,
        column: cell.column,
        text: cell.text,
        confidence: cell.confidence,
        bbox: cell.bbox,
        scores: {
          anomaly: Math.round(anomaly * 10000) / 10000,
          heatmap_mean: Math.round(heatmapMean * 10000) / 10000,
          heatmap_max: Math.round(heatmapMax * 10000) / 10000,
        },
      };
    });

    const overallAnomaly = scoredCells.length > 0
      ? Math.max(...scoredCells.map((c) => c.scores.anomaly))
      : 0;

    return {
      bbox: table.bbox,
      rows: table.rows,
      columns: table.columns,
      headers: table.headers,
      cells: scoredCells,
      confidence: table.confidence,
      overall_anomaly: Math.round(overallAnomaly * 10000) / 10000,
    };
  });
}

/**
 * Compute the overall forensics verdict from scored fields.
 */
export function computeVerdict(scoredFields: FieldResult[]): {
  verdict: 'NORMAL' | 'SUSPICIOUS' | 'TAMPERED';
  overall_score: number;
  risk_level: 'low' | 'medium' | 'high';
} {
  const keyFieldScores = scoredFields
    .filter((f) => KEY_FIELDS.has(f.type))
    .map((f) => f.scores.anomaly);

  const allScores = scoredFields.map((f) => f.scores.anomaly);

  // Fallback: if no key fields were classified, use all scores for verdict.
  const effectiveScores = keyFieldScores.length > 0 ? keyFieldScores : allScores;

  const maxScore =
    effectiveScores.length > 0 ? Math.max(...effectiveScores) : 0;
  const meanScore =
    effectiveScores.length > 0
      ? effectiveScores.reduce((a, b) => a + b, 0) / effectiveScores.length
      : 0;

  const overallScore = maxScore * 0.6 + meanScore * 0.4;

  let verdict: 'NORMAL' | 'SUSPICIOUS' | 'TAMPERED' = 'NORMAL';
  if (maxScore >= 0.50) verdict = 'TAMPERED';
  else if (maxScore >= 0.45) verdict = 'SUSPICIOUS';

  const risk_level: 'low' | 'medium' | 'high' =
    overallScore > 0.45 ? 'high' : overallScore > 0.25 ? 'medium' : 'low';

  return {
    verdict,
    overall_score: Math.round(overallScore * 10000) / 10000,
    risk_level,
  };
}
