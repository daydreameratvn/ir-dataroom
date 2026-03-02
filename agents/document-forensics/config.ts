/**
 * Configuration for the document forensics service.
 *
 * Reads .env from service root if present (local dev).
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Auto-load .env from service root (Bun loads it in CLI, but ensure it works everywhere)
const _envPath = resolve(__dirname, '.env');
if (existsSync(_envPath)) {
  for (const line of readFileSync(_envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
  }
}

/** Root of the document-forensics service. */
export const SERVICE_ROOT = __dirname;

/** Path to the bundled Python package. */
export const PYTHON_PROJECT_PATH = resolve(SERVICE_ROOT, 'python');

/** Directory for TruFor model weights. */
export const WEIGHTS_DIR = resolve(PYTHON_PROJECT_PATH, 'weights');

/** Default output directory for visualizations. */
export const OUTPUT_DIR = resolve(SERVICE_ROOT, 'output');

/** Maximum image dimension (width or height). Larger images are proportionally resized. */
export const MAX_IMAGE_SIZE = 4096;

/** Timeout for Python bridge calls in ms. */
export const PYTHON_BRIDGE_TIMEOUT = Number(
  process.env.PYTHON_BRIDGE_TIMEOUT ?? 120_000,
);

/** OCR engine: 'easyocr' (default, free, local) or 'gemini' (cloud, paid). */
export type OcrEngine = 'easyocr' | 'gemini';
export function getOcrEngine(): OcrEngine {
  const v = process.env.OCR_ENGINE ?? 'easyocr';
  return v === 'gemini' ? 'gemini' : 'easyocr';
}

/**
 * Google Generative AI API key (required for Gemini extraction engine).
 * Read lazily from process.env so SSM can populate it after module load.
 */
export function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY ?? '';
}

export function ensureOutputDir(): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}
