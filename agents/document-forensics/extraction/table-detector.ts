/**
 * Spatial table detector — groups OCR bounding boxes into table structures.
 *
 * Heuristic approach:
 * 1. Cluster text bboxes into rows by Y-center alignment.
 * 2. Find contiguous row sequences with consistent multi-column structure.
 * 3. Include "thin" rows (fewer items) if sandwiched between table rows.
 * 4. Merge adjacent tables that overlap horizontally and are close vertically.
 * 5. Extract headers (first row) and data cells.
 */

import type { ExtractedField, DetectedTable, TableCell } from './types.ts';

// ── Configuration ────────────────────────────────────────────────────────────

/** Vertical tolerance for grouping text into the same row (pixels). */
const ROW_TOLERANCE_PX = 8;

/** Minimum number of columns to consider a row as a "strong" table row. */
const MIN_TABLE_COLS = 3;

/** Minimum number of rows (including header) to form a table. */
const MIN_TABLE_ROWS = 2;

/**
 * Maximum vertical gap between consecutive table rows (pixels).
 * Rows with larger gaps are considered separate tables.
 */
const MAX_ROW_GAP_PX = 50;

/**
 * Maximum vertical gap between two tables to consider merging them (pixels).
 */
const MERGE_GAP_PX = 30;

/**
 * Minimum horizontal overlap ratio (0–1) required to merge two tables.
 */
const MERGE_OVERLAP_RATIO = 0.5;

/**
 * Maximum column count ratio (larger/smaller) to allow merging.
 * Tables with very different column counts are likely different structures.
 */
const MERGE_MAX_COL_RATIO = 2.0;

// ── Helpers ──────────────────────────────────────────────────────────────────

interface FieldWithCenter {
  field: ExtractedField;
  cx: number;
  cy: number;
}

interface RowData {
  centerY: number;
  items: FieldWithCenter[];
}

function bboxCenter(bbox: { x: number; y: number; width: number; height: number }): { cx: number; cy: number } {
  return { cx: bbox.x + bbox.width / 2, cy: bbox.y + bbox.height / 2 };
}

/**
 * Group values into clusters where neighboring values differ by at most `tolerance`.
 * Returns array of [clusterCenter, indices[]].
 */
function clusterByProximity(values: number[], tolerance: number): Array<[number, number[]]> {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const clusters: Array<[number, number[]]> = [];
  let currentCluster: number[] = [];
  let clusterSum = 0;

  for (let k = 0; k < indexed.length; k++) {
    const item = indexed[k]!;
    if (currentCluster.length === 0) {
      currentCluster.push(item.i);
      clusterSum = item.v;
    } else {
      const prevVal = indexed[k - 1]!.v;
      if (item.v - prevVal <= tolerance) {
        currentCluster.push(item.i);
        clusterSum += item.v;
      } else {
        clusters.push([clusterSum / currentCluster.length, [...currentCluster]]);
        currentCluster = [item.i];
        clusterSum = item.v;
      }
    }
  }
  if (currentCluster.length > 0) {
    clusters.push([clusterSum / currentCluster.length, currentCluster]);
  }

  return clusters;
}

function horizontalOverlap(
  a: { x: number; width: number },
  b: { x: number; width: number },
): number {
  const aRight = a.x + a.width;
  const bRight = b.x + b.width;
  const overlapStart = Math.max(a.x, b.x);
  const overlapEnd = Math.min(aRight, bRight);
  if (overlapEnd <= overlapStart) return 0;
  const overlapWidth = overlapEnd - overlapStart;
  const minWidth = Math.min(a.width, b.width);
  return minWidth > 0 ? overlapWidth / minWidth : 0;
}

