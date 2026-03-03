import { usePhoenix } from '../provider';
import { useClaims } from '../hooks/useClaims';
import { StatusBadge } from './StatusBadge';
import { t, type Locale } from '../i18n';
import type { Claim } from '@papaya/phoenix';

export interface ClaimsListProps {
  onClaimSelect?: (claim: Claim) => void;
  onSubmitNew?: () => void;
  locale?: Locale;
}

function formatCurrency(amount: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: currency || 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function ClaimsList({ onClaimSelect, onSubmitNew, locale }: ClaimsListProps) {
  const { locale: ctxLocale } = usePhoenix();
  const loc = locale ?? ctxLocale;
  const { data: claims, loading, error, refetch } = useClaims();

  if (loading) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} />
        <p style={styles.mutedText}>{t(loc, 'claims.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center}>
        <p style={{ ...styles.mutedText, color: 'var(--phoenix-color-error, #dc2626)' }}>
          {t(loc, 'claims.error')}
        </p>
        <button onClick={refetch} style={styles.linkButton}>
          {t(loc, 'claims.retry')}
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{t(loc, 'claims.title')}</h2>
        {onSubmitNew && (
          <button onClick={onSubmitNew} style={styles.primaryButton}>
            {t(loc, 'claims.submit_new')}
          </button>
        )}
      </div>

      {/* Claims */}
      {claims.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={{ fontSize: '14px', color: 'var(--phoenix-color-text-primary, #111827)' }}>
            {t(loc, 'claims.empty')}
          </p>
          <p style={styles.mutedText}>{t(loc, 'claims.empty_desc')}</p>
          {onSubmitNew && (
            <button onClick={onSubmitNew} style={{ ...styles.primaryButton, marginTop: '12px' }}>
              {t(loc, 'claims.submit_new')}
            </button>
          )}
        </div>
      ) : (
        <div style={styles.list}>
          {claims.map((claim) => (
            <button
              key={claim.id}
              onClick={() => onClaimSelect?.(claim)}
              style={styles.card}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
              }}
            >
              <div style={styles.cardTop}>
                <div>
                  <p style={styles.claimNumber}>{claim.claimNumber}</p>
                  <p style={styles.amount}>
                    {formatCurrency(claim.amountClaimed, claim.currency, loc)}
                  </p>
                </div>
                <StatusBadge status={claim.status} locale={loc} />
              </div>
              <div style={styles.cardBottom}>
                <div style={styles.metaGroup}>
                  {claim.providerName && (
                    <p style={styles.metaText}>{claim.providerName}</p>
                  )}
                  <p style={styles.metaText}>
                    {t(loc, 'claims.submitted_date')}: {formatDate(claim.createdAt, loc)}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'var(--phoenix-font-family, inherit)',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
    gap: '8px',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '3px solid var(--phoenix-color-border, #e5e7eb)',
    borderTopColor: 'var(--phoenix-color-primary, #E30613)',
    borderRadius: '50%',
    animation: 'phoenix-spin 0.6s linear infinite',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: 0,
  },
  primaryButton: {
    padding: '8px 16px',
    backgroundColor: 'var(--phoenix-color-primary, #E30613)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    color: 'var(--phoenix-color-primary, #E30613)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  mutedText: {
    fontSize: '13px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '48px 16px',
    gap: '4px',
    textAlign: 'center',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    width: '100%',
    padding: '16px',
    borderRadius: 'var(--phoenix-border-radius, 12px)',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
    backgroundColor: 'var(--phoenix-color-surface, #ffffff)',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s',
    boxShadow: 'none',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  claimNumber: {
    fontSize: '12px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: 0,
  },
  amount: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: '2px 0 0 0',
  },
  cardBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  metaText: {
    fontSize: '12px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: 0,
  },
};
