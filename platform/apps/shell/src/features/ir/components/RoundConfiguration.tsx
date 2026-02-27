import { useState } from 'react';
import {
  Button,
  Card,
  CardContent,
} from '@papaya/shared-ui';
import type { Round } from '../types';
import { updateRound } from '../api';

interface RoundConfigurationProps {
  round: Round;
  onSaved: () => void;
}

const DEFAULT_CATEGORIES = [
  'financials',
  'strategy',
  'product',
  'legal',
  'team',
  'other',
];

export default function RoundConfiguration({ round, onSaved }: RoundConfigurationProps) {
  const [categories, setCategories] = useState<string[]>(
    round.configuration.categories.length > 0
      ? round.configuration.categories
      : DEFAULT_CATEGORIES
  );
  const [watermarkEnabled, setWatermarkEnabled] = useState(
    round.configuration.watermarkEnabled
  );
  const [ndaRequired, setNdaRequired] = useState(round.configuration.ndaRequired);
  const [allowDownload, setAllowDownload] = useState(round.configuration.allowDownload);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function toggleCategory(category: string) {
    setCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // We send the full round update including configuration via a dedicated endpoint
      // For now we use updateRound which can pass configuration changes
      await updateRound(round.id, {
        // Pass configuration as part of the update
        // The backend will merge the configuration object
        ...({
          configuration: {
            ...round.configuration,
            categories,
            watermarkEnabled,
            ndaRequired,
            allowDownload,
          },
        } as Record<string, unknown>),
      });
      setSuccess(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Document Categories */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h4 className="text-sm font-medium">Document Categories</h4>
          <p className="text-xs text-muted-foreground">
            Select which document categories are available in this round.
          </p>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  categories.includes(cat)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Toggles */}
      <Card>
        <CardContent className="space-y-6 pt-6">
          <h4 className="text-sm font-medium">Access Controls</h4>

          {/* Watermark */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Watermark Documents</p>
              <p className="text-xs text-muted-foreground">
                Apply investor-specific watermarks to viewed documents
              </p>
            </div>
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
          </div>

          {/* NDA Required */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Require NDA</p>
              <p className="text-xs text-muted-foreground">
                Investors must accept the NDA before accessing documents
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNdaRequired(!ndaRequired)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                ndaRequired ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  ndaRequired ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Allow Download */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow Downloads</p>
              <p className="text-xs text-muted-foreground">
                Let investors download documents (vs. view-only)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAllowDownload(!allowDownload)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                allowDownload ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  allowDownload ? 'translate-x-4.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Error / Success */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Configuration saved successfully.
        </div>
      )}

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
