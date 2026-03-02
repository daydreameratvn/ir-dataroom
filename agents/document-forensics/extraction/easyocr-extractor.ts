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

// ── Field classification ──────────────────────────────────────────────────────
//
// Priority-ordered regex rules matching the Python DocumentAnalyzer.
// Rules are checked in order — first match wins.

const FIELD_RULES: Array<{ re: RegExp; label: string }> = [
  // 1. INSURANCE_ID — specific prefixes (wins over bare digit amounts)
  { re: /\b(?:BHXH|BVNT|MBAL|HSC|AIA|PRU|PTI|BH|BN|HN)[A-Z0-9\-]{3,}/i, label: 'insurance_id' },
  { re: /\b(GB|GD|HC|TE|HN|HT)\s*\d[\d\s]{6,}\b/i,        label: 'insurance_id' },
  { re: /mã\s*(thẻ|số)\s*bhyt/i,                            label: 'insurance_id' },

  // 2. AMOUNT — currency prefix/suffix or thousand separators
  { re: /[₫$€£¥]\s*\d[\d,.]*/,                              label: 'amount' },
  { re: /\d[\d,.]*\s*(?:đồng|vnd|vnđ|đ|₫|triệu|nghìn)\b/i, label: 'amount' },
  { re: /\d{1,3}(?:[.,]\d{3})+/,                            label: 'amount' },
  { re: /tổng\s*(số\s*)?(tiền|chi\s*phí)/i,                 label: 'amount' },

  // 3. DIAGNOSIS — ICD-10 codes (uppercase letter + 2 digits + optional decimal)
  { re: /chẩn\s*đoán/i,                                     label: 'diagnosis' },
  { re: /\b[A-Z]\d{2}(?:\.\d+)?\b/,                         label: 'diagnosis' },

  // 4. ID_NUMBER — national ID / CCCD (9–12 bare digits)
  { re: /\b\d{9,12}\b/,                                     label: 'id_number' },
  { re: /mã\s*(y\s*tế|số\s*người\s*bệnh|bệnh\s*nhân)/i,   label: 'id_number' },
  { re: /số\s*(khám|lưu\s*trữ|hồ\s*sơ)/i,                  label: 'id_number' },

  // 5. DATE patterns
  { re: /\b\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}\b/,         label: 'date' },
  { re: /\b\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}\b/,           label: 'date' },
  { re: /ngày\s+\d{1,2}\s+tháng/i,                          label: 'date' },
  { re: /\d{1,2}\s+tháng\s+\d{1,2}\s+năm\s+\d{4}/i,        label: 'date' },

  // 6. DOCTOR_NAME — doctor title keywords
  { re: /\b(?:bác?\s*sĩ|bs\.|dr\.?|ths\.?)\b/i,            label: 'doctor_name' },

  // 7. HOSPITAL_NAME
  { re: /bệnh\s*viện/i,                                     label: 'hospital_name' },
  { re: /phòng\s*khám/i,                                    label: 'hospital_name' },

  // 8. PATIENT_NAME — label prefix
  { re: /họ\s*(tên|và\s*tên)\s*(người\s*bệnh)?\s*:/i,      label: 'patient_name' },
];

/** Detect title-case name: ≥2 words, each starting with uppercase, no digits. */
const TITLE_CASE_NAME_RE = /^(?:[A-ZÀ-Ỹ][a-zà-ỹ]*\s+){1,}[A-ZÀ-Ỹ][a-zà-ỹ]*$/;
const ALL_CAPS_NAME_RE = /^(?:[A-ZÀ-Ỹ]+\s+){1,}[A-ZÀ-Ỹ]+$/;

/**
 * Classify raw EasyOCR text into a semantic field label.
 * Matches the Python DocumentAnalyzer's classify_field() logic.
 */
function classifyText(text: string): string {
  const t = text.trim();

  // Check regex rules (priority order)
  for (const { re, label } of FIELD_RULES) {
    if (re.test(t)) return label;
  }

  // Heuristic: title-case or ALL-CAPS name with ≥2 words, no digits → patient_name
  if (!(/\d/.test(t)) && t.length >= 4 && (TITLE_CASE_NAME_RE.test(t) || ALL_CAPS_NAME_RE.test(t))) {
    return 'patient_name';
  }

  return 'unknown';
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
        label: classifyText(it.text_raw),
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
