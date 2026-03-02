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

import type { ExtractedField } from './types.ts';
import { RISK_WEIGHTS, KEY_FIELDS } from './types.ts';
import type { FieldResult } from '../types.ts';

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

// ── Anomaly scoring ───────────────────────────────────────────────────────────

function calcAnomalyScore(stats: RegionStats, riskWeight: number): number {
  return (stats.mean * 0.3 + stats.max * 0.5 + stats.std * 0.2) * riskWeight;
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

    if (field.bbox && heatmap.length > 0) {
      const stats = extractRegionStats(
        heatmap,
        heatmapW,
        heatmapH,
        field.bbox,
        imageW,
        imageH,
      );
      anomaly = calcAnomalyScore(stats, riskWeight);
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

  const maxKeyScore =
    keyFieldScores.length > 0 ? Math.max(...keyFieldScores) : 0;
  const meanKeyScore =
    keyFieldScores.length > 0
      ? keyFieldScores.reduce((a, b) => a + b, 0) / keyFieldScores.length
      : 0;
  const meanAllScore =
    allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;

  const overallScore =
    keyFieldScores.length > 0
      ? maxKeyScore * 0.6 + meanKeyScore * 0.4
      : meanAllScore;

  let verdict: 'NORMAL' | 'SUSPICIOUS' | 'TAMPERED' = 'NORMAL';
  if (maxKeyScore >= 0.5) verdict = 'TAMPERED';
  else if (maxKeyScore >= 0.45) verdict = 'SUSPICIOUS';

  const risk_level: 'low' | 'medium' | 'high' =
    overallScore > 0.45 ? 'high' : overallScore > 0.25 ? 'medium' : 'low';

  return {
    verdict,
    overall_score: Math.round(overallScore * 10000) / 10000,
    risk_level,
  };
}
