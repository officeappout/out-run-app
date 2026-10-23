'use client';

/**
 * "הצע לי מסלול" (board M-6i): up to 3 routes from where the runner stands
 * for the run they're about to do — suggestRoutesForWorkout (#491): the
 * cached official routes first, the loop generator only as a top-up, with
 * the user's city so the generator can use street segments. One search per
 * `request()`; a stale answer (position / workout changed) is dropped.
 *
 * enable_hill_finder_v1: when today's run is a hill workout and none of the
 * suggestions has a climb that meets the rep spec, `hill` gets the nearest
 * suitable hill (route-fit/find-hills-for-run.ts). Flag off → `hill` stays
 * null and nothing extra is read.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserCityName } from '@/features/parks/core/hooks/useUserCityName';
import { useHillFinderV1 } from '@/hooks/useHillFinderV1';
import { buildWorkoutRouteNeeds, suggestRoutesForWorkout, type HillCandidate, type RouteSuggestion } from '../../lib/route-fit';
import type { RunBlock } from '../../types/run-block.type';
import type { RunPaceContext } from '../../utils/run-preview/run-estimates';

export type SuggestStatus = 'idle' | 'loading' | 'done';

export interface RouteSuggestionsState {
  status: SuggestStatus;
  suggestions: RouteSuggestion[];
  /** enable_hill_finder_v1: the nearest suitable hill when no suggestion has a climb that meets the spec. */
  hill: HillCandidate | null;
  request: () => void;
  reset: () => void;
}

export function useRouteSuggestions(
  workout: { blocks: readonly RunBlock[]; category?: string | null } | null,
  templateCategory: string | null | undefined,
  ctx: RunPaceContext,
  origin: { lat: number; lng: number } | null,
): RouteSuggestionsState {
  const cityName = useUserCityName(origin);
  const [status, setStatus] = useState<SuggestStatus>('idle');
  const [suggestions, setSuggestions] = useState<RouteSuggestion[]>([]);
  const [hill, setHill] = useState<HillCandidate | null>(null);
  const hillFinderOn = useHillFinderV1();
  const token = useRef(0);
  useEffect(() => () => { token.current += 1; }, []);

  const request = useCallback(() => {
    setHill(null);
    if (!workout || !origin) {
      setSuggestions([]);
      setStatus('done');
      return;
    }
    const my = ++token.current;
    setStatus('loading');
    const needs = buildWorkoutRouteNeeds(
      { blocks: workout.blocks, category: workout.category, templateCategory },
      ctx,
      { startAt: new Date(), origin },
    );
    suggestRoutesForWorkout(origin, needs, { cityName })
      .catch(() => [] as RouteSuggestion[])
      .then((out) => {
        if (my !== token.current) return;
        setSuggestions(out);
        setStatus('done');
        const spec = needs.hill;
        if (!hillFinderOn || !spec || out.some((s) => s.score.climb?.meetsSpec)) return;
        import('../../lib/route-fit/find-hills-for-run')
          .then(({ findHillsForRun }) => findHillsForRun(origin, spec, { limit: 1 }))
          .catch(() => [] as HillCandidate[])
          .then((hills) => {
            if (my === token.current) setHill(hills[0] ?? null);
          });
      });
  }, [workout, templateCategory, ctx, origin, cityName, hillFinderOn]);

  const reset = useCallback(() => {
    token.current += 1;
    setSuggestions([]);
    setHill(null);
    setStatus('idle');
  }, []);

  return { status, suggestions, hill, request, reset };
}
