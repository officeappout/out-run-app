/**
 * useSuggestionEngineStore — the shared, cross-surface home for the PULL engine's async
 * lifecycle (plan §11.5 gap 1/2 closure, `.claude/plans/happy-jumping-flask.md` §"סבב 9").
 *
 * Deliberately surface-agnostic: this store knows nothing about HybridSlot, the home trio,
 * or any other surface-native shape — it only produces a ranked `Suggestion[]`. Each surface
 * owns its own small adapter (e.g. `pick-map-suggestion.ts`) and its own explicit "apply"
 * function (e.g. `apply-ranked-slot-order.ts`) that a screen calls itself — this store is
 * never the thing that silently changes what a screen renders.
 *
 * Modeled on two existing precedents in this exact domain, not invented:
 * - Coalescing: `_inflightParksFetch` (parks.service.ts:216-227) — N callers with an
 *   equivalent request share one in-flight run instead of firing duplicates.
 * - Stale-response guarding: `flowId`/`hybridFlowIdRef` in `composeAndShowOverview`
 *   (DiscoverLayer.tsx:601-633) — "dismissed / superseded while composing → drop this
 *   result silently." Here: a response only gets written if `contextKey` still matches what
 *   was in flight when it resolves.
 *
 * Not persisted (no `zustand/middleware persist`) — ranked suggestions are a live,
 * short-lived recomputation, not something that should show stale on next app launch.
 *
 * Single global slot (one context/result at a time) — the known, deliberate scaling limit:
 * fine for a mobile app with one active surface at a time; a keyed multi-entry cache (same
 * shape as `fetchRealParks`'s pattern) is the natural upgrade IF simultaneous multi-surface
 * consumption ever becomes a real need. Not built now.
 */

import { create } from 'zustand';
import type { UserContext } from '../types/user-context.types';
import type { Suggestion } from '../types/suggestion.types';
import { runSuggestionEngine } from '../engine/suggestion-engine';

export type SuggestionEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SuggestionEngineState {
  contextKey: string | null;
  status: SuggestionEngineStatus;
  suggestions: Suggestion[] | null;
  error: string | null;
  setContext: (context: UserContext) => void;
}

// Coordinate precision for the dedup key (11.08.2026 fix): 3 decimal places ≈ 110m.
// Raw GPS lat/lng were compared exactly, so ordinary GPS jitter (a few metres, even
// standing still) produced a "new" contextKey on nearly every fix, defeating the dedup
// guard below and re-running the full 5-generator suggestion pipeline (confirmed ~9s,
// thousands of console.log lines from the workout-engine scoring pass) continuously
// while the map was open — worse while navigating, since GPS updates more often then.
// Rounding means "meaningfully moved" (~a block) re-ranks; jitter and in-place idling
// don't. Not a distance/time throttle — kept simple; revisit if 110m proves too coarse
// or too fine once measured on-device.
const CONTEXT_KEY_COORD_PRECISION = 3;

function roundCoord(n: number): number {
  const factor = 10 ** CONTEXT_KEY_COORD_PRECISION;
  return Math.round(n * factor) / factor;
}

/**
 * Stable key built from only the fields that matter for re-ranking — not a hash of the
 * whole UserContext (many fields, e.g. a fresh `activitySignal` object each read, would
 * never be equal across calls and defeat deduping for no reason).
 */
export function buildContextKey(context: UserContext): string {
  return JSON.stringify({
    userId: context.userId,
    lat: context.location ? roundCoord(context.location.lat) : null,
    lng: context.location ? roundCoord(context.location.lng) : null,
    todayGoal: context.todayGoal,
    availableTimeMin: context.availableTimeMin,
    surface: context.surface,
  });
}

export const useSuggestionEngineStore = create<SuggestionEngineState>((set, get) => ({
  contextKey: null,
  status: 'idle',
  suggestions: null,
  error: null,

  setContext: (context) => {
    const key = buildContextKey(context);
    const current = get();
    // Already have (or are already fetching) this exact context — no-op.
    if (current.contextKey === key && (current.status === 'loading' || current.status === 'ready')) {
      return;
    }

    set({ contextKey: key, status: 'loading', error: null });

    // Real-latency instrumentation (08.08.2026): no measured number existed for how long
    // runSuggestionEngine actually takes on a device — this makes it visible in the console
    // instead of guessing. Cheap, safe, always-on (not flag-gated) — logging isn't a
    // behavior change worth a kill-switch.
    const startedAt = performance.now();

    runSuggestionEngine(context)
      .then((suggestions) => {
        console.log(`[useSuggestionEngineStore] runSuggestionEngine took ${Math.round(performance.now() - startedAt)}ms (${suggestions.length} candidates)`);
        // A newer setContext() call superseded this one while it was running — drop silently.
        if (get().contextKey !== key) return;
        set({ status: 'ready', suggestions });
      })
      .catch((err) => {
        console.log(`[useSuggestionEngineStore] runSuggestionEngine FAILED after ${Math.round(performance.now() - startedAt)}ms`);
        if (get().contextKey !== key) return;
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
  },
}));
