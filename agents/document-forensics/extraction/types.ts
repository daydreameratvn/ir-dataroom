/**
 * Shared types for the pluggable field extraction module.
 */

export interface ExtractedField {
  /** Field type key, e.g. "patient_name", "amount", "date". */
  label: string;
  /** OCR'd / LLM-extracted text value. */
  text: string;
  /** Confidence score 0–1. */
  confidence: number;
  /** Absolute pixel bounding box in the original image coordinate space. */
  bbox: { x: number; y: number; width: number; height: number } | null;
  /** 1-based page number (for multi-page PDFs). */
  page_number?: number;
}

/** A single cell inside a detected table. */
export interface TableCell {
  /** 0-based row index. */
  row: number;
  /** 0-based column index. */
  column: number;
  /** OCR'd text content of the cell. */
  text: string;
  /** Pixel bounding box in original image coordinates. */
  bbox: { x: number; y: number; width: number; height: number } | null;
  /** OCR confidence 0–1. */
  confidence: number;
}

/** A table detected in the document. */
export interface DetectedTable {
  /** Bounding box enclosing the entire table. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Number of rows detected. */
  rows: number;
  /** Number of columns detected. */
  columns: number;
  /** Header texts (first row). */
  headers: string[];
  /** All cells in reading order. */
  cells: TableCell[];
  /** Overall detection confidence 0–1. */
  confidence: number;
  /** 1-based page number. */
  page_number?: number;
}

export interface UsageStats {
  /** Number of external AI API calls made (0 for local models). */
  api_calls: number;
  input_tokens?: number;
  output_tokens?: number;
  /** Thinking/reasoning tokens billed separately (Gemini 2.5+). */
  thinking_tokens?: number;
  /** Estimated cost in USD. */
  cost_usd?: number;
}

export interface ExtractionResult {
  fields: ExtractedField[];
  /** Tables detected in the document (with headers, rows, cells). */
  tables?: DetectedTable[];
  engine: string;
  image_width: number;
  image_height: number;
  processing_time_ms: number;
  usage?: UsageStats;
}

/** Field types recognized by the extraction system. */
export const FIELD_TYPES = [
  'patient_name',
  'total',
  'insurance_id',
  'amount',
  'price',
  'diagnosis',
  'id_number',
  'item_name',
  'date',
  'doctor_name',
  'quantity',
  'stamp',
  'hospital_name',
  'table_cell',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number] | 'unknown';

/** Risk weights per field type (matches Python DocumentAnalyzer). */
export const RISK_WEIGHTS: Record<string, number> = {
  patient_name: 1.0,
  total: 0.95,
  insurance_id: 0.9,
  amount: 0.9,
  price: 0.85,
  diagnosis: 0.8,
  id_number: 0.8,
  item_name: 0.7,
  date: 0.7,
  doctor_name: 0.7,
  quantity: 0.6,
  stamp: 0.6,
  hospital_name: 0.5,
  table_cell: 0.8,
  unknown: 0.0,
};

/** Fields that trigger a tampering verdict when their anomaly score is high. */
export const KEY_FIELDS = new Set([
  'patient_name',
  'amount',
  'total',
  'price',
  'insurance_id',
  'date',
  'id_number',
  'diagnosis',
]);
