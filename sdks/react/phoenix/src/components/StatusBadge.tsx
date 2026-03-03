import type { Locale } from '../i18n';
import { getStatusLabel } from '../i18n';

export interface StatusBadgeProps {
  status: string;
  locale?: Locale;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  submitted: { bg: '#dbeafe', text: '#1e40af' },
  pending_review: { bg: '#fef3c7', text: '#92400e' },
  under_review: { bg: '#ffedd5', text: '#9a3412' },
  ai_processing: { bg: '#f3e8ff', text: '#6b21a8' },
  adjudicated: { bg: '#e0e7ff', text: '#3730a3' },
  approved: { bg: '#dcfce7', text: '#166534' },
  partially_approved: { bg: '#ecfccb', text: '#3f6212' },
  denied: { bg: '#fee2e2', text: '#991b1b' },
  appealed: { bg: '#fef3c7', text: '#92400e' },
  settled: { bg: '#d1fae5', text: '#065f46' },
  closed: { bg: '#f3f4f6', text: '#1f2937' },
  additional_docs_required: { bg: '#ffedd5', text: '#9a3412' },
};

const DEFAULT_COLOR = { bg: '#f3f4f6', text: '#374151' };

export function StatusBadge({ status, locale = 'en' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] ?? DEFAULT_COLOR;
  const label = getStatusLabel(locale, status);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        backgroundColor: colors.bg,
        color: colors.text,
      }}
    >
      {label}
    </span>
  );
}
