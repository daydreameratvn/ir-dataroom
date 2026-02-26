import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useFatimaChat from './useFatimaChat';

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

  it('streams a claims response for claim-related queries', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Show recent claims');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    const assistantMsg = result.current.messages[2]!;
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toContain('CLM-2024-001');
    expect(assistantMsg.content).toContain('Under Review');
  });

  it('streams a policy response for policy-related queries', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Tell me about our policies');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    const assistantMsg = result.current.messages[2]!;
    expect(assistantMsg.content).toContain('POL-2024-TH-00847');
    expect(assistantMsg.content).toContain('Group Health');
  });

  it('streams a fraud response for FWA-related queries', async () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('Any fraud alerts?');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    }, { timeout: 5000 });

    const assistantMsg = result.current.messages[2]!;
    expect(assistantMsg.content).toContain('FWA alerts');
    expect(assistantMsg.content).toContain('Critical');
  });

  it('does not send empty messages', () => {
    const { result } = renderHook(() => useFatimaChat());

    act(() => {
      result.current.send('   ');
    });

    expect(result.current.messages).toHaveLength(1); // only welcome
    expect(result.current.isStreaming).toBe(false);
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
});
