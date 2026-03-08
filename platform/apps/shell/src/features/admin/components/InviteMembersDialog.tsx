import { useState } from 'react';
import {
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Badge,
} from '@papaya/shared-ui';
import { Loader2, Plus, X } from 'lucide-react';
import { inviteMembers } from '../members-api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function InviteMembersDialog({
  open,
  onOpenChange,
  onSuccess,
}: InviteMembersDialogProps) {
  const [input, setInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ invited: number; skipped: number; errors: string[] } | null>(null);

  function handleAdd() {
    const email = input.trim().toLowerCase();
    if (EMAIL_RE.test(email) && !emails.includes(email)) {
      setEmails((prev) => [...prev, email]);
      setInput('');
    }
  }

  function handleRemove(email: string) {
    setEmails((prev) => prev.filter((e) => e !== email));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  async function handleSubmit() {
    if (emails.length === 0) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await inviteMembers({ emails });
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
    setInput('');
    setResult(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Members</DialogTitle>
          <DialogDescription>
            Add email addresses to invite. Members will receive an invitation to join.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Email input */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="email@example.com"
              disabled={isSubmitting}
            />
            <Button
              variant="outline"
              onClick={handleAdd}
              disabled={isSubmitting || !EMAIL_RE.test(input.trim())}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Email list */}
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {emails.map((email) => (
                <Badge key={email} variant="secondary" className="gap-1 pr-1">
                  {email}
                  <button
                    onClick={() => handleRemove(email)}
                    className="ml-1 rounded-full p-0.5 hover:bg-muted"
                    disabled={isSubmitting}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p>{result.invited} invited, {result.skipped} skipped</p>
              {result.errors.length > 0 && (
                <ul className="mt-1 text-destructive">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
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
              Invite {emails.length} {emails.length === 1 ? 'Member' : 'Members'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
