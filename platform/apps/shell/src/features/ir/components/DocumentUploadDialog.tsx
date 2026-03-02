import { useCallback, useRef, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@papaya/shared-ui';
import type { DocumentCategory } from '../types';
import { createDocument, uploadFileToS3 } from '../api';

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  onCreated: () => void;
}

const DOCUMENT_CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'financials', label: 'Financials' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'product', label: 'Product' },
  { value: 'legal', label: 'Legal' },
  { value: 'team', label: 'Team' },
  { value: 'other', label: 'Other' },
];

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
  'video/mp4': 'Video',
  'video/webm': 'Video',
  'video/quicktime': 'Video',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUploadDialog({
  open,
  onOpenChange,
  roundId,
  onCreated,
}: DocumentUploadDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = useCallback(() => {
    setName('');
    setDescription('');
    setCategory('other');
    setWatermarkEnabled(true);
    setSelectedFile(null);
    setUploadProgress(null);
    setError(null);
  }, []);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_TYPES[file.type]) {
      setError('File type not allowed. Supported: PDF, Excel (XLSX), Video (MP4, WebM, MOV)');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Auto-fill name from file name if empty
    if (!name.trim()) {
      setName(file.name);
    }
  }

  function handleRemoveFile() {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES[file.type]) {
      setError('File type not allowed. Supported: PDF, Excel (XLSX), Video (MP4, WebM, MOV)');
      return;
    }

    setSelectedFile(file);
    setError(null);
    if (!name.trim()) {
      setName(file.name);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setError('Document name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Step 1: Create document record (with mimeType to get upload URL)
      setUploadProgress('Creating document record...');
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        watermarkEnabled,
      };

      if (selectedFile) {
        payload.mimeType = selectedFile.type;
        payload.fileSizeBytes = selectedFile.size;
      }

      const result = await createDocument(roundId, payload as any);

      // Step 2: Upload file to S3 if we have one and got an upload URL
      if (selectedFile && result.uploadUrl) {
        setUploadProgress(`Uploading ${formatFileSize(selectedFile.size)}...`);
        await uploadFileToS3(result.uploadUrl, selectedFile);
        setUploadProgress('Upload complete!');
      }

      resetForm();
      onCreated();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document');
    } finally {
      setIsSaving(false);
      setUploadProgress(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Upload Zone */}
          <div
            className={`relative rounded-lg border-2 border-dashed p-6 transition-colors ${
              selectedFile
                ? 'border-emerald-300 bg-emerald-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ALLOWED_TYPES[selectedFile.type]} &bull; {formatFileSize(selectedFile.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <Upload className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">
                  Drag & drop a file here, or{' '}
                  <button
                    type="button"
                    className="text-blue-600 hover:text-blue-700 font-medium"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse
                  </button>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, Excel (XLSX), Video (MP4, WebM, MOV)
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.mp4,.webm,.mov"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 2025 Financial Statements"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Watermark */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setWatermarkEnabled(!watermarkEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                watermarkEnabled ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  watermarkEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <label className="text-sm font-medium">Enable watermark</label>
          </div>

          {/* Upload progress */}
          {uploadProgress && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {uploadProgress}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? uploadProgress || 'Creating...' : selectedFile ? 'Upload & Add' : 'Add Document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
