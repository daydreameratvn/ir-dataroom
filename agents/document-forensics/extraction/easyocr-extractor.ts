/**
 * Raw EasyOCR document text extraction.
 *
 * Calls EasyOCR via a Python subprocess and returns every detected text line
 * with its bounding box.
 *
 * Config (env vars):
 *   EASYOCR_PYTHON  - path to python interpreter for EasyOCR (default: python3)
 *   EASYOCR_LANG    - comma-separated language codes (default: "vi,en")
 */

import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { PYTHON_PROJECT_PATH } from '../config.ts';
import type { ExtractedField, ExtractionResult } from './types.ts';

// ── Python inline script ─────────────────────────────────────────────────────

const EASYOCR_SCRIPT = `
import sys, json, warnings
warnings.filterwarnings("ignore")

img_path = sys.argv[1]
langs    = sys.argv[2].split(',') if len(sys.argv) > 2 else ['vi', 'en']

import easyocr
reader  = easyocr.Reader(langs, verbose=False)
results = reader.readtext(img_path)

raw_items = []
for (bbox_pts, text, confidence) in results:
    if not text.strip():
        continue
    xs = [p[0] for p in bbox_pts]
    ys = [p[1] for p in bbox_pts]
    raw_items.append({
        "text_raw":   text.strip(),
        "confidence": round(float(confidence), 4),
        "box":        [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))],
    })

print(json.dumps(raw_items, ensure_ascii=False))
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getLangs(): string {
  return process.env.EASYOCR_LANG ?? 'vi,en';
}

function runPython(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use `uv run` to run inside the bundled Python venv
    const proc = spawn('uv', ['run', '--project', PYTHON_PROJECT_PATH, 'python', '-c', script, ...args], {
      cwd: PYTHON_PROJECT_PATH,
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => stdout.push(d));
    proc.stderr.on('data', (d: Buffer) => stderr.push(d));

    proc.on('close', (code) => {
      if (code !== 0) {
        const errText = Buffer.concat(stderr).toString().slice(-1500);
        reject(new Error(`Python process exited ${code}: ${errText}`));
      } else {
        resolve(Buffer.concat(stdout).toString());
      }
    });

    proc.on('error', reject);
  });
}

// ── Extractor ─────────────────────────────────────────────────────────────────

export class EasyOCRExtractor {
  private readonly langs: string;

  constructor(langs?: string) {
    this.langs = langs ?? getLangs();
  }

  async extract(imagePath: string): Promise<ExtractionResult> {
    if (!existsSync(imagePath)) {
      throw new Error(`File not found: ${imagePath}`);
    }

    const startMs = Date.now();

    const meta = await sharp(imagePath).metadata();
    const imageWidth  = meta.width  ?? 0;
    const imageHeight = meta.height ?? 0;

    const step1Out = await runPython(EASYOCR_SCRIPT, [
      imagePath,
      this.langs,
    ]);

    const jsonLine1 = step1Out
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('['));

    if (!jsonLine1) {
      throw new Error(`EasyOCR returned no JSON. Output: ${step1Out.slice(0, 400)}`);
    }

    type RawItem = {
      text_raw: string;
      confidence: number;
      box: [number, number, number, number];
    };

    const items = JSON.parse(jsonLine1) as RawItem[];

    const fields: ExtractedField[] = items.map((it) => {
      const [x1, y1, x2, y2] = it.box;
      return {
        label: 'easyocr:text',
        text: it.text_raw,
        confidence: it.confidence,
        bbox: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
        page_number: 1,
      };
    });

    return {
      fields,
      engine: 'easyocr',
      image_width:  imageWidth,
      image_height: imageHeight,
      processing_time_ms: Date.now() - startMs,
      usage: { api_calls: 0 },
    };
  }
}
