import { AlertTriangle, Check, X } from 'lucide-react';
import { Badge, Button } from '@papaya/shared-ui';
import type { ApprovalStatus } from '../types';

interface ApprovalCardProps {
  toolCallId: string;
  toolName: string;
  params: unknown;
  status: ApprovalStatus;
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
}

// Human-readable labels for approval tools
const TOOL_LABELS: Record<string, string> = {
  saveDetailForm: 'Save Claim Details',
  assessBenefit: 'Assess Benefit',
  createSignOff: 'Create Sign-Off',
  approve: 'Approve Claim',
  issuePendingCodes: 'Issue Pending Codes',
  createSupplementRequest: 'Create Supplement Request',
};

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    return new Intl.NumberFormat('vi-VN').format(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}

export default function ApprovalCard({
  toolCallId,
  toolName,
  params,
  status,
  onApprove,
  onDeny,
}: ApprovalCardProps) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const paramEntries = params && typeof params === 'object'
    ? Object.entries(params as Record<string, unknown>)
    : [];

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 dark:border-amber-800">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="flex-1 text-sm font-medium text-amber-800 dark:text-amber-300">
          Approval Required: {label}
        </span>
        {status !== 'pending' && (
          <Badge
            className={
              status === 'approved'
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                : 'bg-red-100 text-red-700 hover:bg-red-100'
            }
          >
            {status === 'approved' ? 'Approved' : 'Denied'}
          </Badge>
        )}
      </div>

      {/* Params preview */}
      {paramEntries.length > 0 && (
        <div className="space-y-1.5 px-4 py-3">
          {paramEntries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2 text-sm">
              <span className="w-36 shrink-0 font-medium text-amber-700 dark:text-amber-400">
                {key}
              </span>
              <span className="text-amber-900 dark:text-amber-200">
                {formatParamValue(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {status === 'pending' && (
        <div className="flex gap-2 border-t border-amber-200 px-4 py-3 dark:border-amber-800">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => onApprove(toolCallId)}
          >
            <Check className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => onDeny(toolCallId)}
          >
            <X className="h-3.5 w-3.5" />
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}
