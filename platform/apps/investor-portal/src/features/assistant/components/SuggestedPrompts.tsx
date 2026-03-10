const SUGGESTIONS = [
  'What are the key financial highlights?',
  'Calculate the burn rate and runway',
  'Show me a revenue growth chart',
  'Summarize the latest investor update',
  'What is the current valuation?',
  'Explain the cap table structure',
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">
        Try asking
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            className="rounded-xl border bg-background px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-papaya-lightest hover:text-foreground"
            onClick={() => onSelect(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
