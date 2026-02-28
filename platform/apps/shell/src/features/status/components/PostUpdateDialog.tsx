import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@papaya/shared-ui';
import { Loader2 } from 'lucide-react';
import { postIncidentUpdate } from '../api';

const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;

interface PostUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incidentId: string;
  currentStatus: string;
  onPosted: () => void;
}

export default function PostUpdateDialog({
  open,
  onOpenChange,
  incidentId,
  currentStatus,
  onPosted,
}: PostUpdateDialogProps) {
  const [status, setStatus] = useState<string>(currentStatus);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError('Message is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await postIncidentUpdate(incidentId, {
        status,
        message: message.trim(),
      });
      setMessage('');
      setError(null);
      onOpenChange(false);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post Update</DialogTitle>
          <DialogDescription>
            Add a status update to the incident timeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the current situation..."
              rows={4}
              aria-invalid={error === 'Message is required'}
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Post Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
