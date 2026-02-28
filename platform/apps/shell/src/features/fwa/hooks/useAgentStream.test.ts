import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useAgentStream from './useAgentStream';
import type { SSEEvent } from '../types';

/**
 * Create a mock SSE Response from agent events.
 */
function mockAgentSSEResponse(events: SSEEvent[]): Response {
  const chunks = events.map(
    (e) => `data: ${JSON.stringify(e)}\n\n`,
  );
  chunks.push('data: [DONE]\n\n');

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
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
});

describe('useAgentStream', () => {
  it('starts with idle status and empty messages', () => {
    const { result } = renderHook(() => useAgentStream());

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.pendingApprovals).toHaveLength(0);
  });

  it('processes text_delta events into assistant messages', async () => {
    const { result } = renderHook(() => useAgentStream());

    const response = mockAgentSSEResponse([
      { type: 'agent_start' },
      { type: 'text_delta', delta: 'Hello ' },
      { type: 'text_delta', delta: 'world' },
      { type: 'message_end', text: 'Hello world' },
      { type: 'agent_end' },
    ]);

    act(() => {
      result.current.startStream(response);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    }, { timeout: 5000 });

    expect(result.current.messages).toHaveLength(1);
    const msg = result.current.messages[0]!;
    expect(msg.role).toBe('assistant');
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.type).toBe('text');
    expect((msg.parts[0] as { type: 'text'; content: string }).content).toBe('Hello world');
  });

  it('processes thinking_delta events into reasoning parts', async () => {
    const { result } = renderHook(() => useAgentStream());

    const response = mockAgentSSEResponse([
      { type: 'agent_start' },
      { type: 'thinking_delta', delta: 'Let me think...' },
      { type: 'thinking_delta', delta: ' about this.' },
      { type: 'text_delta', delta: 'Here is my answer.' },
      { type: 'message_end', text: 'Here is my answer.' },
      { type: 'agent_end' },
    ]);

    act(() => {
      result.current.startStream(response);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    }, { timeout: 5000 });

    expect(result.current.messages).toHaveLength(1);
    const msg = result.current.messages[0]!;
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0]!.type).toBe('reasoning');
    expect((msg.parts[0] as { type: 'reasoning'; content: string }).content).toBe(
      'Let me think... about this.',
    );
    expect(msg.parts[1]!.type).toBe('text');
  });

  it('processes tool lifecycle events', async () => {
    const { result } = renderHook(() => useAgentStream());

    const response = mockAgentSSEResponse([
      { type: 'agent_start' },
      {
        type: 'tool_start',
        toolCallId: 'tc-1',
        toolName: 'claim',
        args: { claimCode: 'CLM001' },
      },
      {
        type: 'tool_end',
        toolCallId: 'tc-1',
        toolName: 'claim',
        result: { status: 'found' },
        isError: false,
      },
      { type: 'text_delta', delta: 'Claim found.' },
      { type: 'message_end', text: 'Claim found.' },
      { type: 'agent_end' },
    ]);

    act(() => {
      result.current.startStream(response);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    }, { timeout: 5000 });

    const msg = result.current.messages[0]!;
    expect(msg.parts).toHaveLength(2);

    const toolPart = msg.parts[0]!;
    expect(toolPart.type).toBe('tool');
    if (toolPart.type === 'tool') {
      expect(toolPart.toolName).toBe('claim');
      expect(toolPart.status).toBe('completed');
      expect(toolPart.isError).toBe(false);
    }
  });

  it('processes approval_request events and tracks pending approvals', async () => {
    const { result } = renderHook(() => useAgentStream());

    const response = mockAgentSSEResponse([
      { type: 'agent_start' },
      { type: 'text_delta', delta: 'I need approval.' },
      {
        type: 'approval_request',
        toolCallId: 'tc-2',
        toolName: 'assessBenefit',
        params: { amount: 500000 },
      },
      { type: 'agent_end' },
    ]);

    act(() => {
      result.current.startStream(response);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
    }, { timeout: 5000 });

    expect(result.current.pendingApprovals).toHaveLength(1);
    expect(result.current.pendingApprovals[0]!.toolCallId).toBe('tc-2');
    expect(result.current.pendingApprovals[0]!.toolName).toBe('assessBenefit');

    const msg = result.current.messages[0]!;
    const approvalPart = msg.parts.find((p) => p.type === 'approval');
    expect(approvalPart).toBeDefined();
    if (approvalPart && approvalPart.type === 'approval') {
      expect(approvalPart.status).toBe('pending');
    }
  });

  it('respondToApproval updates approval status and removes from pending', async () => {
    const { result } = renderHook(() => useAgentStream());

    const response = mockAgentSSEResponse([
      { type: 'agent_start' },
      {
        type: 'approval_request',
        toolCallId: 'tc-3',
        toolName: 'approve',
        params: {},
      },
      { type: 'agent_end' },
    ]);

    act(() => {
      result.current.startStream(response);
    });

    await waitFor(() => {
      expect(result.current.pendingApprovals).toHaveLength(1);
    }, { timeout: 5000 });

    act(() => {
      result.current.respondToApproval('tc-3', true);
    });

    expect(result.current.pendingApprovals).toHaveLength(0);
    const msg = result.current.messages[0]!;
    const approvalPart = msg.parts.find((p) => p.type === 'approval');
    if (approvalPart && approvalPart.type === 'approval') {
      expect(approvalPart.status).toBe('approved');
    }
  });

  it('addUserMessage appends a user message', () => {
    const { result } = renderHook(() => useAgentStream());

    act(() => {
      result.current.addUserMessage('Assess claim CLM001');
    });

    expect(result.current.messages).toHaveLength(1);
    const msg = result.current.messages[0]!;
    expect(msg.role).toBe('user');
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]!.type).toBe('text');
    expect((msg.parts[0] as { type: 'text'; content: string }).content).toBe(
      'Assess claim CLM001',
    );
  });

  it('handles error events', async () => {
    const { result } = renderHook(() => useAgentStream());

    const response = mockAgentSSEResponse([
      { type: 'agent_start' },
      { type: 'error', message: 'Agent crashed' },
    ]);

    act(() => {
      result.current.startStream(response);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    }, { timeout: 5000 });

    expect(result.current.error).toBe('Agent crashed');
  });

  it('reset clears all state', async () => {
    const { result } = renderHook(() => useAgentStream());

    act(() => {
      result.current.addUserMessage('test');
    });

    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.pendingApprovals).toHaveLength(0);
  });
});
