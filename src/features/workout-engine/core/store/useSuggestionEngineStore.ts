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

/**
 * Stable key built from only the fields that matter for re-ranking — not a hash of the
 * whole UserContext (many fields, e.g. a fresh `activitySignal` object each read, would
 * never be equal across calls and defeat deduping for no reason).
 */
export function buildContextKey(context: UserContext): string {
  return JSON.stringify({
    userId: context.userId,
    lat: context.location?.lat ?? null,
    lng: context.location?.lng ?? null,
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

    runSuggestionEngine(context)
      .then((suggestions) => {
        // A newer setContext() call superseded this one while it was running — drop silently.
        if (get().contextKey !== key) return;
        set({ status: 'ready', suggestions });
      })
      .catch((err) => {
        if (get().contextKey !== key) return;
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
  },
}));
