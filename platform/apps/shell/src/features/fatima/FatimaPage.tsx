import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Send,
  Square,
  RotateCcw,
} from 'lucide-react';
import {
  Button,
  MarkdownRenderer,
} from '@papaya/shared-ui';
import useFatimaChat from './useFatimaChat';
import type { FatimaMessage } from './types';

export default function FatimaPage() {
  const { t } = useTranslation();
  const { messages, isStreaming, send, stop, clear } = useFatimaChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const suggestions = [
    t('fatima.suggestions.recentClaims'),
    t('fatima.suggestions.fraudAlertsToday'),
    t('fatima.suggestions.whatIsLossRatio'),
    t('fatima.suggestions.findPolicy'),
    t('fatima.suggestions.underwriting'),
  ];

  return (
    <div className="flex h-[calc(100vh-theme(spacing.14)-theme(spacing.12))] flex-col">
      <div className="flex items-center justify-between pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{t('fatima.name')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('fatima.pageSubtitle')}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={clear} className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" />
          {t('common.newConversation')}
        </Button>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border bg-muted/20 p-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {messages.map((message) => (
            <PageMessage key={message.id} message={message} />
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

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap justify-center gap-2 pt-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              className="rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              onClick={() => send(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="mx-auto w-full max-w-3xl pt-3">
        <div className="flex items-end gap-2 rounded-xl border bg-background px-4 py-3 shadow-sm focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/10">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('fatima.pagePlaceholder')}
            className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 shrink-0"
              onClick={stop}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleSubmit}
              disabled={!input.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PageMessageProps {
  message: FatimaMessage;
}

function PageMessage({ message }: PageMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-5 py-3 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-2">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {message.content ? (
          <MarkdownRenderer content={message.content} size="sm" />
        ) : (
          <span className="text-muted-foreground">...</span>
        )}
      </div>
    </div>
  );
}
