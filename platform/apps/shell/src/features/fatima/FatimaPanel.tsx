import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Send,
  Square,
  RotateCcw,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  cn,
  Button,
  MarkdownRenderer,
} from '@papaya/shared-ui';
import useFatimaChat from './useFatimaChat';
import type { FatimaMessage } from './types';

export interface FatimaPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function FatimaPanel({ open, onClose }: FatimaPanelProps) {
  const { messages, isStreaming, send, stop, clear } = useFatimaChat();
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // ⌘J shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        if (open) {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  function handleSubmit() {
    if (!input.trim() || isStreaming) return;
    send(input);
    setInput('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed z-50 flex flex-col border-l bg-background shadow-2xl transition-all duration-300',
        expanded
          ? 'inset-y-0 right-0 w-full sm:w-[640px]'
          : 'inset-y-0 right-0 w-full sm:w-[420px]'
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Fatima</h2>
            <p className="text-[11px] text-muted-foreground">
              {isStreaming ? 'Thinking...' : 'Wise woman of the desert'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clear}
            title="New conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hidden sm:flex"
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1 p-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isStreaming && (
            <div className="flex justify-start px-2 py-1">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:0.2s]" />
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500 [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions (shown when few messages) */}
      {messages.length <= 1 && (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              'Show recent claims',
              'Any fraud alerts?',
              'What can you do?',
              'Loss ratio this month',
            ].map((suggestion) => (
              <button
                key={suggestion}
                className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-xl border bg-muted/30 px-3 py-2 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Fatima anything..."
            className="max-h-32 min-h-[20px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={stop}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
          Fatima can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: FatimaMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end py-1">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5 py-1">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
        <Sparkles className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {message.content ? (
          <MarkdownRenderer content={message.content} size="sm" />
        ) : (
          <span className="text-muted-foreground">...</span>
        )}
      </div>
    </div>
  );
}
