import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X } from 'lucide-react';
import { PageHeader, Button, Card, CardHeader, CardContent } from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { createClaim } from '../api';

export default function NewClaimForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [claimCode, setClaimCode] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(newFiles: FileList | null) {
    if (!newFiles) return;
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const code = claimCode.trim();
    if (!code && files.length === 0) {
      setError(t('portal.newClaim.validationError'));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      if (code) formData.append('claimCode', code);
      for (const file of files) {
        formData.append('files', file);
      }

      const result = await createClaim(formData);
      navigate(`/portal/claims/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('portal.newClaim.unexpectedError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('portal.newClaim.title')} />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">{t('portal.newClaim.claimInfo')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('portal.newClaim.claimInfoDesc')}
          </p>
        </CardHeader>
        <CardContent>
          <label className="block text-sm font-medium mb-2">{t('portal.newClaim.claimCode')}</label>
          <input
            value={claimCode}
            onChange={(e) => setClaimCode(e.target.value)}
            placeholder={t('portal.newClaim.claimCodePlaceholder')}
            className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">{t('portal.newClaim.documents')}</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 px-6 py-10 transition-colors hover:border-muted-foreground/50"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t('portal.newClaim.dropFiles')}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('portal.newClaim.acceptedFormats')}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(i)}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            {t('portal.newClaim.uploadHint')}
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('portal.newClaim.submitting') : t('portal.newClaim.submit')}
        </Button>
        <Button variant="outline" onClick={() => navigate('/portal/claims')}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
