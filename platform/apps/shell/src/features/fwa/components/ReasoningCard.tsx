import { useState } from 'react';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@papaya/shared-ui';

interface ReasoningCardProps {
  content: string;
}

export default function ReasoningCard({ content }: ReasoningCardProps) {
  const [open, setOpen] = useState(false);

  // Truncate preview to first 120 chars
  const preview =
    content.length > 120 ? content.slice(0, 120).trimEnd() + '...' : content;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-left text-sm transition-colors hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/30 dark:hover:bg-purple-950/50"
        >
          <Brain className="h-4 w-4 shrink-0 text-purple-500" />
          <span className="flex-1 truncate text-purple-700 dark:text-purple-300">
            {open ? 'Reasoning' : preview}
          </span>
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-purple-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-purple-400" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-b-lg border border-t-0 border-purple-200 bg-purple-50/50 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-purple-700 dark:border-purple-800 dark:bg-purple-950/20 dark:text-purple-300">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
