// ─── Document Type Style Constants ──────────────────────────────────────────
// Shared between ExtractionView (doc table) and DocumentViewer (thumbnail sidebar).

export const DOC_TYPE_STYLES: Record<string, string> = {
  invoice: 'bg-purple-100 text-purple-700',
  receipt: 'bg-purple-100 text-purple-700',
  'medical report': 'bg-blue-100 text-blue-700',
  'discharge summary': 'bg-blue-100 text-blue-700',
  'lab result': 'bg-cyan-100 text-cyan-700',
  'lab results': 'bg-cyan-100 text-cyan-700',
  prescription: 'bg-indigo-100 text-indigo-700',
  'insurance card': 'bg-emerald-100 text-emerald-700',
  'id card': 'bg-emerald-100 text-emerald-700',
  referral: 'bg-amber-100 text-amber-700',
  'claim form': 'bg-orange-100 text-orange-700',
};

export function getDocTypeStyle(type: string): string {
  const lower = type.toLowerCase();
  for (const [key, style] of Object.entries(DOC_TYPE_STYLES)) {
    if (lower.includes(key)) return style;
  }
  return 'bg-gray-100 text-gray-700';
}

// ─── Readability Dot Styles ─────────────────────────────────────────────────

export const READABILITY_DOT_STYLES: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-red-500',
};

export function getReadabilityDotLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 4) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}
