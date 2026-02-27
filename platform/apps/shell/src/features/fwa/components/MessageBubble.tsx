import { Bot, User } from 'lucide-react';
import { MarkdownRenderer } from '@papaya/shared-ui';
import type { ChatMessage, MessagePart } from '../types';
import ReasoningCard from './ReasoningCard';
import ToolCard from './ToolCard';
import ApprovalCard from './ApprovalCard';

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove: (toolCallId: string) => void;
  onDeny: (toolCallId: string) => void;
}

function renderPart(
  part: MessagePart,
  index: number,
  onApprove: (toolCallId: string) => void,
  onDeny: (toolCallId: string) => void,
) {
  switch (part.type) {
    case 'text':
      return (
        <MarkdownRenderer key={index} content={part.content} />
      );

    case 'reasoning':
      return <ReasoningCard key={index} content={part.content} />;

    case 'tool':
      return (
        <ToolCard
          key={part.toolCallId}
          toolCallId={part.toolCallId}
          toolName={part.toolName}
          args={part.args}
          result={part.result}
          isError={part.isError}
          status={part.status}
        />
      );

    case 'approval':
      return (
        <ApprovalCard
          key={part.toolCallId}
          toolCallId={part.toolCallId}
          toolName={part.toolName}
          params={part.params}
          status={part.status}
          onApprove={onApprove}
          onDeny={onDeny}
        />
      );
  }
}

export default function MessageBubble({
  message,
  onApprove,
  onDeny,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
            : 'bg-gradient-to-br from-amber-500 to-orange-600 text-white'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div
        className={`min-w-0 max-w-[85%] space-y-2 ${
          isUser ? 'text-right' : ''
        }`}
      >
        {isUser ? (
          <div className="inline-block rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-sm text-white">
            {message.parts.map((part, i) =>
              part.type === 'text' ? (
                <span key={i}>{part.content}</span>
              ) : null,
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {message.parts.map((part, i) => renderPart(part, i, onApprove, onDeny))}
          </div>
        )}
      </div>
    </div>
  );
}
