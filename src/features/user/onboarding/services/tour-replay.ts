/**
 * Tour replay (Kelly round 4, flag ai_coach_round4) — "תראה לי איך משתמשים": replay a
 * first-run coach-mark tour on demand, from Settings → "איך משתמשים ושאלות נפוצות" or from a
 * Kelly chip, for ANY user (the first-run rule "new users, once" doesn't apply to a replay).
 *
 * The request rides in sessionStorage for the one navigation to the tour's screen (home or
 * map), where TourReplayHost consumes it. No request = nothing happens (flag off never writes
 * one). The first-run seen flag is never touched.
 */
import type { FirstRunTourId } from './first-run-tour';

export type ReplayableTour = Extract<FirstRunTourId, 'home' | 'map'>;
export const TOUR_REPLAY_KEY = 'first_run_tour_replay';
const TTL_MS = 2 * 60_000;

export const TOUR_SCREEN: Record<ReplayableTour, string> = { home: '/home', map: '/map' };

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function store(): KV | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function requestTourReplay(tour: ReplayableTour, step = 0, kv: KV | null = store(), now = Date.now()): string {
  try {
    kv?.setItem(TOUR_REPLAY_KEY, JSON.stringify({ tour, step: Math.max(0, Math.floor(step)), at: now }));
  } catch {
    /* the screen just opens without the tour */
  }
  return TOUR_SCREEN[tour];
}

/** Read-once: the pending replay for `tour` (cleared when it matches or is stale). */
export function consumeTourReplay(tour: ReplayableTour, kv: KV | null = store(), now = Date.now()): { step: number } | null {
  if (!kv) return null;
  let raw: string | null = null;
  try {
    raw = kv.getItem(TOUR_REPLAY_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as { tour?: unknown; step?: unknown; at?: unknown };
    const fresh = typeof r.at === 'number' && now - r.at <= TTL_MS && r.at <= now + 60_000;
    if (!fresh) {
      kv.removeItem(TOUR_REPLAY_KEY);
      return null;
    }
    if (r.tour !== tour) return null;
    kv.removeItem(TOUR_REPLAY_KEY);
    return { step: typeof r.step === 'number' && r.step >= 0 ? r.step : 0 };
  } catch {
    kv.removeItem(TOUR_REPLAY_KEY);
    return null;
  }
}
