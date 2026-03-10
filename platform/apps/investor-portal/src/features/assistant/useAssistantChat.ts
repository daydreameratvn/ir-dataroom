import { useCallback, useRef, useState } from 'react';
import { useInvestorAuth } from '@/providers/InvestorAuthProvider';
import type { ChatMessage } from './types';

const WELCOME_MESSAGE =
  "Hello! I'm your Investor Relations AI assistant. I can help you understand company financials, calculate key ratios, and create visualizations based on the latest investor materials. What would you like to know?";

const OFFLINE_FALLBACK =
  "I'm currently unable to connect. Please check your connection and try again.";

function streamFromAPI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  token: string | null,
  onDelta: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal,
): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  fetch('/auth/ir/portal/assistant/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages }),
    signal,
  })
    .then((res) => {
      if (res.status === 401) {
        localStorage.removeItem('investor_token');
        localStorage.removeItem('investor_info');
        window.location.href = '/login';
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function pump(): Promise<void> {
        return reader.read().then(({ done, value }) => {
          if (done || signal.aborted) {
            onDone();
            return;
          }

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6);
            if (!json) continue;

            try {
              const event = JSON.parse(json) as {
                type: 'delta' | 'done' | 'error';
                text?: string;
                message?: string;
              };

              if (event.type === 'delta' && event.text) {
                onDelta(event.text);
              } else if (event.type === 'done') {
                onDone();
                reader.cancel();
                return;
              } else if (event.type === 'error') {
                onDelta(
                  `\n\n*${event.message ?? 'Something went wrong.'}*`,
                );
                onDone();
                reader.cancel();
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }

          return pump();
        });
      }

      return pump();
    })
    .catch((err) => {
      if (signal.aborted) return;
      console.warn(
        '[Assistant] API unavailable, using offline fallback:',
        err.message,
      );
      onDelta(OFFLINE_FALLBACK);
      onDone();
    });
}

export default function useAssistantChat() {
  const { getToken } = useInvestorAuth();

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: WELCOME_MESSAGE,
      timestamp: Date.now(),
    },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming) return;

      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      const assistantId = `assistant-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      // Build conversation history (exclude welcome message)
      const apiMessages = messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user' as const, content: text.trim() });

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const token = getToken();

      streamFromAPI(
        apiMessages,
        token,
        (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + delta }
                : m,
            ),
          );
        },
        () => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, isStreaming: false } : m,
            ),
          );
          setIsStreaming(false);
          abortRef.current = null;
        },
        controller.signal,
      );
    },
    [isStreaming, messages, getToken],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: WELCOME_MESSAGE,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  return { messages, isStreaming, send, stop, clear };
}