function mode(arr: number[]): number {
  const counts = new Map<number, number>();
  for (const v of arr) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  let bestCount = 0;
  for (const [v, c] of Array.from(counts.entries())) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

// ── Main detector ────────────────────────────────────────────────────────────

/** Minimum consecutive rows with right-aligned numbers to detect a receipt table. */
const MIN_RECEIPT_ROWS = 3;

/** Amount pattern — numbers with optional comma separators and decimal point. */
const AMOUNT_RE = /^\d[\d,]*\.\d{2}$/;

/**
 * Detect tables from a flat list of OCR-extracted fields using spatial heuristics.
 */
export function detectTablesFromFields(fields: ExtractedField[], imageWidth?: number): DetectedTable[] {
  // Filter to fields with valid bboxes
  const withBbox: FieldWithCenter[] = fields
    .filter((f) => f.bbox && f.bbox.width > 0 && f.bbox.height > 0)
    .map((f) => {
      const { cx, cy } = bboxCenter(f.bbox!);
      return { field: f, cx, cy };
    });

  if (withBbox.length < 4) return [];

  // Step 1: Cluster into rows by Y-center
  const rowClusters = clusterByProximity(
    withBbox.map((f) => f.cy),
    ROW_TOLERANCE_PX,
  );

  // Build row objects sorted by Y position
  const rows = rowClusters
    .map(([centerY, indices]) => ({
      centerY,
      items: indices.map((i) => withBbox[i]!).sort((a, b) => a.cx - b.cx),
    }))
    .sort((a, b) => a.centerY - b.centerY);

  // Step 2: Find contiguous sequences of "table-like" rows.
  // A row is "table-like" if it has >= MIN_TABLE_COLS items AND those items are
  // compact (short width) rather than long paragraph fragments.
  const tables: DetectedTable[] = [];
  let currentRun: RowData[] = [];

  /**
   * Check if a row looks like a table row (compact, multi-column items)
   * vs paragraph text (long text fragments that happen to be on the same line).
   */
  const isTableRow = (row: RowData): boolean => {
    if (row.items.length < MIN_TABLE_COLS) return false;
    // Compute median item width — table cells are typically narrow
    const widths = row.items
      .map((item) => item.field.bbox?.width ?? 0)
      .sort((a, b) => a - b);
    const medianWidth = widths[Math.floor(widths.length / 2)] ?? 0;
    // Table cell median width should be < 30% of row span
    const rowMinX = Math.min(...row.items.map((it) => it.field.bbox?.x ?? 0));
    const rowMaxX = Math.max(...row.items.map((it) => (it.field.bbox?.x ?? 0) + (it.field.bbox?.width ?? 0)));
    const rowSpan = rowMaxX - rowMinX;
    if (rowSpan <= 0) return false;
    return medianWidth < rowSpan * 0.3;
  };

  const flushRun = () => {
    if (currentRun.length >= MIN_TABLE_ROWS) {
      const table = buildTable(currentRun);
      if (table) tables.push(table);
    }
    currentRun = [];
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const prevRow = currentRun.length > 0 ? currentRun[currentRun.length - 1]! : null;
    const gap = prevRow ? row.centerY - prevRow.centerY : 0;

    if (!isTableRow(row)) {
      flushRun();
      continue;
    }

    if (gap > MAX_ROW_GAP_PX) {
      flushRun();
    }

    currentRun.push(row);
  }
  flushRun();

  // Step 3: Detect receipt/invoice tables (2-column: description + amount)
  const receiptTables = detectReceiptTables(rows, imageWidth);
  for (const rt of receiptTables) {
    tables.push(rt);
  }

  // Step 4: Merge adjacent tables that overlap horizontally
  return mergeTables(tables);
}

// ── Receipt/invoice table detector ──────────────────────────────────────────

/**
 * Detect 2-column receipt/invoice tables (description + right-aligned amount).
 * These have only 2 items per row, so they fall below MIN_TABLE_COLS=3.
 *
 * Heuristic: find consecutive rows where:
 * - The row has exactly 2 items
 * - The rightmost item matches AMOUNT_RE (e.g. "210.00", "3,710.00")
 * - The rightmost item is positioned at >60% of the row span or image width
 */
function detectReceiptTables(rows: RowData[], imageWidth?: number): DetectedTable[] {
  const tables: DetectedTable[] = [];
  let currentRun: RowData[] = [];

  const isReceiptRow = (row: RowData): boolean => {
    if (row.items.length !== 2) return false;
    const rightItem = row.items[row.items.length - 1]!;
    const text = rightItem.field.text.trim();
    if (!AMOUNT_RE.test(text)) return false;

    // Check right-alignment: amount should be on the right side
    if (imageWidth && imageWidth > 0) {
      const rightEdge = (rightItem.field.bbox?.x ?? 0) + (rightItem.field.bbox?.width ?? 0);
      return rightEdge > imageWidth * 0.5;
    }
    // Fallback: amount's X center should be well right of description's X center
    const leftItem = row.items[0]!;
    return rightItem.cx > leftItem.cx + 100;
  };

  const flushReceiptRun = () => {
    if (currentRun.length >= MIN_RECEIPT_ROWS) {
      const table = buildReceiptTable(currentRun);
      if (table) tables.push(table);
    }
    currentRun = [];
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const prevRow = currentRun.length > 0 ? currentRun[currentRun.length - 1]! : null;
    const gap = prevRow ? row.centerY - prevRow.centerY : 0;

    if (!isReceiptRow(row)) {
      flushReceiptRun();
      continue;
    }

    if (gap > MAX_ROW_GAP_PX) {
      flushReceiptRun();
    }

    currentRun.push(row);
  }
  flushReceiptRun();

  return tables;
}

function buildReceiptTable(rows: RowData[]): DetectedTable | null {
  if (rows.length < MIN_RECEIPT_ROWS) return null;

  const cells: TableCell[] = [];
  const allBboxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    // Column 0 = description (left), Column 1 = amount (right)
    for (let colIdx = 0; colIdx < row.items.length; colIdx++) {
      const item = row.items[colIdx]!;
      cells.push({
        row: rowIdx,
        column: colIdx,
        text: item.field.text,
        bbox: item.field.bbox,
        confidence: item.field.confidence,
      });
      if (item.field.bbox) allBboxes.push(item.field.bbox);
    }
  }

  if (cells.length === 0 || allBboxes.length === 0) return null;

  const x0 = Math.min(...allBboxes.map((b) => b.x));
  const y0 = Math.min(...allBboxes.map((b) => b.y));
  const x1 = Math.max(...allBboxes.map((b) => b.x + b.width));
  const y1 = Math.max(...allBboxes.map((b) => b.y + b.height));

  // Headers from first row
  const headers = rows[0]!.items.map((item) => item.field.text);

  const avgConf = cells.reduce((s, c) => s + c.confidence, 0) / cells.length;

  return {
    bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    rows: rows.length,
    columns: 2,
    headers,
    cells,
    confidence: Math.round(avgConf * 1000) / 1000,
  };
}

