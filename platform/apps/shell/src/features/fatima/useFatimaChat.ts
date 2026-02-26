import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FatimaMessage } from './types';

/**
 * Stream a response from the Fatima backend (SSE).
 * Falls back to a simple offline message if the API is unavailable.
 */
export function streamFromAPI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  language: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal,
  offlineFallback: string
): void {
  fetch('/auth/fatima/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, language }),
    signal,
  })
    .then((res) => {
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

          // Parse SSE events from buffer
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
                onDelta(`\n\n*${event.message ?? 'Something went wrong.'}*`);
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
      console.warn('[Fatima] API unavailable, using offline fallback:', err.message);
      onDelta(offlineFallback);
      onDone();
    });
}

/**
 * Exported for the command palette inline mode.
 * Uses the same SSE streaming API.
 */
export function simulateStream(
  userMessage: string,
  language: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal,
  offlineFallback: string
): void {
  streamFromAPI(
    [{ role: 'user', content: userMessage }],
    language,
    onDelta,
    onDone,
    signal,
    offlineFallback
  );
}

export default function useFatimaChat() {
  const { t, i18n } = useTranslation();

  const [messages, setMessages] = useState<FatimaMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      content: t('fatima.welcome'),
      timestamp: Date.now(),
    },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: FatimaMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: FatimaMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    // Build conversation history from current messages (exclude welcome)
    const apiMessages = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role, content: m.content }));
    apiMessages.push({ role: 'user' as const, content: text.trim() });

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    streamFromAPI(
      apiMessages,
      i18n.language,
      (delta) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + delta }
              : m
          )
        );
      },
      () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, isStreaming: false }
              : m
          )
        );
        setIsStreaming(false);
        abortRef.current = null;
      },
      controller.signal,
      t('fatima.offlineFallback')
    );
  }, [isStreaming, messages, i18n.language, t]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: t('fatima.welcome'),
      timestamp: Date.now(),
    }]);
  }, [t]);

  return { messages, isStreaming, send, stop, clear };
}
