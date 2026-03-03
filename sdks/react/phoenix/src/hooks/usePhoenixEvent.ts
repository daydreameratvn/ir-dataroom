import { useEffect } from 'react';
import { usePhoenix } from '../provider';
import type { PhoenixEventType, PhoenixEventMap } from '../events';

export function usePhoenixEvent<E extends PhoenixEventType>(
  event: E,
  listener: (payload: PhoenixEventMap[E]) => void,
): void {
  const { events } = usePhoenix();

  useEffect(() => {
    return events.on(event, listener);
  }, [events, event, listener]);
}
