import { useState } from 'react';
import { AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Textarea,
} from '@papaya/shared-ui';
import { useTranslation } from '@papaya/i18n';
import { approveClaim, rejectClaim } from '../api';

interface ApprovalBarProps {
  claimId: string;
  onStatusChange: () => void;
}

export default function ApprovalBar({ claimId, onStatusChange }: ApprovalBarProps) {
  const { t } = useTranslation();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleApprove() {
    setLoading(true);
    try {
      await approveClaim(claimId);
      setApproveOpen(false);
      onStatusChange();
    } catch {
      // Error is handled silently — the API layer throws with a message
      // In production, this would integrate with a toast/notification system
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await rejectClaim(claimId, reason.trim());
      setRejectOpen(false);
      setReason('');
      onStatusChange();
    } catch {
      // Error is handled silently — the API layer throws with a message
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sticky bottom-0 z-10 border-t bg-amber-50 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left: warning text */}
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <span className="text-sm font-medium text-amber-800">
            {t('portal.approval.requiresReview')}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-3">
          {/* Reject */}
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <Button
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setRejectOpen(true)}
            >
              <X className="mr-2 h-4 w-4" />
              {t('portal.approval.reject')}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('portal.approval.rejectTitle')}</DialogTitle>
                <DialogDescription>
                  {t('portal.approval.rejectDescription')}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <label htmlFor="rejection-reason" className="text-sm font-medium">
                  {t('portal.approval.rejectionReason')}
                </label>
                <Textarea
                  id="rejection-reason"
                  placeholder={t('portal.approval.rejectionPlaceholder')}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRejectOpen(false)}
                  disabled={loading}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={loading || !reason.trim()}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  {t('portal.approval.confirmRejection')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Approve */}
          <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setApproveOpen(true)}
            >
              <Check className="mr-2 h-4 w-4" />
              {t('portal.approval.approve')}
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('portal.approval.approveTitle')}</DialogTitle>
                <DialogDescription>
                  {t('portal.approval.approveDescription')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setApproveOpen(false)}
                  disabled={loading}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={handleApprove}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  {t('portal.approval.confirmApproval')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
