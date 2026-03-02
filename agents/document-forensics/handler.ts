/**
 * HTTP entry point for the document forensics service.
 *
 * Three handler functions for analyze, batch, and extract operations.
 */

import type { DocumentForensicsResult, BatchForensicsResult, FieldExtractionResult } from './types.ts';
import {
  advancedDocumentForensics,
  batchDocumentForensics,
  extractDocumentFields,
} from './forensics.ts';

// ── Request types ─────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  image_path?: string;
  image_base64?: string;
  ocr_engine?: 'easyocr' | 'gemini';
  device?: string;
  output_dir?: string;
}

export interface BatchRequest {
  image_paths: string[];
  device?: string;
  concurrency?: number;
  output_dir?: string;
}

export interface ExtractFieldsRequest {
  image_path: string;
  ocr_engine?: 'easyocr' | 'gemini';
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Analyze a single document for tampering.
 */
export async function handleAnalyze(
  request: AnalyzeRequest,
): Promise<DocumentForensicsResult> {
  const imagePath = request.image_path;
  if (!imagePath) {
    return {
      success: false,
      method: 'advanced_document_forensics',
      ocr_engine: request.ocr_engine ?? 'easyocr',
      device: request.device ?? 'auto',
      verdict: 'ERROR',
      overall_score: 0,
      risk_level: 'low',
      trufor: { global_score: 0, detection_score: null },
      image: { path: '', width: 0, height: 0 },
      ocr_analysis: { total_fields: 0, field_types_found: [] },
      highest_risk_field: null,
      fields: [],
      visualization_path: null,
      notes: [],
      error: 'image_path is required',
    };
  }

  return advancedDocumentForensics(
    imagePath,
    request.output_dir,
    request.device ?? 'auto',
    request.ocr_engine,
  );
}

/**
 * Analyze multiple documents in parallel.
 */
export async function handleBatch(
  request: BatchRequest,
): Promise<BatchForensicsResult> {
  if (!request.image_paths || request.image_paths.length === 0) {
    return {
      success: false,
      total_images: 0,
      summary: {
        verdicts: { NORMAL: 0, SUSPICIOUS: 0, TAMPERED: 0, ERROR: 0 },
        avg_score: 0,
        max_score: 0,
        min_score: 0,
      },
      results: [],
      output_dir: null,
    };
  }

  return batchDocumentForensics(
    request.image_paths,
    request.output_dir,
    request.device ?? 'auto',
    request.concurrency ?? 3,
  );
}

/**
 * Extract document fields without TruFor scoring.
 */
export async function handleExtractFields(
  request: ExtractFieldsRequest,
): Promise<FieldExtractionResult> {
  return extractDocumentFields(
    request.image_path,
    request.ocr_engine,
  );
}
