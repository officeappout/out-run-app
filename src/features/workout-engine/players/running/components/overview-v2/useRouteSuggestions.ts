'use client';

/**
 * "הצע לי מסלול" (board M-6i): up to 3 routes from where the runner stands
 * for the run they're about to do — suggestRoutesForWorkout (#491): the
 * cached official routes first, the loop generator only as a top-up, with
 * the user's city so the generator can use street segments. One search per
 * `request()`; a stale answer (position / workout changed) is dropped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUserCityName } from '@/features/parks/core/hooks/useUserCityName';
import { buildWorkoutRouteNeeds, suggestRoutesForWorkout, type RouteSuggestion } from '../../lib/route-fit';
import type { RunBlock } from '../../types/run-block.type';
import type { RunPaceContext } from '../../utils/run-preview/run-estimates';

export type SuggestStatus = 'idle' | 'loading' | 'done';

export interface RouteSuggestionsState {
  status: SuggestStatus;
  suggestions: RouteSuggestion[];
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
  const token = useRef(0);
  useEffect(() => () => { token.current += 1; }, []);

  const request = useCallback(() => {
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
      });
  }, [workout, templateCategory, ctx, origin, cityName]);

  const reset = useCallback(() => {
    token.current += 1;
    setSuggestions([]);
    setStatus('idle');
  }, []);

  return { status, suggestions, request, reset };
}
