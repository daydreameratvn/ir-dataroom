/**
 * Shared types for document forensics results.
 */

export interface FieldResult {
  type: string;
  risk_weight: number;
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  scores: {
    anomaly: number;
    heatmap_mean: number;
    heatmap_max: number;
  };
}

export interface DocumentForensicsResult {
  success: boolean;
  verdict: 'NORMAL' | 'SUSPICIOUS' | 'TAMPERED' | 'ERROR';
  overall_score: number;
  risk_level: 'low' | 'medium' | 'high';
  trufor: {
    global_score: number;
    detection_score: number | null;
  };
  image: {
    path: string;
    width: number;
    height: number;
  };
  ocr_analysis: {
    total_fields: number;
    field_types_found: string[];
  };
  highest_risk_field: {
    type: string;
    risk_weight: number;
    text: string;
    scores: {
      anomaly: number;
      heatmap_mean: number;
      heatmap_max: number;
    };
  } | null;
  fields: FieldResult[];
  visualization_path: string | null;
  /** Base64-encoded PNG of TruFor heatmap blended on document (no bboxes). */
  heatmap_b64?: string | null;
  notes: string[];
  /** OCR/extraction engine used (populated for Gemini hybrid mode). */
  ocr_engine?: string;
  error?: string;
}

/** Result for the standalone extract_document_fields tool. */
export interface FieldExtractionResult {
  success: boolean;
  engine: string;
  document_type: string;
  image: { path: string; width: number; height: number };
  fields: Array<{
    label: string;
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number } | null;
    page_number?: number;
  }>;
  total_fields: number;
  processing_time_ms: number;
  error?: string;
}

export interface BatchForensicsResult {
  success: boolean;
  total_images: number;
  summary: {
    verdicts: {
      NORMAL: number;
      SUSPICIOUS: number;
      TAMPERED: number;
      ERROR: number;
    };
    avg_score: number;
    max_score: number;
    min_score: number;
  };
  results: Array<{
    image: string;
    verdict: string;
    score: number;
    fields: number;
    highest_risk: { type: string; score: number } | null;
    visualization: string | null;
    error?: string;
  }>;
  output_dir: string | null;
}
