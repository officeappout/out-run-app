'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchRealParks } from '@/features/parks/core/services/parks.service';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { Park } from '@/features/parks/core/types/park.types';
import { hasUsableEquipment, isPrimaryFitness } from '@/features/workout-engine/hybrid/park-fitness.util';
import {
  buildContinuationOptions,
  continuationHref,
  pickNearestPark,
  type ContinuationKind,
  type ContinuationOption,
  type NearestPark,
} from '../blocks/finish-continue.util';

export interface FinishContinuationData {
  options: ContinuationOption[];
  nearest: NearestPark<Park> | null;
}

/**
 * G7.1 — continuation suggestions for the post-workout summary, from data the
 * map already has: the shared GPS fix (useGPSStore — no new watcher) and the
 * cached park catalog (fetchRealParks — IndexedDB SWR, the same catalog the
 * map renders). No new collections, no composer. Returns null when disabled
 * (flag OFF), so callers pass nothing and the summary renders exactly as today.
 */
export function useFinishContinuation(enabled: boolean): FinishContinuationData | null {
  const coords = useGPSStore((s) => s.coords);
  const [parks, setParks] = useState<Park[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchRealParks()
      // Only a real strength park (same "dedicated fitness + usable equipment"
      // test the hybrid station finder uses) — the catalog also holds toilets,
      // fountains, dog parks, etc.
      .then((all) => {
        if (!cancelled) setParks(all.filter((p) => isPrimaryFitness(p) && hasUsableEquipment(p)));
      })
      .catch(() => { /* no park suggestion — the other two still show */ });
    return () => { cancelled = true; };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return null;
    const nearest = pickNearestPark(parks, coords);
    return { options: buildContinuationOptions(nearest), nearest };
  }, [enabled, parks, coords]);
}

/**
 * Lands a continuation AFTER the caller's normal finish teardown has run.
 * park_strength reuses ParkDetailSheet's existing hand-off (pendingParkWorkoutStart
 * → /home composes the park workout and opens its preview drawer).
 */
export function goToContinuation(
  kind: ContinuationKind,
  nearest: NearestPark<Park> | null,
  push: (href: string) => void,
): void {
  if (kind === 'park_strength') {
    if (nearest) useMapStore.getState().setPendingParkWorkoutStart(nearest.park);
    push('/home');
    return;
  }
  push(continuationHref(kind));
}
