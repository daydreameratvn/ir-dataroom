// ── Event Types ──

export type PhoenixEventType =
  | 'claim:creating'
  | 'claim:created'
  | 'claim:creation_failed'
  | 'claim:cancelled'
  | 'claim:document_uploaded'
  | 'claim:document_upload_failed'
  | 'claim:otp_requested'
  | 'claim:otp_verified'
  | 'claim:otp_failed';

// ── Event Payloads ──

export interface PhoenixEventMap {
  'claim:creating': { claimantName: string; amountClaimed: number };
  'claim:created': { claimId: string; claimNumber: string };
  'claim:creation_failed': { error: string };
  'claim:cancelled': {};
  'claim:document_uploaded': { claimId: string; fileName: string; documentType?: string };
  'claim:document_upload_failed': { claimId: string; fileName: string; error: string };
  'claim:otp_requested': { claimId: string };
  'claim:otp_verified': { claimId: string };
  'claim:otp_failed': { claimId: string; error: string };
}

// ── Event Emitter ──

type Listener<T> = (payload: T) => void;

export class PhoenixEventEmitter {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<E extends PhoenixEventType>(
    event: E,
    listener: Listener<PhoenixEventMap[E]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<unknown>);
    return () => {
      set.delete(listener as Listener<unknown>);
    };
  }

  emit<E extends PhoenixEventType>(event: E, payload: PhoenixEventMap[E]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(payload);
      }
    }
  }
}
