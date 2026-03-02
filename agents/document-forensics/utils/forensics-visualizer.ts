/**
 * Shared visualization utilities for forensic document analysis.
 */

import sharp from 'sharp';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BboxField {
  label: string;
  text: string;
  confidence: number;
  /** Anomaly score 0–1 (undefined for engines with no heatmap). */
  anomaly?: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Sidebar panel width in pixels. */
export const PANEL_W = 300;

/**
 * Minimum anomaly score required to draw a bounding box.
 * Configurable via BBOX_MIN_SCORE environment variable.
 */
export const SHOW_BBOX_THRESHOLD = Math.max(
  0,
  Math.min(1, parseFloat(process.env.BBOX_MIN_SCORE ?? '0.30')),
);

/** Verdict → badge colour mapping. */
export const VERDICT_COLOR: Record<string, string> = {
  TAMPERED:   '#dc2828',
  SUSPICIOUS: '#ff8c00',
  NORMAL:     '#32c832',
};

// ── Color helpers ─────────────────────────────────────────────────────────────

export function anomalyColor(score: number): string {
  if (score >= 0.50) return '#dc2828';
  if (score >= 0.30) return '#ff8c00';
  if (score >= 0.15) return '#c8c800';
  return '#32c832';
}

// ── Forensics summary image ───────────────────────────────────────────────────

/**
 * Generate a side-by-side forensics summary PNG.
 */
export async function generateForensicsSummary(
  imagePath: string,
  fields: BboxField[],
  verdict: string,
  score: number,
  outputPath?: string | null,
  heatmapBuf?: Buffer | null,
): Promise<Buffer> {
  const meta = await sharp(imagePath, { failOnError: false }).metadata();
  const W = meta.width  ?? 800;
  const H = meta.height ?? 1000;

  // ── Left: bbox SVG ───────────
  const rects = fields
    .filter((f) => f.bbox && f.bbox.width > 0 && f.bbox.height > 0 && (f.anomaly ?? 0) >= SHOW_BBOX_THRESHOLD)
    .map((f) => {
      const b      = f.bbox!;
      const aScore = f.anomaly ?? 0;
      const color  = anomalyColor(aScore);
      const x = Math.max(0, b.x);
      const y = Math.max(0, b.y);
      const w = Math.min(W - x, b.width);
      const h = Math.min(H - y, b.height);
      return `
        <rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${h + 2}"
              fill="none" stroke="white" stroke-width="5" rx="3"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
              fill="none" stroke="${color}" stroke-width="3" rx="2"/>`;
    })
    .join('\n');

  const bboxSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects}</svg>`;

  // ── TruFor heatmap overlay ────────────────────────────────────────────────
  const compositeInputs: sharp.OverlayOptions[] = [];

  if (heatmapBuf) {
    const resized = await sharp(heatmapBuf)
      .resize(W, H, { fit: 'fill' })
      .ensureAlpha(0.55)
      .png()
      .toBuffer();
    compositeInputs.push({ input: resized, gravity: 'northwest', blend: 'over' });
  }

  compositeInputs.push({ input: Buffer.from(bboxSvg), gravity: 'northwest' });

  // ── Right: sidebar panel SVG ──────────────────────────────────────────────
  const verdictColor = VERDICT_COLOR[verdict] ?? '#888888';
  const LEGEND = [
    { color: '#dc2828', label: 'High',    range: '>= 0.50' },
    { color: '#ff8c00', label: 'Medium',  range: '0.30–0.50' },
    { color: '#c8c800', label: 'Low',     range: '0.15–0.30' },
    { color: '#32c832', label: 'Minimal', range: '< 0.15' },
  ];

  const sortedFields = [...fields]
    .filter((f) => f.bbox && f.bbox.width > 0 && (f.anomaly ?? 0) >= SHOW_BBOX_THRESHOLD)
    .sort((a, b) => (b.anomaly ?? 0) - (a.anomaly ?? 0));

  const suspiciousCount = sortedFields.length;
  const heatmapNote = heatmapBuf ? '+ Integrity Heatmap' : 'No Heatmap';

  let py = 18;
  const panelItems: string[] = [];

  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const txt = (x: number, y: number, s: string, size: number, color = '#1e1e1e', weight = 'normal') =>
    `<text x="${x}" y="${y + size}" font-family="-apple-system,Helvetica,Arial,sans-serif"
           font-size="${size}" fill="${color}" font-weight="${weight}">${escXml(s)}</text>`;

  const hline = (y: number) =>
    `<line x1="12" y1="${y}" x2="${PANEL_W - 12}" y2="${y}" stroke="#cccccc" stroke-width="1"/>`;

  const dot = (x: number, y: number, r: number, color: string) =>
    `<circle cx="${x + r}" cy="${y + r}" r="${r}" fill="${color}"/>`;

  panelItems.push(txt(14, py, 'Document Forensics', 16, '#1a1a1a', 'bold'));
  py += 28;

  panelItems.push(txt(14, py, heatmapNote, 10, heatmapBuf ? '#4a9eff' : '#999999'));
  py += 20;

  panelItems.push(txt(14, py, 'Verdict: ', 14, '#444444', 'bold'));
  panelItems.push(txt(14 + 62, py, verdict, 14, verdictColor, 'bold'));
  py += 22;

  panelItems.push(txt(14, py, `Score: ${score.toFixed(3)}`, 13, '#444444'));
  py += 20;

  panelItems.push(hline(py)); py += 12;

  panelItems.push(txt(14, py, 'Risk Legend:', 12, '#555555', 'bold'));
  py += 18;
  for (const { color, label, range } of LEGEND) {
    panelItems.push(dot(14, py, 6, color));
    panelItems.push(txt(30, py - 2, `${label} (${range})`, 11, '#444444'));
    py += 17;
  }
  py += 4;

  panelItems.push(hline(py)); py += 12;

  panelItems.push(txt(14, py, 'Detected Fields:', 12, '#555555', 'bold'));
  if (suspiciousCount > 0) {
    panelItems.push(txt(120, py, `${suspiciousCount} flagged`, 11, '#ff8c00', 'bold'));
  }
  py += 18;

  let shown = 0;
  for (const f of sortedFields) {
    if (py > H - 30) {
      panelItems.push(txt(14, py, `... +${sortedFields.length - shown} more`, 10, '#888888'));
      break;
    }
    const aScore = f.anomaly ?? 0;
    const color  = anomalyColor(aScore);
    panelItems.push(dot(14, py, 5, color));
    panelItems.push(txt(28, py - 2, `${f.label.replace(/_/g, ' ')}: ${aScore.toFixed(2)}`, 12, '#f0f0f0', 'bold'));
    py += 16;
    shown++;
  }

  const panelSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL_W}" height="${H}">
    <rect width="${PANEL_W}" height="${H}" fill="#f5f5f5"/>
    ${panelItems.join('\n')}
  </svg>`;

  // Pre-decode to PNG to handle malformed JPEGs (Invalid SOS parameters, etc.)
  const normalizedImg = await sharp(imagePath, { failOnError: false }).png().toBuffer();

  const withAnnotations = await sharp(normalizedImg)
    .composite(compositeInputs)
    .extend({ right: PANEL_W, background: { r: 245, g: 245, b: 245, alpha: 1 } })
    .png()
    .toBuffer();

  const result = await sharp(withAnnotations)
    .composite([{ input: Buffer.from(panelSvg), left: W, top: 0 }])
    .jpeg({ quality: 85 })
    .toBuffer();

  if (outputPath) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(outputPath, result);
  }

  return result;
}
