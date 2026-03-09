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

/** A scored table cell with heatmap anomaly data. */
export interface ScoredTableCell {
  row: number;
  column: number;
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  scores: {
    anomaly: number;
    heatmap_mean: number;
    heatmap_max: number;
  };
}

/** A cell flagged as abnormal by Gemini analysis. */
export interface AbnormalCell {
  row: number;
  column: number;
  header: string;
  text: string;
  reason?: string;
}

/** A detected table with per-cell heatmap scoring. */
export interface ScoredTable {
  bbox: { x: number; y: number; width: number; height: number };
  rows: number;
  columns: number;
  headers: string[];
  cells: ScoredTableCell[];
  confidence: number;
  /** Max anomaly score across all cells. */
  overall_anomaly: number;
  /** Gemini-analyzed cell values (accurate OCR). Only present when Gemini is available. */
  gemini_headers?: string[];
  gemini_cells?: Array<{
    row: number;
    column: number;
    header: string;
    text: string;
    is_abnormal: boolean;
    abnormal_reason?: string;
  }>;
  /** Cells flagged as abnormal by Gemini. */
  abnormal_cells?: AbnormalCell[];
}

export interface DocumentForensicsResult {
  success: boolean;
  method: string;
  ocr_engine: string;
  device: string;
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
    bbox: { x: number; y: number; width: number; height: number } | null;
    scores: {
      anomaly: number;
      heatmap_mean: number;
      heatmap_max: number;
    };
  } | null;
  fields: FieldResult[];
  /** Detected tables with per-cell heatmap scoring. */
  tables?: ScoredTable[];
  /** Gemini-identified suspicious regions from heatmap analysis. */
  suspicious_regions?: Array<{
    region: string;
    content: string;
    concern: string;
  }>;
  /** Gemini overall forensic assessment summary. */
  gemini_summary?: string;
  visualization_path: string | null;
  /** Base64-encoded JPEG of forensics summary (heatmap + bboxes + sidebar). */
  heatmap_b64?: string | null;
  notes: string[];
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
