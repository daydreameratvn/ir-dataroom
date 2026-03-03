import { useState, useCallback, useRef } from 'react';
import { usePhoenix } from '../provider';
import { t, type Locale } from '../i18n';
import type { CreateClaimInput } from '@papaya/phoenix';

export interface ClaimSubmissionProps {
  onComplete?: (claim: { id: string; claimNumber: string }) => void;
  onCancel?: () => void;
  locale?: Locale;
}

type Step = 'info' | 'documents' | 'review' | 'otp' | 'complete';

const STEPS: Step[] = ['info', 'documents', 'review', 'otp', 'complete'];

const STEP_LABEL_KEYS: Record<Step, string> = {
  info: 'submit.step_info',
  documents: 'submit.step_documents',
  review: 'submit.step_review',
  otp: 'submit.step_otp',
  complete: 'submit.step_complete',
};

const DOC_TYPES = [
  'medical_report', 'invoice', 'receipt', 'id_card',
  'prescription', 'discharge_summary', 'claim_form', 'other',
];

interface DocEntry {
  id: string;
  file: File;
  documentType: string;
  uploaded: boolean;
}

export function ClaimSubmission({ onComplete, onCancel, locale }: ClaimSubmissionProps) {
  const { client, events, locale: ctxLocale } = usePhoenix();
  const loc = locale ?? ctxLocale;

  const [step, setStep] = useState<Step>('info');
  const [submitting, setSubmitting] = useState(false);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [claimNumber, setClaimNumber] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<CreateClaimInput>({
    claimantName: '',
    amountClaimed: 0,
    currency: 'VND',
    dateOfLoss: '',
    dateOfService: '',
    providerName: '',
  });

  // Documents
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('medical_report');

  const stepIndex = STEPS.indexOf(step);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocs(prev => [...prev, {
      id: crypto.randomUUID(),
      file,
      documentType: docType,
      uploaded: false,
    }]);
    e.target.value = '';
  }, [docType]);

  const removeDoc = useCallback((id: string) => {
    setDocs(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleSubmitClaim = useCallback(async () => {
    setSubmitting(true);
    events.emit('claim:creating', {
      claimantName: form.claimantName,
      amountClaimed: form.amountClaimed,
    });

    try {
      const claim = await client.submitClaim(form);
      setClaimId(claim.id);
      setClaimNumber(claim.claimNumber);
      events.emit('claim:created', { claimId: claim.id, claimNumber: claim.claimNumber });

      // Upload documents
      for (const doc of docs) {
        try {
          await client.uploadDocument(claim.id, {
            fileName: doc.file.name,
            fileType: doc.file.type,
            documentType: doc.documentType,
          });
          events.emit('claim:document_uploaded', {
            claimId: claim.id,
            fileName: doc.file.name,
            documentType: doc.documentType,
          });
        } catch (err) {
          events.emit('claim:document_upload_failed', {
            claimId: claim.id,
            fileName: doc.file.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Request OTP
      try {
        await client.requestOtp(claim.id);
        events.emit('claim:otp_requested', { claimId: claim.id });
      } catch {
        // OTP request failure is non-fatal, user can resend
      }

      setStep('otp');
    } catch (err) {
      events.emit('claim:creation_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }, [client, events, form, docs]);

  const handleVerifyOtp = useCallback(async () => {
    if (!claimId) return;
    setSubmitting(true);
    setOtpError(null);
    try {
      const result = await client.verifyOtp(claimId, otpCode);
      if (result.verified) {
        events.emit('claim:otp_verified', { claimId });
        setStep('complete');
      } else {
        events.emit('claim:otp_failed', { claimId, error: 'Invalid OTP' });
        setOtpError('Invalid code. Please try again.');
      }
    } catch (err) {
      events.emit('claim:otp_failed', {
        claimId,
        error: err instanceof Error ? err.message : String(err),
      });
      setOtpError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  }, [client, events, claimId, otpCode]);

  const handleResendOtp = useCallback(async () => {
    if (!claimId) return;
    try {
      await client.requestOtp(claimId);
      events.emit('claim:otp_requested', { claimId });
    } catch {
      // silent
    }
  }, [client, events, claimId]);

  const handleCancel = useCallback(() => {
    events.emit('claim:cancelled', {});
    onCancel?.();
  }, [events, onCancel]);

  return (
    <div style={styles.container}>
      {/* Step indicator */}
      {step !== 'complete' && (
        <div style={styles.stepBar}>
          {STEPS.filter(s => s !== 'complete').map((s, i) => (
            <div key={s} style={styles.stepItem}>
              <div style={{
                ...styles.stepCircle,
                backgroundColor: i <= stepIndex
                  ? 'var(--phoenix-color-primary, #E30613)'
                  : 'var(--phoenix-color-border, #e5e7eb)',
                color: i <= stepIndex ? '#fff' : 'var(--phoenix-color-text-muted, #9ca3af)',
              }}>
                {i + 1}
              </div>
              <span style={{
                fontSize: '11px',
                color: i <= stepIndex
                  ? 'var(--phoenix-color-primary, #E30613)'
                  : 'var(--phoenix-color-text-muted, #9ca3af)',
                fontWeight: i === stepIndex ? 600 : 400,
              }}>
                {t(loc, STEP_LABEL_KEYS[s] as Parameters<typeof t>[1])}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Step content */}
      {step === 'info' && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>{t(loc, 'submit.step_info')}</h3>
          <div style={styles.formGrid}>
            <label style={styles.fieldLabel}>
              {t(loc, 'submit.claimant_name')}
              <input
                type="text"
                value={form.claimantName}
                onChange={e => setForm(f => ({ ...f, claimantName: e.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              {t(loc, 'submit.amount_claimed')}
              <input
                type="number"
                value={form.amountClaimed || ''}
                onChange={e => setForm(f => ({ ...f, amountClaimed: Number(e.target.value) }))}
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              {t(loc, 'submit.currency')}
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                style={styles.input}
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label style={styles.fieldLabel}>
              {t(loc, 'submit.date_of_loss')}
              <input
                type="date"
                value={form.dateOfLoss}
                onChange={e => setForm(f => ({ ...f, dateOfLoss: e.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              {t(loc, 'submit.date_of_service')}
              <input
                type="date"
                value={form.dateOfService}
                onChange={e => setForm(f => ({ ...f, dateOfService: e.target.value }))}
                style={styles.input}
              />
            </label>
            <label style={styles.fieldLabel}>
              {t(loc, 'submit.provider_name')}
              <input
                type="text"
                value={form.providerName}
                onChange={e => setForm(f => ({ ...f, providerName: e.target.value }))}
                style={styles.input}
              />
            </label>
          </div>
          <div style={styles.buttonRow}>
            <button onClick={handleCancel} style={styles.secondaryButton}>
              {t(loc, 'submit.cancel')}
            </button>
            <button
              onClick={() => setStep('documents')}
              disabled={!form.claimantName || !form.amountClaimed}
              style={{
                ...styles.primaryButton,
                opacity: !form.claimantName || !form.amountClaimed ? 0.5 : 1,
              }}
            >
              {t(loc, 'submit.next')}
            </button>
          </div>
        </div>
      )}

      {step === 'documents' && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>{t(loc, 'submit.step_documents')}</h3>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value)}
              style={{ ...styles.input, flex: 1 }}
            >
              {DOC_TYPES.map(dt => (
                <option key={dt} value={dt}>
                  {t(loc, `doctype.${dt}` as Parameters<typeof t>[1])}
                </option>
              ))}
            </select>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.primaryButton}
            >
              {t(loc, 'submit.choose_file')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.doc,.docx"
            />
          </div>

          {docs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {docs.map(doc => (
                <div key={doc.id} style={styles.docRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.file.name}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--phoenix-color-text-muted, #9ca3af)', margin: '2px 0 0 0' }}>
                      {t(loc, `doctype.${doc.documentType}` as Parameters<typeof t>[1])}
                    </p>
                  </div>
                  <button onClick={() => removeDoc(doc.id)} style={styles.removeButton}>
                    {t(loc, 'submit.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={styles.buttonRow}>
            <button onClick={() => setStep('info')} style={styles.secondaryButton}>
              {t(loc, 'submit.back')}
            </button>
            <button onClick={() => setStep('review')} style={styles.primaryButton}>
              {t(loc, 'submit.next')}
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>{t(loc, 'submit.step_review')}</h3>
          <p style={{ fontSize: '13px', color: 'var(--phoenix-color-text-secondary, #6b7280)', margin: '0 0 16px 0' }}>
            {t(loc, 'submit.review_info')}
          </p>

          <div style={styles.reviewCard}>
            <ReviewRow label={t(loc, 'submit.claimant_name')} value={form.claimantName} />
            <ReviewRow
              label={t(loc, 'submit.amount_claimed')}
              value={`${form.amountClaimed.toLocaleString()} ${form.currency}`}
            />
            {form.dateOfLoss && <ReviewRow label={t(loc, 'submit.date_of_loss')} value={form.dateOfLoss} />}
            {form.dateOfService && <ReviewRow label={t(loc, 'submit.date_of_service')} value={form.dateOfService} />}
            {form.providerName && <ReviewRow label={t(loc, 'submit.provider_name')} value={form.providerName} />}
            <ReviewRow label={t(loc, 'submit.step_documents')} value={`${docs.length} file(s)`} />
          </div>

          <div style={styles.buttonRow}>
            <button onClick={() => setStep('documents')} style={styles.secondaryButton}>
              {t(loc, 'submit.back')}
            </button>
            <button
              onClick={handleSubmitClaim}
              disabled={submitting}
              style={{
                ...styles.primaryButton,
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? t(loc, 'submit.uploading') : t(loc, 'submit.submit')}
            </button>
          </div>
        </div>
      )}

      {step === 'otp' && (
        <div style={styles.stepContent}>
          <h3 style={styles.stepTitle}>{t(loc, 'submit.step_otp')}</h3>
          <p style={{ fontSize: '13px', color: 'var(--phoenix-color-text-secondary, #6b7280)', margin: '0 0 16px 0' }}>
            {t(loc, 'submit.otp_sent')}
          </p>

          <label style={styles.fieldLabel}>
            {t(loc, 'submit.otp_code')}
            <input
              type="text"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value)}
              maxLength={6}
              style={{ ...styles.input, letterSpacing: '4px', textAlign: 'center', fontSize: '18px' }}
            />
          </label>
          {otpError && (
            <p style={{ fontSize: '13px', color: 'var(--phoenix-color-error, #dc2626)', margin: '8px 0 0 0' }}>
              {otpError}
            </p>
          )}

          <div style={{ ...styles.buttonRow, marginTop: '16px' }}>
            <button onClick={handleResendOtp} style={styles.secondaryButton}>
              {t(loc, 'submit.resend')}
            </button>
            <button
              onClick={handleVerifyOtp}
              disabled={otpCode.length < 4 || submitting}
              style={{
                ...styles.primaryButton,
                opacity: otpCode.length < 4 || submitting ? 0.5 : 1,
              }}
            >
              {t(loc, 'submit.verify')}
            </button>
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div style={{ ...styles.stepContent, textAlign: 'center', padding: '48px 16px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3 style={{ ...styles.stepTitle, textAlign: 'center' }}>
            {t(loc, 'submit.success_title')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--phoenix-color-text-secondary, #6b7280)', margin: '4px 0 24px 0' }}>
            {t(loc, 'submit.success_desc')}
          </p>
          {claimNumber && (
            <p style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 24px 0' }}>
              {claimNumber}
            </p>
          )}
          <button
            onClick={() => onComplete?.({ id: claimId!, claimNumber: claimNumber! })}
            style={styles.primaryButton}
          >
            {t(loc, 'submit.done')}
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--phoenix-color-border, #e5e7eb)' }}>
      <span style={{ fontSize: '13px', color: 'var(--phoenix-color-text-secondary, #6b7280)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--phoenix-color-text-primary, #111827)' }}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'var(--phoenix-font-family, inherit)',
  },
  stepBar: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px 0',
    marginBottom: '8px',
  },
  stepItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    flex: 1,
  },
  stepCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 700,
  },
  stepContent: {
    padding: '0',
  },
  stepTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: '0 0 16px 0',
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--phoenix-color-text-secondary, #6b7280)',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'var(--phoenix-color-surface, #ffffff)',
    color: 'var(--phoenix-color-text-primary, #111827)',
    fontFamily: 'inherit',
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    padding: '10px 20px',
    backgroundColor: 'var(--phoenix-color-primary, #E30613)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    color: 'var(--phoenix-color-text-secondary, #6b7280)',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  reviewCard: {
    padding: '12px 16px',
    borderRadius: 'var(--phoenix-border-radius, 12px)',
    backgroundColor: 'var(--phoenix-color-surface, #ffffff)',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
    marginBottom: '20px',
  },
  docRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: '8px',
    backgroundColor: 'var(--phoenix-color-background, #f9fafb)',
    border: '1px solid var(--phoenix-color-border, #e5e7eb)',
  },
  removeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--phoenix-color-error, #dc2626)',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
