/**
 * Gemini-based document field extraction.
 *
 * Uses Google Gemini Vision (gemini-2.5-flash) to locate bounding boxes
 * and text for known document field types in Vietnamese / English documents.
 *
 * Bounding box format from Gemini: [y_min, x_min, y_max, x_max] normalized 0–1000.
 * We convert to absolute pixel {x, y, width, height}.
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import sharp from 'sharp';

import { getGeminiApiKey } from '../config.ts';
import { FIELD_TYPES } from './types.ts';
import type { ExtractedField, ExtractionResult, UsageStats } from './types.ts';
import { getMarketConfig } from './market-config.ts';
import type { MarketCode, MarketConfig } from './market-config.ts';

// Gemini 2.5 Flash pricing (USD per token)
const PRICE = {
  input:    0.075  / 1_000_000,
  output:   0.30   / 1_000_000,
  thinking: 3.50   / 1_000_000,
} as const;

// ── Model config ──────────────────────────────────────────────────────────────

const GEMINI_FLASH = {
  model: 'gemini-2.5-flash',
  maxOutputTokens: 65_535,
  temperature: 0,
} as const;

// ── Response schema ───────────────────────────────────────────────────────────

const fieldItemSchema = z.object({
  box_2d: z
    .array(z.number())
    .nullable()
    .describe('Bounding box [y_min, x_min, y_max, x_max] normalized 0–1000. Null if field not found.'),
  label: z
    .string()
    .nullable()
    .describe('Field type key exactly as listed in the prompt'),
  text: z
    .string()
    .nullable()
    .describe('Extracted text value, verbatim from the document'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Confidence 0–1'),
  page_number: z
    .number()
    .optional()
    .describe('1-based page number where the field appears'),
});

const responseSchema = z.array(fieldItemSchema);

// ── MIME type helpers ─────────────────────────────────────────────────────────

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'image/jpeg';
  }
}

// ── Gemini Files API helpers ──────────────────────────────────────────────────

interface GeminiFile {
  name?: string;
  uri?: string;
  state?: string;
  mimeType?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadToGemini(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string,
): Promise<GeminiFile> {
  const bytes = readFileSync(filePath);
  const uploaded = await ai.files.upload({
    file: new Blob([bytes], { type: mimeType }),
    config: { mimeType },
  });

  if (!uploaded.name) {
    throw new Error('Gemini Files API: no name returned for uploaded file');
  }

  const fileName = uploaded.name;
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const f = await ai.files.get({ name: fileName });
    if (f.state === 'ACTIVE') return f as GeminiFile;
    if (f.state === 'FAILED') {
      throw new Error(`Gemini file ${fileName} failed processing`);
    }
    await sleep(2_000);
  }
  throw new Error(`Gemini file ${fileName} timed out waiting for ACTIVE`);
}

// ── Coordinate conversion ─────────────────────────────────────────────────────

function convertBbox(
  box2d: number[],
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const yMin = box2d[0] ?? 0;
  const xMin = box2d[1] ?? 0;
  const yMax = box2d[2] ?? 0;
  const xMax = box2d[3] ?? 0;
  return {
    x: Math.round((xMin / 1000) * imageWidth),
    y: Math.round((yMin / 1000) * imageHeight),
    width: Math.round(((xMax - xMin) / 1000) * imageWidth),
    height: Math.round(((yMax - yMin) / 1000) * imageHeight),
  };
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(promptLanguage: string): string {
  const fieldList = FIELD_TYPES.map(
    (f) => `- ${f}`,
  ).join('\n');

  return `You are an expert in ${promptLanguage} and English medical document analysis.
Your task is to extract EVERY visible text element from this document — headings, labels, values, numbers, stamps, codes, and any other text — as individual items.

For each text element:
- Set box_2d to [y_min, x_min, y_max, x_max] normalized 0–1000.
- Set text to the verbatim text exactly as it appears in the document.
- Set label to the best matching semantic type from the list below, or "text" if none fits.
- Set confidence to your certainty (0–1).
- Set page_number to 1 (or the actual page for PDFs).

Known semantic labels (use when the content clearly matches):
${fieldList}
- text  (generic — use for any element that does not match the above types)

Rules:
- Return EVERY text element visible in the document. Do NOT skip elements.
- Do NOT merge separate text blocks into one entry.
- Do NOT omit labels, headings, structural text, or repeated values.
- Return entries in approximate top-to-bottom, left-to-right reading order.`;
}

// ── Main extractor ────────────────────────────────────────────────────────────

export class GeminiExtractor {
  private ai: GoogleGenAI;
  private readonly marketConfig: MarketConfig;

  constructor(market: MarketCode, apiKey?: string) {
    const key = apiKey ?? getGeminiApiKey();
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is not set. Set the environment variable to use Gemini extraction.',
      );
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.marketConfig = getMarketConfig(market);
  }

  async extract(imagePath: string): Promise<ExtractionResult> {
    if (!existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }

    const startMs = Date.now();

    const mimeType = getMimeType(imagePath);
    let imageWidth = 0;
    let imageHeight = 0;
    if (mimeType !== 'application/pdf') {
      const meta = await sharp(imagePath).metadata();
      imageWidth = meta.width ?? 0;
      imageHeight = meta.height ?? 0;
    }

    let geminiFile: GeminiFile | null = null;
    try {
      geminiFile = await uploadToGemini(this.ai, imagePath, mimeType);

      if (!geminiFile.uri) {
        throw new Error('Gemini file has no URI after upload');
      }

      const jsonSchema = zodToJsonSchema(responseSchema);
      const response = await this.ai.models.generateContent({
        model: GEMINI_FLASH.model,
        config: {
          maxOutputTokens: GEMINI_FLASH.maxOutputTokens,
          temperature: GEMINI_FLASH.temperature,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          thinkingConfig: { thinkingBudget: 1024 },
          systemInstruction: [buildSystemPrompt(this.marketConfig.promptLanguage)],
        },
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: geminiFile.uri, mimeType: geminiFile.mimeType ?? mimeType } },
              { text: 'Extract all field bounding boxes and text from this document.' },
            ],
          },
        ],
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned no content for bounding box extraction');
      }

      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(text);
      } catch {
        const lastBrace = text.lastIndexOf('}');
        if (lastBrace !== -1) {
          try {
            parsedRaw = JSON.parse(text.slice(0, lastBrace + 1) + ']');
          } catch {
            throw new Error(`Gemini returned malformed JSON (truncated?): ${text.slice(0, 200)}`);
          }
        } else {
          throw new Error(`Gemini returned unparseable JSON: ${text.slice(0, 200)}`);
        }
      }
      const parsed = responseSchema.parse(parsedRaw);

      const fields: ExtractedField[] = parsed
        .filter(
          (item) =>
            item.label != null &&
            item.label !== '' &&
            item.text != null &&
            item.text !== '',
        )
        .map((item) => {
          const bbox =
            item.box_2d?.length === 4 && imageWidth > 0 && imageHeight > 0
              ? convertBbox(item.box_2d, imageWidth, imageHeight)
              : null;

          return {
            label: item.label!,
            text: item.text!,
            confidence: item.confidence ?? 0.9,
            bbox,
            page_number: item.page_number ?? 1,
          };
        });

      const meta2 = response.usageMetadata as Record<string, number> | undefined;
      const inputTokens    = meta2?.promptTokenCount      ?? 0;
      const outputTokens   = meta2?.candidatesTokenCount  ?? 0;
      const thinkingTokens = meta2?.thoughtsTokenCount    ?? 0;
      const costUsd = inputTokens * PRICE.input
                    + outputTokens * PRICE.output
                    + thinkingTokens * PRICE.thinking;

      const usage: UsageStats = {
        api_calls:      2,
        input_tokens:   inputTokens   || undefined,
        output_tokens:  outputTokens  || undefined,
        thinking_tokens: thinkingTokens || undefined,
        cost_usd:       +costUsd.toFixed(6),
      };

      return {
        fields,
        engine: 'gemini',
        image_width: imageWidth,
        image_height: imageHeight,
        processing_time_ms: Date.now() - startMs,
        usage,
      };
    } finally {
      if (geminiFile?.name) {
        await this.ai.files
          .delete({ name: geminiFile.name })
          .catch((err: unknown) =>
            console.warn('[gemini-extractor] file cleanup failed:', err),
          );
      }
    }
  }
}
