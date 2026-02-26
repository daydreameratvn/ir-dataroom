import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useFatimaChat from './useFatimaChat';

/**
 * Create a mock SSE response from the Fatima API.
 * Returns a ReadableStream that emits SSE events.
 */
function mockSSEResponse(text: string): Response {
  const chunks = [
    `data: ${JSON.stringify({ type: 'delta', text })}\n\n`,
    `data: ${JSON.stringify({ type: 'done' })}\n\n`,
  ];

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Mock fetch to return SSE responses
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return mockSSEResponse('Hello from Fatima!');
  });
});

describe('useFatimaChat', () => {
  it('starts with a welcome message', () => {
    const { result } = renderHook(() => useFatimaChat());

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.role).toBe('assistant');
    expect(result.current.messages[0]!.content).toContain('Fatima');
    expect(result.current.isStreaming).toBe(false);
  });

  it('adds user message and starts streaming on send', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Show recent claims');
    });

    // Should have welcome + user message + empty assistant message
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[1]!.role).toBe('user');
    expect(result.current.messages[1]!.content).toBe('Show recent claims');
    expect(result.current.messages[2]!.role).toBe('assistant');
    expect(result.current.isStreaming).toBe(true);
  });

  it('streams response from API', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Show recent claims');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    const assistantMsg = result.current.messages[2]!;
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toBe('Hello from Fatima!');

    // Verify fetch was called with correct payload
    expect(fetch).toHaveBeenCalledWith(
      '/auth/fatima/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('sends conversation history to API', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Hello');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    // Send a second message
    act(() => {
      result.current.send('Follow up');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    // Second call should include conversation history
    const secondCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1]!;
    const body = JSON.parse(secondCall[1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };

    // Should include first user message + first assistant response + second user message
    expect(body.messages).toHaveLength(3);
    expect(body.messages[0]!.role).toBe('user');
    expect(body.messages[0]!.content).toBe('Hello');
    expect(body.messages[1]!.role).toBe('assistant');
    expect(body.messages[2]!.role).toBe('user');
    expect(body.messages[2]!.content).toBe('Follow up');
  });

  it('does not send empty messages', () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('   ');
    });

    expect(result.current.messages).toHaveLength(1); // only welcome
    expect(result.current.isStreaming).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not send while streaming', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('first message');
    });

    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.send('second message');
    });

    // Should still only have 3 messages (welcome + first user + first assistant)
    expect(result.current.messages).toHaveLength(3);
  });

  it('stops streaming when stop is called', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Show recent claims');
    });

    expect(result.current.isStreaming).toBe(true);

    act(() => {
      result.current.stop();
    });

    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[2]!.isStreaming).toBe(false);
  });

  it('clears conversation and resets to welcome message', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('hello');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    expect(result.current.messages.length).toBeGreaterThan(1);

    act(() => {
      result.current.clear();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]!.id).toBe('welcome');
    expect(result.current.isStreaming).toBe(false);
  });

  it('handles API errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('test');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    const assistantMsg = result.current.messages[2]!;
    expect(assistantMsg.content).toContain('trouble connecting');
  });
});
