/**
 * HealthBridge event emitter (Native Phase, Apr 2026).
 *
 * Tiny pub-sub bus that the HealthBridge native plugin will push samples
 * into when running inside the Capacitor wrapper. The web layer subscribes
 * here so that:
 *
 *   1. `useLiveDailyActivity` can react instantly to incoming sensor
 *      data while the app is foregrounded (rings animate without
 *      waiting for Firestore round-trip).
 *   2. `OutboxFlusher` can be notified to flush the IndexedDB outbox
 *      after fresh samples land.
 *
 * Phase 4 will replace the `pushSample()` callers with the actual
 * native bridge. Until then, the bus is silent on web — the only
 * data path is Firestore `onSnapshot` of `dailyActivity`.
 *
 * Keep this module dependency-free. It must be safely importable from
 * pure-web bundles (Vercel) where Capacitor APIs do not exist.
 */

export type LiveSampleType = 'steps' | 'activeEnergy' | 'exerciseTime';

export interface LiveSampleEvent {
  type: LiveSampleType;
  /** Numeric value: count for steps, kcal for activeEnergy, minutes for exerciseTime. */
  value: number;
  /** Local date the sample applies to (YYYY-MM-DD). */
  date: string;
  /** ISO timestamp (start of the sample window). */
  startDate: string;
  /** ISO timestamp (end of the sample window). */
  endDate: string;
}

type Listener = (event: LiveSampleEvent) => void;

const listeners = new Set<Listener>();

export function onLiveSample(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Phase 4: the native HealthBridge plugin (or a manual debug tool)
 * calls this when fresh samples arrive. Listeners receive a fan-out
 * synchronously; throwing listeners do not break the broadcast.
 */
export function pushSample(event: LiveSampleEvent): void {
  for (const l of listeners) {
    try {
      l(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[healthBridge] listener threw:', err);
    }
  }
}
