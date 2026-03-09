/**
 * Gemini-based document analyzer.
 *
 * Single API call per document that:
 * 1. Reads all detected tables accurately (replacing noisy EasyOCR text)
 * 2. Flags abnormal cell values in tables
 * 3. Summarizes suspicious heatmap regions (what content is there and why it's flagged)
 *
 * Optimized: exactly 1 Gemini call per document.
 */

import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import sharp from 'sharp';

import { getGeminiApiKey } from '../config.ts';
import type { DetectedTable, TableCell } from './types.ts';
import type { MarketCode } from './market-config.ts';
import { getMarketConfig } from './market-config.ts';
import type { FieldResult } from '../types.ts';

// ── Gemini config ────────────────────────────────────────────────────────────

const GEMINI_FLASH = {
  model: 'gemini-2.5-flash',
  maxOutputTokens: 32_768,
  temperature: 0,
} as const;

// ── Response schema ──────────────────────────────────────────────────────────

const cellSchema = z.object({
  row: z.number().describe('0-based row index'),
  column: z.number().describe('0-based column index'),
  header: z.string().describe('Column header this cell belongs to'),
  text: z.string().describe('Exact cell text value'),
  is_abnormal: z
    .boolean()
    .describe('true if the value appears medically/statistically abnormal, altered, or inconsistent'),
  abnormal_reason: z
    .string()
    .optional()
    .describe('Brief explanation if abnormal'),
});

const singleTableSchema = z.object({
  table_index: z.number().describe('0-based index matching the image order'),
  headers: z.array(z.string()).describe('Column headers'),
  rows: z.number().describe('Total rows including header'),
  columns: z.number().describe('Total columns'),
  cells: z.array(cellSchema),
});

const suspiciousRegionSchema = z.object({
  region: z.string().describe('Brief description of the region location (e.g. "top-left stamp area", "patient name field")'),
  content: z.string().describe('What text/content is in this region'),
  concern: z.string().describe('Why this region might be suspicious (e.g. "text appears re-typed", "inconsistent font", "value seems altered")'),
});

const documentAnalysisSchema = z.object({
  tables: z.array(singleTableSchema),
  suspicious_regions: z
    .array(suspiciousRegionSchema)
    .describe('Regions in the heatmap image that show high heat (red/orange/yellow) and may indicate tampering'),
  summary: z
    .string()
    .describe('1-3 sentence overall forensic assessment of the document integrity'),
});

// ── Crop helper ──────────────────────────────────────────────────────────────

