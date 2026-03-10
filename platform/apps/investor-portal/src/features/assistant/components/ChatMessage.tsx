import { Sparkles } from 'lucide-react';
import { MarkdownRenderer } from '@papaya/shared-ui';
import type { ChatMessage as ChatMessageType } from '../types';
import ChartBlock from './ChartBlock';
import type { ReactNode } from 'react';

interface ChatMessageProps {
  message: ChatMessageType;
}

function renderCodeBlock(language: string, code: string): ReactNode | null {
  if (language === 'chart') {
    return <ChartBlock content={code} />;
  }
  return null;
}

export default function ChatMessage({ message }: ChatMessageProps) {
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
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-pink-500 text-white">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {message.content ? (
          <MarkdownRenderer
            content={message.content}
            size="sm"
            enableMath
            renderCodeBlock={renderCodeBlock}
          />
        ) : (
          <span className="text-muted-foreground">...</span>
        )}
      </div>
    </div>
  );
}
