import { useCallback, useEffect, useState } from 'react';
import { FileCheck, RefreshCw } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Textarea,
} from '@papaya/shared-ui';
import type { NdaTemplate } from '../types';
import { getActiveNda, createNda } from '../api';

interface NDAEditorProps {
  roundId: string;
}

export default function NDAEditor({ roundId }: NDAEditorProps) {
  const [nda, setNda] = useState<NdaTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchNda = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getActiveNda(roundId);
      setNda(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch NDA');
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchNda();
  }, [fetchNda]);

  function handleStartEdit() {
    setEditContent(nda?.content ?? '');
    setIsEditing(true);
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditContent('');
  }

  async function handleSave() {
    if (!editContent.trim()) {
      setError('NDA content cannot be empty');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const newNda = await createNda(roundId, editContent.trim());
      setNda(newNda);
      setIsEditing(false);
      setEditContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save NDA');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Loading NDA...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            {nda ? `NDA Template (v${nda.version})` : 'NDA Template'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchNda} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          {!isEditing && (
            <Button size="sm" onClick={handleStartEdit}>
              {nda ? 'Edit NDA' : 'Create NDA'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isEditing ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Enter NDA content..."
              rows={20}
              className="font-mono text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save NDA'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving creates a new version. Previous versions are preserved.
            </p>
          </CardContent>
        </Card>
      ) : nda ? (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Version {nda.version}</span>
              <span>
                Created{' '}
                {new Intl.DateTimeFormat('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(nda.createdAt))}
              </span>
            </div>
            <Textarea
              value={nda.content}
              readOnly
              rows={20}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex h-32 items-center justify-center pt-6 text-sm text-muted-foreground">
            No NDA template configured for this round. Create one to require NDA acceptance.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
