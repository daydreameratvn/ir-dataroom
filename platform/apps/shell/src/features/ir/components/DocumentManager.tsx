import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Trash2, Upload } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@papaya/shared-ui';
import type { Document, DocumentCategory } from '../types';
import { listDocuments, createDocument, uploadDocumentFile, deleteDocument } from '../api';

interface DocumentManagerProps {
  roundId: string;
}

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'financials', label: 'Financials' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'product', label: 'Product' },
  { value: 'legal', label: 'Legal' },
  { value: 'team', label: 'Team' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_ORDER: DocumentCategory[] = ['financials', 'strategy', 'product', 'legal', 'team', 'other'];

function categoryColor(category: DocumentCategory): string {
  switch (category) {
    case 'financials': return 'bg-emerald-100 text-emerald-700';
    case 'strategy': return 'bg-blue-100 text-blue-700';
    case 'product': return 'bg-violet-100 text-violet-700';
    case 'legal': return 'bg-amber-100 text-amber-700';
    case 'team': return 'bg-sky-100 text-sky-700';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function friendlyType(mime: string | null, fileName?: string): string {
  if (mime) {
    const m = mime.toLowerCase();
    if (m === 'application/pdf') return 'PDF';
    if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'Excel';
    if (m.includes('presentation') || m.includes('powerpoint')) return 'PPT';
    if (m.includes('word') || m === 'application/msword') return 'Word';
    if (m.startsWith('video/')) return 'Video';
    if (m.startsWith('image/')) return 'Image';
    if (m.startsWith('audio/')) return 'Audio';
    if (m === 'application/zip' || m.includes('compressed') || m.includes('tar')) return 'ZIP';
    if (m === 'text/plain') return 'Text';
  }
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (['xls', 'xlsx', 'csv'].includes(ext ?? '')) return 'Excel';
    if (['ppt', 'pptx'].includes(ext ?? '')) return 'PPT';
    if (['doc', 'docx'].includes(ext ?? '')) return 'Word';
    if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext ?? '')) return 'Video';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext ?? '')) return 'Image';
  }
  return 'File';
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

export default function DocumentManager({ roundId }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>('financials');
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listDocuments(roundId, { limit: 200 });
      setDocuments(result.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Please select a file first.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      const mimeType = file.type || 'application/octet-stream';

      // 1. Create document record
      const result = await createDocument(roundId, {
        name: file.name,
        category: selectedCategory,
        mimeType,
      });

      // 2. Upload file via server proxy (avoids S3 CORS issues)
      await uploadDocumentFile(result.id, file);

      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocuments();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    const docId = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      fetchDocuments();
    }
  }

  // Group files by category
  const grouped = documents.reduce<Record<string, Document[]>>((acc, doc) => {
    const cat = doc.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(doc);
    return acc;
  }, {});

  const sortedCategories = CATEGORY_ORDER.filter((c) => grouped[c]?.length);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Files</h2>
          <p className="text-muted-foreground">Manage dataroom files and documents.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDocuments}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Inline Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
          <CardDescription>Add a new document to the dataroom.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {uploadError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {uploadError}
            </div>
          )}
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">File</label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={() => setUploadError(null)}
                className="file:text-foreground placeholder:text-muted-foreground border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium"
              />
            </div>
            <div className="w-48 space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={selectedCategory}
                onValueChange={(v) => setSelectedCategory(v as DocumentCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleUpload} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Files Grouped by Category */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading files...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No files uploaded yet.</div>
      ) : (
        sortedCategories.map((category) => {
          const categoryDocs = grouped[category];
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 capitalize">
                  {category}
                  <Badge variant="secondary">{categoryDocs.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {doc.name}
                            <Badge className={categoryColor(doc.category)}>
                              {doc.category}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{friendlyType(doc.mimeType, doc.name)}</Badge>
                        </TableCell>
                        <TableCell>{formatFileSize(doc.fileSizeBytes)}</TableCell>
                        <TableCell>{formatDate(doc.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirmed}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete Document
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
