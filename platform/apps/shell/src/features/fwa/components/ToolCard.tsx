import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  FileSearch,
  Calculator,
  ClipboardCheck,
  PenTool,
  Search,
  Database,
  Shield,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@papaya/shared-ui';
import type { ToolStatus } from '../types';

// ── Tool Configuration ──

interface ToolConfig {
  icon: React.ElementType;
  label: string;
  color: string;
}

const TOOL_CONFIG: Record<string, ToolConfig> = {
  claim: { icon: FileSearch, label: 'Fetch Claim', color: 'blue' },
  insured: { icon: Database, label: 'Fetch Insured', color: 'blue' },
  benefits: { icon: Calculator, label: 'Benefits', color: 'blue' },
  balance: { icon: Calculator, label: 'Balance', color: 'blue' },
  assessBenefit: { icon: ClipboardCheck, label: 'Assess Benefit', color: 'emerald' },
  createSignOff: { icon: PenTool, label: 'Create Sign-Off', color: 'emerald' },
  approve: { icon: Shield, label: 'Approve', color: 'emerald' },
  saveDetailForm: { icon: PenTool, label: 'Save Details', color: 'amber' },
  medicalProvider: { icon: Database, label: 'Provider', color: 'blue' },
  medicalProviders: { icon: Database, label: 'Providers', color: 'blue' },
  icd: { icon: Search, label: 'ICD Lookup', color: 'blue' },
  googleSearch: { icon: Search, label: 'Google Search', color: 'blue' },
  invokeComplianceAgent: { icon: Shield, label: 'Compliance Check', color: 'purple' },
  runComplianceCheck: { icon: Shield, label: 'Compliance Check', color: 'purple' },
  findSimilarApprovedClaims: { icon: Search, label: 'Similar Claims', color: 'blue' },
  getComplianceRule: { icon: Shield, label: 'Compliance Rule', color: 'purple' },
  saveComplianceRule: { icon: PenTool, label: 'Save Rule', color: 'purple' },
  sendSlackMessage: { icon: MessageSquare, label: 'Slack Message', color: 'blue' },
  addSlackReaction: { icon: MessageSquare, label: 'Slack Reaction', color: 'blue' },
  getPendingCodeMapping: { icon: Database, label: 'Pending Codes', color: 'blue' },
  getClaimContextForTemplates: { icon: Database, label: 'Claim Context', color: 'blue' },
  getPendingCodeTemplates: { icon: Database, label: 'Code Templates', color: 'blue' },
  getInsurerPendingCodeMapping: { icon: Database, label: 'Insurer Codes', color: 'blue' },
  issuePendingCodes: { icon: PenTool, label: 'Issue Pending Codes', color: 'amber' },
  createSupplementRequest: { icon: PenTool, label: 'Supplement Request', color: 'amber' },
};

function getToolConfig(toolName: string): ToolConfig {
  return TOOL_CONFIG[toolName] ?? { icon: Wrench, label: toolName, color: 'gray' };
}

// ── Status Badge ──

function StatusBadge({ status }: { status: ToolStatus }) {
  switch (status) {
    case 'running':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case 'completed':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Done
        </Badge>
      );
    case 'error':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <XCircle className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
  }
}

// ── Component ──

interface ToolCardProps {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: ToolStatus;
}

export default function ToolCard({
  toolName,
  args,
  result,
  status,
}: ToolCardProps) {
  const [open, setOpen] = useState(false);
  const config = getToolConfig(toolName);
  const Icon = config.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-800"
        >
          <Icon className="h-4 w-4 shrink-0 text-gray-500" />
          <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">
            {config.label}
          </span>
          <StatusBadge status={status} />
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-2 rounded-b-lg border border-t-0 border-gray-200 bg-gray-50/50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/30">
          {args != null && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-500">Input</div>
              <pre className="overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result != null && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-500">Output</div>
              <pre className="max-h-60 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
