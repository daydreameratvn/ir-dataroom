/**
 * Configuration for the document forensics service.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

/** Google Generative AI API key (required for Gemini extraction engine). */
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';

export function ensureOutputDir(): string {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  return OUTPUT_DIR;
}
