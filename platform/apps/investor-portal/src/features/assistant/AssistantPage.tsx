import { useEffect, useRef, useState } from 'react';
import { Button } from '@papaya/shared-ui';
import { RotateCcw, Sparkles } from 'lucide-react';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';
import useAssistantChat from './useAssistantChat';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import SuggestedPrompts from './components/SuggestedPrompts';
import StreamingIndicator from './components/StreamingIndicator';

export default function AssistantPage() {
  const { investor } = useInvestorAuth();
  const { messages, isStreaming, send, stop, clear } = useAssistantChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const isEmptyState = messages.length <= 1;

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSubmit() {
    if (!input.trim() || isStreaming) return;
    send(input);
    setInput('');
  }

  function handleSuggestion(prompt: string) {
    send(prompt);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem-2px)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-pink-500 text-white shadow-sm">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">
              Smart AI Assistance
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {isStreaming ? 'Thinking...' : 'Powered by your investor materials'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={clear}
          className="gap-1.5 text-xs"
        >
          <RotateCcw className="size-3.5" />
          New Chat
        </Button>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmptyState ? (
          /* Empty state — welcome + suggestions */
          <div className="flex h-full flex-col items-center justify-center px-6">
            <div className="w-full max-w-xl space-y-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-pink-500/10">
                  <Sparkles className="size-7 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  Hello{investor?.name ? `, ${investor.name.split(' ')[0]}` : ''}!
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  I can help you understand company financials, calculate key
                  ratios, and create visualizations. Ask me anything about
                  your investment.
                </p>
              </div>
              <SuggestedPrompts onSelect={handleSuggestion} />
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="mx-auto max-w-3xl space-y-1 px-6 py-4">
            {messages
              .filter((m) => m.id !== 'welcome')
              .map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            {isStreaming && <StreamingIndicator />}
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onStop={stop}
        isStreaming={isStreaming}
      />
    </div>
  );
}
