import { useCallback, useRef, useState } from 'react';
import type { FatimaMessage } from './types';

const WELCOME_MESSAGE: FatimaMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Hello! I'm **Fatima**, your insurance operations assistant. I can help you with:

- **Claims** — Look up claim status, find claims by patient or provider, explain adjudication decisions
- **Policies** — Search policies, check coverage details, review endorsements
- **Underwriting** — Assess risk scores, check application status
- **FWA** — Review fraud alerts, investigate suspicious patterns
- **Providers** — Find providers, check contract status
- **Analytics** — Loss ratios, claims trends, KPI summaries

How can I help you today?`,
  timestamp: Date.now(),
};

/**
 * Simulates streaming response from Fatima agent.
 * In production this will connect to the real agent SSE endpoint.
 */
function simulateStream(
  userMessage: string,
  onDelta: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal
): void {
  const responses = {
    claim: `I found several claims matching your query. Here's a summary:

| Claim ID | Patient | Status | Amount |
|----------|---------|--------|--------|
| CLM-2024-001 | Somchai K. | Under Review | ฿45,200 |
| CLM-2024-002 | Waraporn S. | AI Processing | ฿128,500 |
| CLM-2024-003 | Natthawut P. | Approved | ฿23,100 |

Would you like me to drill into any of these? I can show the full assessment, document compliance status, or the AI adjudication reasoning.`,

    policy: `Here are the policy details:

**Policy:** POL-2024-TH-00847
**Insured:** Siam Group Holdings
**Product:** Group Health — Gold Plan
**Effective:** 01 Jan 2024 — 31 Dec 2024
**Premium:** ฿2,450,000 / year
**Status:** Active

**Coverage Summary:**
- IPD: ฿500,000 per event
- OPD: ฿3,000 per visit (30 visits/year)
- Dental: ฿5,000 per year
- Maternity: ฿80,000 per pregnancy

The policy has 347 active members with 12 pending endorsements. Want me to check the endorsements or review benefit utilization?`,

    fraud: `I detected **3 active FWA alerts** that need attention:

1. **Critical** — Duplicate billing pattern from Provider #PR-4421 (Bangkok Hospital). 7 claims with identical procedure codes in the last 48 hours. Confidence: 94%.

2. **High** — Unusual prescription volume for patient ID INS-88203. 4x standard deviation above average. Possible pharmacy shopping pattern.

3. **Medium** — Pre-authorization bypass on 2 surgical claims from a newly contracted provider.

I recommend prioritizing Alert #1. Shall I pull the full investigation report?`,

    help: `Here's what I can do for you:

**Navigation** — Just tell me where you want to go. "Open claims review", "Show me the dashboard", etc.

**Lookups** — Ask about any entity:
- "Find claim CLM-2024-001"
- "Show policy for Siam Group"
- "What's the status of application UW-2024-055?"

**Analysis** — I can summarize and analyze:
- "What's our loss ratio this month?"
- "Show claims trend for Q4"
- "Compare provider performance in BKK region"

**Actions** — I can help you start workflows:
- "Create a new claim"
- "Flag this claim for investigation"
- "Schedule a report"

Just ask naturally — I understand insurance operations!`,
  };

  let responseText: string;
  const lowerMsg = userMessage.toLowerCase();

  if (lowerMsg.includes('claim')) {
    responseText = responses.claim;
  } else if (lowerMsg.includes('policy') || lowerMsg.includes('policies') || lowerMsg.includes('coverage')) {
    responseText = responses.policy;
  } else if (lowerMsg.includes('fraud') || lowerMsg.includes('fwa') || lowerMsg.includes('alert') || lowerMsg.includes('suspicious')) {
    responseText = responses.fraud;
  } else if (lowerMsg.includes('help') || lowerMsg.includes('what can you') || lowerMsg.includes('how')) {
    responseText = responses.help;
  } else {
    responseText = `I understand you're asking about "${userMessage}". Let me look into that for you.

Based on what I can see in the system, this is something I'd need to investigate further. In a production environment, I would:

1. Query the relevant databases through the Hasura GraphQL layer
2. Cross-reference with any existing records
3. Apply our business rules and compliance checks

For now, try asking about **claims**, **policies**, **fraud alerts**, or say **"help"** to see everything I can do!`;
  }

  // Simulate character-by-character streaming
  let index = 0;
  const chunkSize = 3;
  const interval = setInterval(() => {
    if (signal.aborted) {
      clearInterval(interval);
      return;
    }
    if (index < responseText.length) {
      const end = Math.min(index + chunkSize, responseText.length);
      onDelta(responseText.slice(index, end));
      index = end;
    } else {
      clearInterval(interval);
      onDone();
    }
  }, 8);
}

export default function useFatimaChat() {
  const [messages, setMessages] = useState<FatimaMessage[]>([WELCOME_MESSAGE]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return;

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

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    simulateStream(
      text.trim(),
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
  }, [isStreaming]);

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
