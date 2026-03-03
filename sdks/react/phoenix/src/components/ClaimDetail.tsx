import { useState } from 'react';
import { usePhoenix } from '../provider';
import { useClaim } from '../hooks/useClaim';
import { StatusBadge } from './StatusBadge';
import { t, getDocTypeLabel, type Locale } from '../i18n';
import type { ClaimDocument, ClaimNote } from '@papaya/phoenix';

export interface ClaimDetailProps {
  claimId: string;
  onBack?: () => void;
  onAdditionalDocs?: (claimId: string) => void;
  locale?: Locale;
}

function formatCurrency(amount: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: currency || 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null, locale: Locale): string {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export function ClaimDetail({ claimId, onBack, onAdditionalDocs, locale }: ClaimDetailProps) {
  const { locale: ctxLocale } = usePhoenix();
  const loc = locale ?? ctxLocale;
  const { data: claim, loading, error } = useClaim(claimId);
  const [docsOpen, setDocsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={styles.muted}>{t(loc, 'detail.loading')}</p>
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div style={styles.center}>
        <p style={{ ...styles.muted, color: 'var(--phoenix-color-error, #dc2626)' }}>
          {t(loc, 'detail.error')}
        </p>
        {onBack && (
          <button onClick={onBack} style={styles.linkButton}>
            {t(loc, 'detail.back')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {onBack && (
          <button onClick={onBack} style={styles.backButton} aria-label={t(loc, 'detail.back')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h2 style={styles.title}>{t(loc, 'detail.title')}</h2>
          <p style={styles.claimNumber}>{claim.claimNumber}</p>
        </div>
        <StatusBadge status={claim.status} locale={loc} />
      </div>

      {/* Amount card */}
      <div style={styles.card}>
        <div style={styles.grid2}>
          <div>
            <p style={styles.label}>{t(loc, 'detail.amount_claimed')}</p>
            <p style={styles.amountPrimary}>
              {formatCurrency(claim.amountClaimed, claim.currency, loc)}
            </p>
          </div>
          {claim.amountApproved !== null && (
            <div>
              <p style={styles.label}>{t(loc, 'detail.amount_approved')}</p>
              <p style={{ ...styles.amountPrimary, color: 'var(--phoenix-color-success, #16a34a)' }}>
                {formatCurrency(claim.amountApproved, claim.currency, loc)}
              </p>
            </div>
          )}
        </div>

        <div style={styles.divider} />

        <div style={styles.grid2}>
          <div>
            <p style={styles.label}>{t(loc, 'detail.date_of_loss')}</p>
            <p style={styles.value}>{formatDate(claim.dateOfLoss, loc)}</p>
          </div>
          <div>
            <p style={styles.label}>{t(loc, 'detail.date_of_service')}</p>
            <p style={styles.value}>{formatDate(claim.dateOfService, loc)}</p>
          </div>
          {claim.providerName && (
            <div style={{ gridColumn: '1 / -1' }}>
              <p style={styles.label}>{t(loc, 'detail.provider')}</p>
              <p style={styles.value}>{claim.providerName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <CollapsibleSection
        title={t(loc, 'detail.documents')}
        count={claim.documents.length}
        open={docsOpen}
        onToggle={() => setDocsOpen(!docsOpen)}
      >
        {claim.documents.length === 0 ? (
          <p style={styles.muted}>{t(loc, 'detail.documents_empty')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {claim.documents.map((doc: ClaimDocument) => (
              <div key={doc.id} style={styles.docItem}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={styles.docName}>{doc.fileName}</p>
                  <p style={styles.docType}>
                    {doc.documentType ? getDocTypeLabel(loc, doc.documentType) : doc.fileType ?? ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Notes */}
      {claim.notes.length > 0 && (
        <CollapsibleSection
          title={t(loc, 'detail.notes')}
          count={claim.notes.length}
          open={notesOpen}
          onToggle={() => setNotesOpen(!notesOpen)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {claim.notes.map((note: ClaimNote) => (
              <div key={note.id} style={styles.noteItem}>
                <p style={{ fontSize: '14px', color: 'var(--phoenix-color-text-primary, #111827)', margin: 0 }}>
                  {note.content}
                </p>
                <p style={{ fontSize: '12px', color: 'var(--phoenix-color-text-muted, #9ca3af)', margin: '4px 0 0 0' }}>
                  {note.agentName ?? (loc === 'vi' ? 'Hệ thống' : 'System')} &middot; {formatDate(note.createdAt, loc)}
                </p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Additional docs button */}
      {claim.status === 'additional_docs_required' && onAdditionalDocs && (
        <button
          onClick={() => onAdditionalDocs(claim.id)}
          style={styles.additionalDocsButton}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {t(loc, 'detail.additional_docs')}
        </button>
      )}
    </div>
  );
}

// ── Collapsible Section ──

function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.section}>
      <button onClick={onToggle} style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>
          {title}
          {count !== undefined && count > 0 && (
            <span style={styles.sectionCount}>{count}</span>
          )}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div style={styles.sectionContent}>{children}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'var(--phoenix-font-family, inherit)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 16px',
    gap: '8px',
  },
  muted: {
    fontSize: '13px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: 0,
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
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  backButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    color: 'var(--phoenix-color-text-secondary, #6b7280)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: 0,
  },
  claimNumber: {
    fontSize: '12px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: '2px 0 0 0',
  },
  card: {
    padding: '16px',
    borderRadius: 'var(--phoenix-border-radius, 12px)',
    backgroundColor: 'var(--phoenix-color-surface, #ffffff)',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  label: {
    fontSize: '12px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: 0,
  },
  value: {
    fontSize: '14px',
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: '2px 0 0 0',
  },
  amountPrimary: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: '4px 0 0 0',
  },
  divider: {
    borderTop: '1px solid var(--phoenix-color-border, #e5e7eb)',
    margin: '16px 0',
  },
  section: {
    borderRadius: 'var(--phoenix-border-radius, 12px)',
    backgroundColor: 'var(--phoenix-color-surface, #ffffff)',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--phoenix-color-text-primary, #111827)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionCount: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    backgroundColor: 'var(--phoenix-color-border, #e5e7eb)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--phoenix-color-text-secondary, #6b7280)',
  },
  sectionContent: {
    padding: '0 16px 16px',
  },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--phoenix-color-background, #f9fafb)',
  },
  docName: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docType: {
    fontSize: '12px',
    color: 'var(--phoenix-color-text-muted, #9ca3af)',
    margin: '2px 0 0 0',
  },
  noteItem: {
    padding: '10px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--phoenix-color-background, #f9fafb)',
  },
  additionalDocsButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '12px',
    border: 'none',
    borderRadius: 'var(--phoenix-border-radius, 12px)',
    backgroundColor: 'var(--phoenix-color-primary, #E30613)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
