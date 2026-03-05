import i18n from 'i18next';

// ─── Locale Mapping ─────────────────────────────────────────────────────────
// Maps i18n language codes to Intl locale tags for date/number formatting.

const DATE_LOCALE_MAP: Record<string, string> = {
  en: 'en-GB',
  th: 'th-TH',
  zh: 'zh-CN',
  vi: 'vi-VN',
};

const NUMBER_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  th: 'th-TH',
  zh: 'zh-CN',
  vi: 'vi-VN',
};

function getDateLocale(): string {
  return DATE_LOCALE_MAP[i18n.language] ?? 'en-GB';
}

function getNumberLocale(): string {
  return NUMBER_LOCALE_MAP[i18n.language] ?? 'en-US';
}

// ─── Date Formatting ────────────────────────────────────────────────────────

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(getDateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(getDateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Currency / Number Formatting ───────────────────────────────────────────

/** Format a number with 2 decimal places (no currency symbol). */
export function formatNumber(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat(getNumberLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a currency amount with symbol (defaults to THB). */
export function formatCurrency(
  amount: number | null | undefined,
  currency = 'THB',
): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat(getNumberLocale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a currency amount without decimals (for large totals). */
export function formatCurrencyCompact(
  amount: number | null | undefined,
  currency = 'THB',
): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat(getNumberLocale(), {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format large THB amounts with K/M suffix. */
export function formatTHBShort(value: number): string {
  const locale = getNumberLocale();
  if (value >= 1_000_000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 1,
    }).format(value / 1_000_000) + 'M';
  }
  if (value >= 1_000) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'THB',
      maximumFractionDigits: 0,
    }).format(value / 1_000) + 'K';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  }).format(value);
}
