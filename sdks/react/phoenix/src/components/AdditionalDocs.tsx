import { useState, useCallback, useRef } from 'react';
import { usePhoenix } from '../provider';
import { t, type Locale } from '../i18n';

export interface AdditionalDocsProps {
  claimId: string;
  onComplete?: () => void;
  onBack?: () => void;
  locale?: Locale;
}

const DOC_TYPES = [
  'medical_report', 'invoice', 'receipt', 'id_card',
  'prescription', 'discharge_summary', 'claim_form', 'other',
];

interface DocEntry {
  id: string;
  file: File;
  documentType: string;
}

export function AdditionalDocs({ claimId, onComplete, onBack, locale }: AdditionalDocsProps) {
  const { client, events, locale: ctxLocale } = usePhoenix();
  const loc = locale ?? ctxLocale;

  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [docType, setDocType] = useState('medical_report');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocs(prev => [...prev, {
      id: crypto.randomUUID(),
      file,
      documentType: docType,
    }]);
    e.target.value = '';
  }, [docType]);

  const removeDoc = useCallback((id: string) => {
    setDocs(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    setUploading(true);
    try {
      for (const doc of docs) {
        try {
          await client.uploadDocument(claimId, {
            fileName: doc.file.name,
            fileType: doc.file.type,
            documentType: doc.documentType,
          });
          events.emit('claim:document_uploaded', {
            claimId,
            fileName: doc.file.name,
            documentType: doc.documentType,
          });
        } catch (err) {
          events.emit('claim:document_upload_failed', {
            claimId,
            fileName: doc.file.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      onComplete?.();
    } finally {
      setUploading(false);
    }
  }, [client, events, claimId, docs, onComplete]);

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>{t(loc, 'additional.title')}</h3>
      <p style={styles.desc}>{t(loc, 'additional.desc')}</p>

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
        {onBack && (
          <button onClick={onBack} style={styles.secondaryButton}>
            {t(loc, 'submit.back')}
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={docs.length === 0 || uploading}
          style={{
            ...styles.primaryButton,
            opacity: docs.length === 0 || uploading ? 0.5 : 1,
          }}
        >
          {uploading ? t(loc, 'submit.uploading') : t(loc, 'additional.submit')}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'var(--phoenix-font-family, inherit)',
  },
  title: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--phoenix-color-text-primary, #111827)',
    margin: '0 0 4px 0',
  },
  desc: {
    fontSize: '13px',
    color: 'var(--phoenix-color-text-secondary, #6b7280)',
    margin: '0 0 16px 0',
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
  primaryButton: {
    padding: '10px 20px',
    backgroundColor: 'var(--phoenix-color-primary, #E30613)',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
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
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
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
