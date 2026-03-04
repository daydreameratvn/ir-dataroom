import { useCallback, useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Textarea,
} from '@papaya/shared-ui';
import { getActiveNda, createNda } from '../api';

interface NDAEditorProps {
  roundId: string;
}

export default function NDAEditor({ roundId }: NDAEditorProps) {
  const [ndaText, setNdaText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchNda = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getActiveNda(roundId);
      setNdaText(result?.content ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch NDA');
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchNda();
  }, [fetchNda]);

  async function handleSave() {
    if (!ndaText.trim()) {
      setError('NDA content cannot be empty');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await createNda(roundId, ndaText.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save NDA');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">NDA Drafting</h2>
        <p className="text-muted-foreground">
          Draft and manage the NDA template for your dataroom.
        </p>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>NDA Template</CardTitle>
          <CardDescription>
            Edit the Non-Disclosure Agreement text that investors must accept
            before accessing the dataroom.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading NDA template...
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              {saved && (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  NDA template saved successfully.
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="nda-text" className="text-sm font-medium">
                  NDA Content
                </label>
                <Textarea
                  id="nda-text"
                  value={ndaText}
                  onChange={(e) => { setNdaText(e.target.value); setSaved(false); }}
                  rows={20}
                  placeholder="Enter your NDA text here..."
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save NDA Template'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
