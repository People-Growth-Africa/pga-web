import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getRegistrationCutoff, isRegistrationOpen } from '../lib/event-registration';
import { RegistrationAvailabilityContext, type RegistrationStatus } from './registrationAvailability';
type EventAvailability = { status: Exclude<RegistrationStatus, 'checking' | 'unavailable'> };
type AvailabilityState = {
  status: 'checking' | 'ready' | 'unavailable';
  events: Record<string, EventAvailability>;
};
type AvailabilityResponse = {
  serverNow: string;
  events: Array<{ slug: string; eventStart: string | null; open: boolean }>;
};

export function RegistrationAvailabilityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AvailabilityState>({
    status: 'checking',
    events: {},
  });
  const timers = useRef<number[]>([]);
  const refresh = useCallback(async function refreshAvailability() {
    const requestStarted = performance.now();
    try {
      const response = await fetch('/api/registration-availability', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Availability request failed: ${response.status}`);
      const payload = (await response.json()) as AvailabilityResponse;
      const serverTime = Date.parse(payload.serverNow);
      if (
        typeof payload.serverNow !== 'string' ||
        !Number.isFinite(serverTime) ||
        !Array.isArray(payload.events) ||
        payload.events.some(
          (event) =>
            typeof event.slug !== 'string' ||
            typeof event.open !== 'boolean' ||
            !(event.eventStart === null || typeof event.eventStart === 'string'),
        )
      ) {
        throw new Error('Availability response was invalid.');
      }

      const elapsed = performance.now() - requestStarted;
      const nextEvents: Record<string, EventAvailability> = {};
      const nextTimers: number[] = [];

      for (const event of payload.events) {
        const cutoff = getRegistrationCutoff({ eventStart: event.eventStart });
        const open =
          event.open && isRegistrationOpen({ eventStart: event.eventStart }, serverTime);
        const remaining = cutoff === null ? 0 : cutoff - serverTime - elapsed;
        const isStillOpen = open && remaining > 0;
        nextEvents[event.slug] = { status: isStillOpen ? 'open' : 'closed' };

        if (isStillOpen && cutoff !== null) {
          nextTimers.push(
            window.setTimeout(() => {
              if (remaining > 2_147_000_000) {
                void refreshAvailability();
                return;
              }
              setState((current) => ({
                ...current,
                events: {
                  ...current.events,
                  [event.slug]: { status: 'closed' },
                },
              }));
            }, remaining),
          );
        }
      }

      timers.current.forEach(window.clearTimeout);
      timers.current = nextTimers;
      setState({ status: 'ready', events: nextEvents });
    } catch (error) {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      setState({ status: 'unavailable', events: {} });
      console.error('Unable to verify event registration availability.', error);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      timers.current.forEach(window.clearTimeout);
    };
  }, [refresh]);

  const statusFor = useCallback(
    (slug: string): RegistrationStatus => {
      if (state.status === 'checking') return 'checking';
      if (state.status === 'unavailable') return 'unavailable';
      return state.events[slug]?.status ?? 'unavailable';
    },
    [state],
  );

  return (
    <RegistrationAvailabilityContext.Provider value={{ statusFor, refresh }}>
      {children}
    </RegistrationAvailabilityContext.Provider>
  );
}
