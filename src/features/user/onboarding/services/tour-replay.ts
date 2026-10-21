/**
 * Tour replay (Kelly round 4, flag ai_coach_round4) — "תראה לי איך משתמשים": replay ANY of the
 * app's coach-mark tours on demand, from the help hub, the search Help tab or a Kelly chip, for
 * ANY user (the first-run rule "new users, once" doesn't apply to a replay).
 *
 * Two kinds of replay (TOUR_REPLAY_MODE):
 *   'screen'  — the tour's own screen opens and TourReplayHost runs the tour over the real
 *               elements (home, plan, map, community).
 *   'preview' — the tour lives inside a running flow (a workout, a route, a station) that a
 *               replay must never start. The help preview page (/help/tour) shows the same
 *               steps over a static illustration of that screen. Nothing starts, nothing is
 *               written.
 *
 * The request rides in sessionStorage for the one navigation to that screen, where it is read
 * once. No request = nothing happens (flag off never writes one). The first-run seen flags
 * are never touched.
 */
import type { FirstRunTourId } from './first-run-tour';

/** Every replayable tour: the first-run tours + the guided station tutorial. */
export const REPLAYABLE_TOURS = ['home', 'plan', 'map', 'route', 'route-player', 'player', 'station', 'community'] as const;
export type ReplayableTour = (typeof REPLAYABLE_TOURS)[number];

// Compile-time: every first-run tour is replayable.
type _AllFirstRun = FirstRunTourId extends ReplayableTour ? true : never;
const _allFirstRun: _AllFirstRun = true;
void _allFirstRun;

export type TourReplayMode = 'screen' | 'preview';

export const TOUR_REPLAY_MODE: Record<ReplayableTour, TourReplayMode> = {
  home: 'screen',
  plan: 'screen',
  map: 'screen',
  community: 'screen',
  route: 'preview',
  'route-player': 'preview',
  player: 'preview',
  station: 'preview',
};

/** The help preview page — shows a 'preview' tour over a static illustration. */
export const TOUR_PREVIEW_PATH = '/help/tour';

export const TOUR_SCREEN: Record<ReplayableTour, string> = {
  home: '/home',
  plan: '/home',
  map: '/map',
  community: '/community?tab=leagues',
  route: TOUR_PREVIEW_PATH,
  'route-player': TOUR_PREVIEW_PATH,
  player: TOUR_PREVIEW_PATH,
  station: TOUR_PREVIEW_PATH,
};

export function isReplayableTour(v: unknown): v is ReplayableTour {
  return typeof v === 'string' && (REPLAYABLE_TOURS as readonly string[]).includes(v);
}

export const TOUR_REPLAY_KEY = 'first_run_tour_replay';
const TTL_MS = 2 * 60_000;

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

/** The pending request, if fresh (stale / broken ones are cleared). Does not consume. */
export function peekTourReplay(kv: KV | null = store(), now = Date.now()): { tour: ReplayableTour; step: number } | null {
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
    if (!fresh || !isReplayableTour(r.tour)) {
      kv.removeItem(TOUR_REPLAY_KEY);
      return null;
    }
    return { tour: r.tour, step: typeof r.step === 'number' && r.step >= 0 ? Math.floor(r.step) : 0 };
  } catch {
    kv.removeItem(TOUR_REPLAY_KEY);
    return null;
  }
}

/** Read-once: the pending replay for `tour` (cleared when it matches or is stale). */
export function consumeTourReplay(tour: ReplayableTour, kv: KV | null = store(), now = Date.now()): { step: number } | null {
  const r = peekTourReplay(kv, now);
  if (!r || r.tour !== tour) return null;
  try {
    kv?.removeItem(TOUR_REPLAY_KEY);
  } catch {
    /* read-once best effort */
  }
  return { step: r.step };
}

/** Read-once: the pending replay if it is a 'preview' tour (the help preview page). */
export function consumePreviewReplay(kv: KV | null = store(), now = Date.now()): { tour: ReplayableTour; step: number } | null {
  const r = peekTourReplay(kv, now);
  if (!r || TOUR_REPLAY_MODE[r.tour] !== 'preview') return null;
  try {
    kv?.removeItem(TOUR_REPLAY_KEY);
  } catch {
    /* read-once best effort */
  }
  return r;
}