// ── Table merger ─────────────────────────────────────────────────────────────

function mergeTables(tables: DetectedTable[]): DetectedTable[] {
  if (tables.length <= 1) return tables;

  // Sort by Y position
  const sorted = [...tables].sort((a, b) => a.bbox.y - b.bbox.y);
  const merged: DetectedTable[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = sorted[i]!;

    const prevBottom = prev.bbox.y + prev.bbox.height;
    const vertGap = curr.bbox.y - prevBottom;
    const hOverlap = horizontalOverlap(prev.bbox, curr.bbox);

    const colRatio = Math.max(prev.columns, curr.columns) / Math.max(1, Math.min(prev.columns, curr.columns));

    if (vertGap <= MERGE_GAP_PX && hOverlap >= MERGE_OVERLAP_RATIO && colRatio <= MERGE_MAX_COL_RATIO) {
      // Merge: combine bboxes, renumber rows, merge cells
      const rowOffset = prev.rows;
      const newCells = [
        ...prev.cells,
        ...curr.cells.map((c) => ({ ...c, row: c.row + rowOffset })),
      ];

      // Determine merged column count (max of both)
      const maxCols = Math.max(prev.columns, curr.columns);

      // Merge headers: use prev's headers, extend with curr's if it has more columns
      const headers = [...prev.headers];
      for (let c = headers.length; c < curr.headers.length; c++) {
        headers.push(curr.headers[c]!);
      }

      const x0 = Math.min(prev.bbox.x, curr.bbox.x);
      const y0 = Math.min(prev.bbox.y, curr.bbox.y);
      const x1 = Math.max(prev.bbox.x + prev.bbox.width, curr.bbox.x + curr.bbox.width);
      const y1 = Math.max(prev.bbox.y + prev.bbox.height, curr.bbox.y + curr.bbox.height);

      merged[merged.length - 1] = {
        bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
        rows: prev.rows + curr.rows,
        columns: maxCols,
        headers,
        cells: newCells,
        confidence: (prev.confidence + curr.confidence) / 2,
      };
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

// ── Table builder ────────────────────────────────────────────────────────────

function buildTable(rows: RowData[]): DetectedTable | null {
  if (rows.length < MIN_TABLE_ROWS) return null;

  // Determine column count from the max item count across rows
  // (use max instead of mode to capture the widest row as reference)
  const colCounts = rows.map((r) => r.items.length);
  const maxColCount = Math.max(...colCounts);
  if (maxColCount < MIN_TABLE_COLS) return null;

  // Use columns from the widest row to establish column centers
  const referenceRow = rows.find((r) => r.items.length === maxColCount) ?? rows[0]!;
  const colCenters = referenceRow.items.map((item) => item.cx);

  // Build cells by assigning each item to the nearest column
  const cells: TableCell[] = [];
  const allBboxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const assigned = new Map<number, FieldWithCenter>();
    for (const item of row.items) {
      let bestCol = 0;
      let bestDist = Infinity;
      for (let c = 0; c < colCenters.length; c++) {
        const dist = Math.abs(item.cx - colCenters[c]!);
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
        }
      }
      const existing = assigned.get(bestCol);
      if (!existing || Math.abs(item.cx - colCenters[bestCol]!) < Math.abs(existing.cx - colCenters[bestCol]!)) {
        assigned.set(bestCol, item);
      }
    }

    for (const [colIdx, item] of Array.from(assigned.entries())) {
      cells.push({
        row: rowIdx,
        column: colIdx,
        text: item.field.text,
        bbox: item.field.bbox,
        confidence: item.field.confidence,
      });
      if (item.field.bbox) allBboxes.push(item.field.bbox);
    }
  }

  if (cells.length === 0 || allBboxes.length === 0) return null;

  // Compute enclosing bbox
  const x0 = Math.min(...allBboxes.map((b) => b.x));
  const y0 = Math.min(...allBboxes.map((b) => b.y));
  const x1 = Math.max(...allBboxes.map((b) => b.x + b.width));
  const y1 = Math.max(...allBboxes.map((b) => b.y + b.height));

  // Headers from first row
  const headers: string[] = [];
  for (let c = 0; c < colCenters.length; c++) {
    const cell = cells.find((ce) => ce.row === 0 && ce.column === c);
    headers.push(cell?.text ?? '');
  }

  const avgConf = cells.reduce((s, c) => s + c.confidence, 0) / cells.length;

  return {
    bbox: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    rows: rows.length,
    columns: colCenters.length,
    headers,
    cells,
    confidence: Math.round(avgConf * 1000) / 1000,
  };
}
