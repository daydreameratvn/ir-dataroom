/**
 * Convert benchmark outputs to response dicts.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, parse as parsePath } from 'node:path';
import sharp from 'sharp';

import type { BenchmarkOutput } from '../methods/base.ts';
import { applyJetColormap } from '../utils/heatmap.ts';
import { mean, max } from '../utils/math-utils.ts';

export interface Scores {
  mean: number | null;
  max: number | null;
  detection: number | null;
}

export interface MethodResult {
  success: boolean;
  method: string;
  image_path: string;
  scores: Scores;
  heatmap_path?: string | null;
  heatmap_base64?: string | null;
  extra_outputs?: Record<string, unknown>;
  error?: string;
}

/**
 * Compute summary scores from a heatmap and detection value.
 */
export function computeScores(
  heatmap: Float32Array | null,
  detection: number | null,
): Scores {
  const scores: Scores = { mean: null, max: null, detection: null };

  if (heatmap && heatmap.length > 0) {
    scores.mean = mean(heatmap);
    scores.max = max(heatmap);
  }

  if (detection != null) {
    scores.detection = detection;
  }

  return scores;
}

/**
 * Convert a 2D heatmap to JET-colorized PNG bytes.
 */
export async function heatmapToPngBytes(
  heatmap: Float32Array,
  width: number,
  height: number,
): Promise<Buffer> {
  const rgb = applyJetColormap(heatmap, width, height);
  return sharp(Buffer.from(rgb.buffer), {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();
}

/**
 * Convert a BenchmarkOutput to a response dict.
 */
export async function formatBenchmarkResult(
  result: BenchmarkOutput,
  imagePath: string,
  methodName: string,
  outputDir: string,
): Promise<MethodResult> {
  const scores = computeScores(result.heatmap, result.detection);

  let heatmapPath: string | null = null;
  let heatmapB64: string | null = null;

  if (result.heatmap && result.heatmap.length > 0) {
    try {
      mkdirSync(outputDir, { recursive: true });
      const stem = parsePath(imagePath).name;
      const filename = `${stem}_${methodName}_heatmap.png`;
      heatmapPath = resolve(outputDir, filename);

      const pngBytes = await heatmapToPngBytes(
        result.heatmap,
        result.width,
        result.height,
      );

      writeFileSync(heatmapPath, pngBytes);
      heatmapB64 = pngBytes.toString('base64');
    } catch {
      // Failed to save heatmap, continue without it
    }
  }

  const response: MethodResult = {
    success: true,
    method: methodName,
    image_path: imagePath,
    scores,
    heatmap_path: heatmapPath,
    heatmap_base64: heatmapB64,
  };

  if (result.extraOutputs) {
    response.extra_outputs = result.extraOutputs;
  }

  return response;
}

/**
 * Create an error result for a failed method invocation.
 */
export function errorResult(
  methodName: string,
  imagePath: string,
  error: string,
): MethodResult {
  return {
    success: false,
    method: methodName,
    image_path: imagePath,
    scores: { mean: null, max: null, detection: null },
    error,
  };
}
