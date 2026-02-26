import { useCallback, useRef, useState } from 'react';
import type { FatimaMessage } from './types';

const WELCOME_MESSAGE: FatimaMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Hello! I'm **Fatima** — the wise woman of the desert. Like the wind that knows every grain of sand in the Sahara, I know every claim, every policy, every pattern hidden in your data.

I can help you with:

- **Claims** — Look up status, find claims by patient or provider, explain adjudication decisions
- **Policies** — Search policies, check coverage details, review endorsements
- **Underwriting** — Assess risk scores, check application status
- **FWA** — Review fraud alerts, investigate suspicious patterns
- **Providers** — Find providers, check contract status
- **Analytics** — Loss ratios, claims trends, KPI summaries

What would you like to know?`,
  timestamp: Date.now(),
};

/**
 * Stream a response from the Fatima backend (SSE).
 * Falls back to a simple offline message if the API is unavailable.
 */
export function streamFromAPI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onDelta: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  fetch('/auth/fatima/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
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
      // Offline fallback — let the user know
      onDelta(
        "I'm having trouble connecting to my backend right now. Please make sure the auth service is running (`bun run dev` in `auth/`). I'll be ready once the connection is restored."
      );
      onDone();
    });
}

/**
 * Exported for the command palette inline mode.
 * Uses the same SSE streaming API.
 */
export function simulateStream(
  userMessage: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  streamFromAPI(
    [{ role: 'user', content: userMessage }],
    onDelta,
    onDone,
    signal
  );
}

export default function useFatimaChat() {
  const [messages, setMessages] = useState<FatimaMessage[]>([WELCOME_MESSAGE]);
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
      controller.signal
    );
  }, [isStreaming, messages]);

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
    setMessages([WELCOME_MESSAGE]);
  }, []);

  return { messages, isStreaming, send, stop, clear };
}
