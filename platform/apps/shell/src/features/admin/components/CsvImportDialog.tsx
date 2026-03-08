import { useState, useRef } from 'react';
import {
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@papaya/shared-ui';
import { Loader2, Upload, FileSpreadsheet, X } from 'lucide-react';
import { importMembersFromCsv } from '../members-api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function CsvImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: CsvImportDialogProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ invited: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/);
    const validEmails: string[] = [];
    let invalid = 0;

    for (const line of lines) {
      // Split by comma, semicolon, or tab
      const cells = line.split(/[,;\t]/);
      for (const cell of cells) {
        const trimmed = cell.trim().toLowerCase().replace(/^["']|["']$/g, '');
        if (EMAIL_RE.test(trimmed)) {
          if (!validEmails.includes(trimmed)) {
            validEmails.push(trimmed);
          }
        } else if (trimmed && !trimmed.includes('email')) {
          // Skip header-like values
          invalid++;
        }
      }
    }

    return { validEmails, invalid };
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { validEmails, invalid } = parseCSV(text);
      setEmails(validEmails);
      setInvalidCount(invalid);
    };
    reader.readAsText(file);
  }

  async function handleSubmit() {
    if (emails.length === 0) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await importMembersFromCsv(emails);
      setResult(res);
      if (res.invited > 0) {
        onSuccess();
      }
    } catch {
      // TODO: toast
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setEmails([]);
    setInvalidCount(0);
    setFileName(null);
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Members from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file containing email addresses. Emails will be extracted
            from all columns automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,.tsv,.txt,.xlsx"
            className="hidden"
          />

          {!fileName ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 px-6 py-12 text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            >
              <Upload className="h-8 w-8" />
              <div className="text-left">
                <p className="font-medium">Click to upload</p>
                <p className="text-sm">CSV, TSV, or TXT files</p>
              </div>
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {emails.length} valid emails found
                    {invalidCount > 0 && `, ${invalidCount} invalid entries skipped`}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFileName(null);
                  setEmails([]);
                  setInvalidCount(0);
                  setResult(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Preview */}
          {emails.length > 0 && emails.length <= 20 && (
            <div className="flex flex-wrap gap-1.5">
              {emails.map((email) => (
                <Badge key={email} variant="outline" className="text-xs">
                  {email}
                </Badge>
              ))}
            </div>
          )}
          {emails.length > 20 && (
            <p className="text-sm text-muted-foreground">
              {emails.length} emails ready to import (showing first 20)
            </p>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>{result.invited} imported, {result.skipped} skipped</p>
              {result.errors.length > 0 && (
                <ul className="mt-1 text-destructive">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>...and {result.errors.length - 5} more</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          {!result && (
            <Button onClick={handleSubmit} disabled={isSubmitting || emails.length === 0}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {emails.length} {emails.length === 1 ? 'Email' : 'Emails'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
