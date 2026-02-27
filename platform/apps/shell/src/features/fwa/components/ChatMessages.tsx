import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';

interface ChatMessagesProps {
  messages: ChatMessage[];
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
}

export default function ChatMessages({
  messages,
  onApprove,
  onDeny,
}: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Start a conversation by entering a claim code above.
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
