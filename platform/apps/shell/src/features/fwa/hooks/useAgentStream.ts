import { useCallback, useRef, useState } from 'react';
import type {
  AgentStatus,
  ApprovalPart,
  ChatMessage,
  MessagePart,
  SSEEvent,
  ToolPart,
} from '../types';

interface UseAgentStreamReturn {
  messages: ChatMessage[];
  status: AgentStatus;
  error: string | null;
  pendingApprovals: ApprovalPart[];
  startStream: (response: Response) => void;
  addUserMessage: (text: string) => void;
  respondToApproval: (toolCallId: string, approved: boolean) => void;
  reset: () => void;
}

let messageCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

export default function useAgentStream(): UseAgentStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Track current assistant message being built
  const currentAssistantRef = useRef<{
    id: string;
    parts: MessagePart[];
  } | null>(null);

  // Track pending approvals
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalPart[]>([]);

  const flushAssistant = useCallback(() => {
    const current = currentAssistantRef.current;
    if (!current || current.parts.length === 0) return;

    setMessages((prev) => {
      const existing = prev.findIndex((m) => m.id === current.id);
      const msg: ChatMessage = {
        id: current.id,
        role: 'assistant',
        parts: [...current.parts],
      };
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }, []);

  const ensureAssistantMessage = useCallback((): { id: string; parts: MessagePart[] } => {
    if (!currentAssistantRef.current) {
      currentAssistantRef.current = { id: nextMessageId(), parts: [] };
    }
    return currentAssistantRef.current;
  }, []);

  const processEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case 'agent_start': {
          setStatus('streaming');
          break;
        }

        case 'text_delta': {
          const msg = ensureAssistantMessage();
          // Append to existing text part or create new one
          const lastPart = msg.parts[msg.parts.length - 1];
          if (lastPart && lastPart.type === 'text') {
            lastPart.content += event.delta;
          } else {
            msg.parts.push({ type: 'text', content: event.delta });
          }
          flushAssistant();
          break;
        }

        case 'thinking_delta': {
          const msg = ensureAssistantMessage();
          const lastPart = msg.parts[msg.parts.length - 1];
          if (lastPart && lastPart.type === 'reasoning') {
            lastPart.content += event.delta;
          } else {
            msg.parts.push({ type: 'reasoning', content: event.delta });
          }
          flushAssistant();
          break;
        }

        case 'tool_start': {
          const msg = ensureAssistantMessage();
          msg.parts.push({
            type: 'tool',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args,
            status: 'running',
          });
          flushAssistant();
          break;
        }

        case 'tool_update': {
          const msg = ensureAssistantMessage();
          const toolPart = msg.parts.find(
            (p): p is ToolPart =>
              p.type === 'tool' && p.toolCallId === event.toolCallId,
          );
          if (toolPart) {
            toolPart.result = event.partialResult;
          }
          flushAssistant();
          break;
        }

        case 'tool_end': {
          const msg = ensureAssistantMessage();
          const toolPart = msg.parts.find(
            (p): p is ToolPart =>
              p.type === 'tool' && p.toolCallId === event.toolCallId,
          );
          if (toolPart) {
            toolPart.result = event.result;
            toolPart.isError = event.isError;
            toolPart.status = event.isError ? 'error' : 'completed';
          }
          flushAssistant();
          break;
        }

        case 'approval_request': {
          const msg = ensureAssistantMessage();
          const approvalPart: ApprovalPart = {
            type: 'approval',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            params: event.params,
            status: 'pending',
          };
          msg.parts.push(approvalPart);
          setPendingApprovals((prev) => [...prev, approvalPart]);
          flushAssistant();
          break;
        }

        case 'message_end': {
          // Message complete — finalize current assistant message
          flushAssistant();
          break;
        }

        case 'agent_end': {
          flushAssistant();
          currentAssistantRef.current = null;
          setStatus('idle');
          break;
        }

        case 'error': {
          setError(event.message);
          setStatus('error');
          flushAssistant();
          currentAssistantRef.current = null;
          break;
        }
      }
    },
    [ensureAssistantMessage, flushAssistant],
  );

  const startStream = useCallback(
    (response: Response) => {
      setStatus('connecting');
      setError(null);
      currentAssistantRef.current = null;

      const reader = response.body?.getReader();
      if (!reader) {
        setError('No response body');
        setStatus('error');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      async function read() {
        while (true) {
          const { done, value } = await reader!.read();
          if (done) {
            setStatus((prev) => (prev === 'streaming' ? 'idle' : prev));
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const event = JSON.parse(line.slice(6)) as SSEEvent;
                processEvent(event);
              } catch {
                // Skip malformed events
              }
            }
          }
        }
      }

      read().catch((err) => {
        setError(err instanceof Error ? err.message : 'Stream error');
        setStatus('error');
      });
    },
    [processEvent],
  );

  const addUserMessage = useCallback((text: string) => {
    const msg: ChatMessage = {
      id: nextMessageId(),
      role: 'user',
      parts: [{ type: 'text', content: text }],
    };
    setMessages((prev) => [...prev, msg]);
  }, []);

  const respondToApproval = useCallback((toolCallId: string, approved: boolean) => {
    // Update the approval part status in messages
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
          if (part.type === 'approval' && part.toolCallId === toolCallId) {
            return { ...part, status: approved ? 'approved' : 'denied' } as ApprovalPart;
          }
          return part;
        }),
      })),
    );
    // Remove from pending
    setPendingApprovals((prev) => prev.filter((a) => a.toolCallId !== toolCallId));
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setStatus('idle');
    setError(null);
    setPendingApprovals([]);
    currentAssistantRef.current = null;
  }, []);

  return {
    messages,
    status,
    error,
    pendingApprovals,
    startStream,
    addUserMessage,
    respondToApproval,
    reset,
  };
}
