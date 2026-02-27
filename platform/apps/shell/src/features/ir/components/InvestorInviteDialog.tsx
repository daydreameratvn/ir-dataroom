import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@papaya/shared-ui';
import { addInvestorToRound } from '../api';

interface InvestorInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  onAdded: () => void;
}

export default function InvestorInviteDialog({
  open,
  onOpenChange,
  roundId,
  onAdded,
}: InvestorInviteDialogProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [firm, setFirm] = useState('');
  const [title, setTitle] = useState('');
  const [skipNda, setSkipNda] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await addInvestorToRound(roundId, {
        email: email.trim(),
        name: name.trim(),
        firm: firm.trim() || undefined,
        title: title.trim() || undefined,
        skipNda: skipNda || undefined,
      });

      // Reset form
      setEmail('');
      setName('');
      setFirm('');
      setTitle('');
      setSkipNda(false);

      onAdded();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add investor');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Investor to Round</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Email <span className="text-red-500">*</span>
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="investor@firm.com"
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
              placeholder="Full name"
            />
          </div>

          {/* Firm */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Firm</label>
            <Input
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              placeholder="Investment firm name"
            />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Managing Partner"
            />
          </div>

          {/* Skip NDA */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skipNda}
              onChange={(e) => setSkipNda(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">Skip NDA requirement for this investor</span>
          </label>

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
              {isSaving ? 'Adding...' : 'Add Investor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
