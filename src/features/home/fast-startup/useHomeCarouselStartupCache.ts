'use client';
/**
 * Instant home carousel (enable_fast_startup_v1).
 *
 * On a cold open of TODAY, the pre-workout carousel used to show a skeleton until the whole
 * suggestion engine settled (recovery-follow-up awaits a full generateHomeWorkoutTrio). With
 * the flag on:
 *   1. today's last carousel (same uid + same local date, IndexedDB) paints immediately —
 *      suggestions + the hero workouts their cards rendered (provisional, see
 *      provisionalHeroWorkouts.ts);
 *   2. home/page.tsx's own engine run is untouched and replaces it in place when it lands
 *      (stable `-cheap-${uid}` ids → same cards, no remount/jump), and each fresh Tier-2
 *      build replaces its provisional hero workout;
 *   3. every fresh result (and each Tier-2 resolve) is written back for the next open —
 *      except once today's workout is done (saveWorkout clears the record anyway).
 * Flag off → the hook does nothing.
 */
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { homeCarouselCache, localDateKey } from '@/lib/fast-startup/daily-record-cache';
import { startupMark } from '@/lib/fast-startup/perf';
import {
  HOME_CAROUSEL_CTX_KEY,
  buildHomeCarouselSnapshot,
  isHomeCarouselSnapshot,
} from './carouselRecord';
import { seedProvisionalHeroWorkouts } from './provisionalHeroWorkouts';

interface Params {
  enabled: boolean;
  uid: string | undefined;
  /** The day home is showing (YYYY-MM-DD). Only today is ever cached/restored. */
  selectedDate: string;
  suggestions: Suggestion[] | null;
  setSuggestions: Dispatch<SetStateAction<Suggestion[] | null>>;
  /** Bumped by home after each Tier-2 resolve — triggers a write-back with the new workout. */
  tier2Tick: number;
  /** True once today's workout is done — never persist then. */
  skipWrite: boolean;
  /** The generators' REAL hero-workout caches (not the provisional ones). */
  realHeroLookup: (s: Suggestion) => GeneratedWorkout | null | undefined;
}

export function useHomeCarouselStartupCache(p: Params): void {
  const { enabled, uid, selectedDate, suggestions, setSuggestions, tier2Tick, skipWrite } = p;
  const restoredRef = useRef<Suggestion[] | null>(null);
  const lookupRef = useRef(p.realHeroLookup);
  lookupRef.current = p.realHeroLookup;

  const isToday = selectedDate === localDateKey();

  // 1 — restore (once per uid/day), only while the live result hasn't landed yet.
  useEffect(() => {
    if (!enabled || !uid || !isToday) return;
    let cancelled = false;
    const want = { uid, date: selectedDate, ctxKey: HOME_CAROUSEL_CTX_KEY };
    const apply = (v: unknown) => {
      if (cancelled || !isHomeCarouselSnapshot(v)) return;
      setSuggestions((prev) => {
        if (prev !== null) return prev; // the live engine already answered — keep it
        seedProvisionalHeroWorkouts(v.heroWorkouts);
        restoredRef.current = v.suggestions;
        startupMark('trio-cached-shown');
        return v.suggestions;
      });
    };
    const hit = homeCarouselCache.peek(want);
    if (hit) apply(hit);
    else void homeCarouselCache.read(want).then(apply);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, selectedDate, isToday]);

  // 3 — write back every fresh result (never the restored copy itself).
  useEffect(() => {
    if (!enabled || !uid || !isToday || skipWrite) return;
    if (!suggestions || suggestions.length === 0) return;
    if (suggestions === restoredRef.current) return;
    startupMark('trio-ready');
    homeCarouselCache.write({
      uid,
      date: selectedDate,
      ctxKey: HOME_CAROUSEL_CTX_KEY,
      value: buildHomeCarouselSnapshot(suggestions, (s) => lookupRef.current(s)),
    });
  }, [enabled, uid, isToday, selectedDate, suggestions, tier2Tick, skipWrite]);
}