async function cropTableRegion(
  imagePath: string,
  bbox: { x: number; y: number; width: number; height: number },
  padding: number = 10,
): Promise<Buffer> {
  const meta = await sharp(imagePath, { failOnError: false }).metadata();
  const imgW = meta.width ?? 0;
  const imgH = meta.height ?? 0;

  const left = Math.max(0, bbox.x - padding);
  const top = Math.max(0, bbox.y - padding);
  const width = Math.min(imgW - left, bbox.width + 2 * padding);
  const height = Math.min(imgH - top, bbox.height + 2 * padding);

  return sharp(imagePath, { failOnError: false })
    .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(width), height: Math.round(height) })
    .png()
    .toBuffer();
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildDocumentAnalysisPrompt(market: MarketCode, tableCount: number, hasSuspiciousFields: boolean): string {
  const config = getMarketConfig(market);

  const tablePart = tableCount > 0
    ? `\n## Tables
You are given ${tableCount} cropped table image(s) labeled "Table 0", "Table 1", etc.
For EACH table:
1. Read EVERY cell accurately, including headers.
2. Return the full table structure: table_index, headers, rows, columns, and all cells.
3. For each cell, set is_abnormal=true if the value is medically abnormal, visually inconsistent, or shows signs of editing.
- Read exact text — do NOT guess or translate.
- Include empty cells (text="").
- Row 0 is the header row.`
    : '';

  const suspiciousPart = hasSuspiciousFields
    ? `\n## Suspicious Regions
You are also given a forensic heatmap overlay of the document. Red/orange/yellow areas indicate regions where pixel-level analysis detected potential tampering or manipulation.
Examine the hot regions in the heatmap and describe:
- What content/text is in each suspicious area
- Why the tampering detection may have flagged it (e.g. different font, re-typed text, pasted content, inconsistent background)
Only report regions that appear genuinely suspicious. Ignore regions that are hot simply due to stamps, photos, or normal document features.`
    : '';

  return `You are an expert forensic document analyst specializing in ${config.promptLanguage} and English medical documents.

You will analyze a document for integrity issues.${tablePart}${suspiciousPart}

## Summary
Provide a 1-3 sentence overall forensic assessment. Is this document likely authentic, or are there concerns?
Be specific about what looks normal vs. suspicious.`;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AnalyzedCell extends TableCell {
  header: string;
  is_abnormal: boolean;
  abnormal_reason?: string;
}

export interface TableAnalysisResult {
  headers: string[];
  rows: number;
  columns: number;
  cells: AnalyzedCell[];
  abnormal_cells: AnalyzedCell[];
}

export interface SuspiciousRegion {
  region: string;
  content: string;
  concern: string;
}

export interface DocumentAnalysisResult {
  tables: TableAnalysisResult[];
  suspicious_regions: SuspiciousRegion[];
  summary: string;
}

// ── Main analyzer (single API call) ──────────────────────────────────────────

/**
 * Analyze a document with a SINGLE Gemini API call.
 *
 * Combines table reading, abnormality detection, and suspicious region summarization
 * into one request. Sends:
 * - The original document image
 * - The heatmap overlay image (if available)
 * - Cropped table images (if tables detected)
 *
 * Returns structured table data + suspicious region descriptions + overall summary.
 */
export async function analyzeDocumentWithGemini(
  imagePath: string,
  tables: DetectedTable[],
  market: MarketCode,
  heatmapBuf: Buffer | null,
  scoredFields: FieldResult[],
  apiKey?: string,
): Promise<DocumentAnalysisResult> {
  const key = apiKey ?? getGeminiApiKey();
  if (!key) {
    throw new Error('GEMINI_API_KEY is not set. Required for document analysis.');
  }

  const ai = new GoogleGenAI({ apiKey: key });

  // Check if there are suspicious fields worth analyzing
  const hasSuspiciousFields = heatmapBuf != null && scoredFields.some((f) => f.scores.heatmap_max > 0.15);

  // Build message parts
  type Part = { inlineData: { mimeType: string; data: string } } | { text: string };
  const parts: Part[] = [];

  // 1. Original document image
  const docBuf = await sharp(imagePath, { failOnError: false }).png().toBuffer();
  parts.push({ text: 'Original document:' });
  parts.push({ inlineData: { mimeType: 'image/png', data: docBuf.toString('base64') } });

  // 2. Heatmap overlay (if available and there are suspicious regions)
  if (heatmapBuf && hasSuspiciousFields) {
    // Composite heatmap over original for context
    const meta = await sharp(imagePath, { failOnError: false }).metadata();
    const W = meta.width ?? 800;
    const H = meta.height ?? 1000;

    const resizedHeatmap = await sharp(heatmapBuf)
      .resize(W, H, { fit: 'fill' })
      .ensureAlpha(0.55)
      .png()
      .toBuffer();

    const overlayBuf = await sharp(docBuf)
      .composite([{ input: resizedHeatmap, gravity: 'northwest', blend: 'over' }])
      .png()
      .toBuffer();

    parts.push({ text: 'Forensic heatmap overlay (red/orange = high suspicion, blue/green = normal):' });
    parts.push({ inlineData: { mimeType: 'image/png', data: overlayBuf.toString('base64') } });
  }

  // 3. Table crops
  if (tables.length > 0) {
    const crops = await Promise.all(tables.map((t) => cropTableRegion(imagePath, t.bbox)));
    for (let i = 0; i < crops.length; i++) {
      parts.push({ text: `Table ${i}:` });
      parts.push({ inlineData: { mimeType: 'image/png', data: crops[i]!.toString('base64') } });
    }
  }

  parts.push({ text: 'Analyze this document: extract table data, identify suspicious regions from the heatmap, and provide an overall forensic assessment.' });

  const jsonSchema = z.toJSONSchema(documentAnalysisSchema);
  const response = await ai.models.generateContent({
    model: GEMINI_FLASH.model,
    config: {
      maxOutputTokens: GEMINI_FLASH.maxOutputTokens,
      temperature: GEMINI_FLASH.temperature,
      responseMimeType: 'application/json',
      responseJsonSchema: jsonSchema,
      thinkingConfig: { thinkingBudget: 4096 },
      systemInstruction: [buildDocumentAnalysisPrompt(market, tables.length, hasSuspiciousFields)],
    },
    contents: [{ role: 'user', parts }],
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned no content for document analysis');
  }

  const parsed = documentAnalysisSchema.parse(JSON.parse(text));

  // Map table results
  const tableResultMap = new Map<number, TableAnalysisResult>();
  for (const t of parsed.tables) {
    const cells: AnalyzedCell[] = t.cells.map((c) => ({
      row: c.row,
      column: c.column,
      text: c.text,
      header: c.header,
      bbox: null,
      confidence: 0.95,
      is_abnormal: c.is_abnormal,
      abnormal_reason: c.abnormal_reason,
    }));

    tableResultMap.set(t.table_index, {
      headers: t.headers,
      rows: t.rows,
      columns: t.columns,
      cells,
      abnormal_cells: cells.filter((c) => c.is_abnormal),
    });
  }

  const tableResults = tables.map((_, i) =>
    tableResultMap.get(i) ?? { headers: [], rows: 0, columns: 0, cells: [], abnormal_cells: [] },
  );

  return {
    tables: tableResults,
    suspicious_regions: parsed.suspicious_regions,
    summary: parsed.summary,
  };
}
