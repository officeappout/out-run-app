'use client';

/**
 * useRouteDeviationOrchestrator
 * ─────────────────────────────
 * Listens for off-route events emitted by `useRunningPlayer` (the GPS layer
 * that detects the deviation) and orchestrates an automatic re-route:
 *
 *   1. Speaks a Hebrew "מחשב מסלול מחדש" announcement so the user has
 *      audible feedback BEFORE the visual swap.
 *   2. Computes how far they have left to cover (`originalTarget − totalCovered`)
 *      and where they need to end up (loop start vs. linear endpoint).
 *   3. If the remaining distance is too small to bother with a generated
 *      loop, draws a direct red line from the user's current position back
 *      to the target endpoint — just enough so the live HUD has SOMETHING
 *      to render against during the last few hundred metres.
 *   4. Otherwise asks `generateDynamicRoutes()` for a fresh route from the
 *      user's current GPS, sized to the remaining distance.
 *   5. Swaps `focusedRoute` (the on-map polyline) and `activeRoutePath`
 *      (the deviation reference) atomically. The setter clears the deviation
 *      counter as a side-effect, so the next sample begins a fresh 3-sample
 *      countdown against the NEW path.
 *
 * Concurrency model:
 *   The hook reacts to `offRouteEventToken` (a monotonically-increasing
 *   counter on `useRunningPlayer`) rather than the boolean `isOffRoute` so
 *   each fresh false→true edge fires exactly one orchestration pass, even
 *   if the boolean briefly toggles back to false during the recalc.
 *   `isRecalculatingRoute` is set on the store for the duration of the
 *   recalc and `checkRouteDeviation` short-circuits while it is true,
 *   preventing any new event from entering the queue mid-flight.
 *
 * Failure mode:
 *   Any error inside the recalc is swallowed (logged). The deviation state
 *   is cleared regardless so the user never gets stuck in a permanent
 *   off-route status with the orchestrator wedged on a stale token.
 */

import { useEffect, useRef } from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import { generateDynamicRoutes } from '../services/route-generator.service';
import { fetchRealParks } from '../services/parks.service';
import { haversineKm, haversineMeters } from '../services/geoUtils';
import { useUserCityName } from './useUserCityName';
import type { Route, ActivityType } from '../types/route.types';
import type { Park } from '../types/park.types';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Below this remaining distance we skip the Mapbox round-trip and draw a
 * straight red line back to the target endpoint. Per spec — short enough that
 * a complex re-routed loop would be wasteful, long enough that the user still
 * benefits from a visible "this way home" guide.
 */
const DIRECT_RETURN_THRESHOLD_KM = 0.5;

/**
 * Distance under which a route is considered a closed loop. The generator's
 * triangular-loop output usually closes within ~10 m of the start vertex; 50 m
 * gives us comfortable headroom for routes whose end was Mapbox-snapped to a
 * nearby road instead of the exact start node.
 */
const LOOP_DETECTION_THRESHOLD_M = 50;

/**
 * Discriminates "official route" (a Firestore `official_routes` doc) from
 * routes synthesised at runtime. The dynamic generator stamps its outputs
 * with `gen-${ts}-...`, our own direct-line fallback uses `deviation_direct_*`
 * — anything else is presumed to be an official_routes doc id, which is the
 * trigger for passing `activeOfficialRouteId` to the next generator call so
 * the broadcast bias takes effect.
 */
function isOfficialRouteId(id: string | undefined): boolean {
  if (!id) return false;
  return !id.startsWith('gen-') && !id.startsWith('deviation_direct_');
}

/**
 * Hebrew copy spoken via Web Speech API when a deviation is detected.
 * Centralised here so a future translation/i18n pass has one place to edit.
 */
const DEVIATION_AUDIO_MESSAGE =
  'סטית מהמסלול, מחשב מסלול מחדש לסיום האימון';

// ── Module-level cache for parks ─────────────────────────────────────────────
// Mirrors the same cache used by useRouteGeneration so we don't re-pull the
// entire `parks` collection from Firestore on every deviation event.
let _parksCache: Park[] | null = null;
async function getCachedParks(): Promise<Park[]> {
  if (!_parksCache) _parksCache = await fetchRealParks();
  return _parksCache;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A route is treated as a loop when its first and last vertices land within
 * `LOOP_DETECTION_THRESHOLD_M` of each other. This drives the
 * "where should I send the user back to?" decision: loops return to start,
 * linear routes continue toward the original end.
 */
function isLoopRoute(route: Route | null): boolean {
  if (!route?.path || route.path.length < 2) return false;
  const [startLng, startLat] = route.path[0];
  const [endLng, endLat] = route.path[route.path.length - 1];
  if (
    typeof startLng !== 'number' || typeof startLat !== 'number' ||
    typeof endLng !== 'number' || typeof endLat !== 'number'
  ) return false;
  return haversineMeters(startLat, startLng, endLat, endLng)
    < LOOP_DETECTION_THRESHOLD_M;
}

/**
 * Builds a synthetic Route consisting of a single straight segment from the
 * user's current position to the target endpoint. The returned object has
 * the minimum fields needed to satisfy `Route` and render on AppMap; it is
 * never persisted, never scored, never read back from Firestore.
 *
 * Distance/duration are computed from the straight-line distance using a
 * sane per-activity speed assumption so the live HUD can show plausible
 * "X more minutes" copy. Calories are deliberately rough (60 kcal/km) — the
 * REAL calorie count comes from the GPS trail in useSessionStore.
 */
function buildDirectReturnRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number },
  activity: ActivityType,
): Route {
  const distKm = haversineKm(start.lat, start.lng, end.lat, end.lng);
  // Activity-specific speeds for the duration estimate. Conservative end of
  // each activity's typical range so the ETA never under-promises.
  const speedKmH =
    activity === 'cycling' ? 18 :
    activity === 'walking' ? 5 :
    9; // running / default
  const durationMin = Math.max(1, Math.round((distKm / speedKmH) * 60));

  return {
    id: `deviation_direct_${Date.now()}`,
    name: 'חזרה ישירה לסיום',
    distance: distKm,
    duration: durationMin,
    score: 0,
    type: activity,
    activityType: activity,
    difficulty: 'easy',
    rating: 0,
    calories: Math.round(distKm * 60),
    features: {
      hasGym: false,
      hasBenches: false,
      lit: false,
      scenic: false,
      terrain: '',
      environment: '',
      trafficLoad: '',
      surface: '',
    },
    segments: [],
    path: [
      [start.lng, start.lat],
      [end.lng, end.lat],
    ],
    // Distinct color so the user (and any debugger) can immediately tell at
    // a glance that this is the fallback direct line, not a generated loop.
    color: '#FF6B6B',
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseRouteDeviationOrchestratorArgs {
  /** Currently focused route on the map; used as the originalTarget anchor. */
  focusedRoute: Route | null;
  /** Map setter: swaps the visible polyline. */
  setFocusedRoute: (r: Route | null) => void;
  /** Live user GPS position (effective — sim-aware). */
  currentUserPos: { lat: number; lng: number } | null;
  /** Skip everything when no workout is in progress. */
  isWorkoutActive: boolean;
}

/**
 * Wires the deviation-detection signal from `useRunningPlayer` into the
 * actual recompute + map-swap action. Mount this once at the orchestrator
 * level (MapShell) — it has no UI of its own.
 */
export function useRouteDeviationOrchestrator({
  focusedRoute,
  setFocusedRoute,
  currentUserPos,
  isWorkoutActive,
}: UseRouteDeviationOrchestratorArgs): void {
  // We only react to NEW deviation events. The token monotonically
  // increments inside `checkRouteDeviation` on every false→true transition.
  const offRouteEventToken = useRunningPlayer((s) => s.offRouteEventToken);
  const activityType = useRunningPlayer((s) => s.activityType);
  const guidedRouteDistanceKm = useRunningPlayer((s) => s.guidedRouteDistanceKm);

  // Pulled fresh inside the effect (not as deps) so we always read the
  // committed value at fire-time rather than capturing a stale closure.
  const focusedRouteRef = useRef(focusedRoute);
  focusedRouteRef.current = focusedRoute;
  const userPosRef = useRef(currentUserPos);
  userPosRef.current = currentUserPos;
  const setFocusedRouteRef = useRef(setFocusedRoute);
  setFocusedRouteRef.current = setFocusedRoute;
  const isWorkoutActiveRef = useRef(isWorkoutActive);
  isWorkoutActiveRef.current = isWorkoutActive;

  // City name resolution shares the same hook the rest of the route flow
  // uses (affiliation → authority → reverse-geocode). Re-uses the persisted
  // affiliation when available so the orchestrator never blocks waiting on
  // Mapbox in the hot path.
  const cityName = useUserCityName(currentUserPos);
  const cityNameRef = useRef(cityName);
  cityNameRef.current = cityName;

  useEffect(() => {
    // Token starts at 0 and increments. The very first render always sees
    // token=0; we don't want to recalc then. The orchestrator only acts on
    // tokens emitted AFTER mount. Guarded by isWorkoutActive too — pretty
    // much sufficient on its own but harmless redundancy.
    if (offRouteEventToken === 0) return;
    if (!isWorkoutActiveRef.current) return;

    const focused = focusedRouteRef.current;
    const pos = userPosRef.current;
    if (!focused?.path || focused.path.length < 2) return;
    if (!pos) return;

    let cancelled = false;
    const player = useRunningPlayer.getState();

    // Bracket the entire recalc — `checkRouteDeviation` shorts on this flag
    // so no new tokens can stack up while we're working.
    player.setRecalculatingRoute(true);

    (async () => {
      // Fire audio FIRST. The user gets ~200ms of "we noticed" feedback
      // before the visual swap, which feels much more responsive than a
      // silent map flicker.
      try {
        audioService.speak(DEVIATION_AUDIO_MESSAGE);
      } catch {
        // Speech failures are non-fatal — proceed with the visual recalc
        // even if TTS is unavailable (iOS Safari before unlock, etc.).
      }

      try {
        // ── Compute target endpoint ────────────────────────────────────
        // For a loop, the "finish" is wherever the user originally started
        // (path[0]). For a linear route it's the original end (path[N-1]).
        const loop = isLoopRoute(focused);
        const endpointCoord = loop
          ? focused.path[0]
          : focused.path[focused.path.length - 1];
        const targetEndpoint = {
          lat: endpointCoord[1],
          lng: endpointCoord[0],
        };

        // ── Compute remaining distance ────────────────────────────────
        // ORIGINAL target = the value captured at workout-start in
        // `guidedRouteDistanceKm`, NOT focusedRoute.distance — focusedRoute
        // gets replaced by each deviation recalc, so reading its distance
        // would make every successive remaining shorter than the user's
        // actual remaining workout (a classic shrinking-target bug).
        const originalTargetKm =
          (typeof guidedRouteDistanceKm === 'number' && guidedRouteDistanceKm > 0)
            ? guidedRouteDistanceKm
            : focused.distance;
        const totalDistanceKm = useSessionStore.getState().totalDistance ?? 0;
        const remainingKm = Math.max(0.1, originalTargetKm - totalDistanceKm);

        let newRoute: Route | null = null;

        if (remainingKm < DIRECT_RETURN_THRESHOLD_KM) {
          // ── Direct-line fallback ────────────────────────────────────
          // Skip the generator entirely — the cost-benefit of a complex
          // ~400m loop versus a 400m straight line is firmly in favour of
          // "just point the user home".
          newRoute = buildDirectReturnRoute(
            pos,
            targetEndpoint,
            activityType as ActivityType,
          );
        } else {
          // ── Full re-generation ──────────────────────────────────────
          // When the user has deviated from a Firestore-backed official
          // route (NOT a previously-generated dynamic loop), thread its
          // id into `activeOfficialRouteId`. The generator multiplies the
          // score of every street_segment carrying that same id by 5×,
          // which strongly biases the new triangular loop's waypoints to
          // weave back through the original route's corridor — i.e. the
          // user gets nudged HOME along the path they signed up to run.
          //
          // Synthetic routes (`gen-*`, `deviation_direct_*`) never had a
          // Firestore broadcast in the first place, so passing their id
          // would just cost a few extra log lines for no behaviour change.
          const officialIdForBias = isOfficialRouteId(focused.id)
            ? focused.id
            : undefined;

          const parks = await getCachedParks();
          const generated = await generateDynamicRoutes({
            userLocation: pos,
            targetDistance: remainingKm,
            activity: activityType as ActivityType,
            // Unique invocation id so the generator can't dedup against an
            // earlier identical call (it caches by index).
            routeGenerationIndex: Date.now(),
            preferences: { includeStrength: false },
            parks,
            cityName: cityNameRef.current,
            activeOfficialRouteId: officialIdForBias,
          });
          newRoute = generated[0]
            ?? buildDirectReturnRoute(
              pos,
              targetEndpoint,
              activityType as ActivityType,
            );
        }

        if (cancelled) return;

        // Swap the on-map polyline AND the deviation reference. The
        // setActiveRoutePath setter doubles as a deviation-state reset
        // (see useRunningPlayer.setActiveRoutePath), so by the time the
        // next GPS sample arrives the counter is back at 0 and the user
        // is — by construction — close to the new path.
        setFocusedRouteRef.current(newRoute);
        useRunningPlayer.getState().setActiveRoutePath(newRoute.path);
      } catch (err) {
        // Surface for debugging but do NOT throw — the user's workout is
        // still running and we'd rather quietly keep the old route on
        // screen than crash the whole map shell.
        console.error('[RouteDeviationOrchestrator] recalc failed:', err);
      } finally {
        if (cancelled) return;
        // Always clear the off-route gate, even on failure. Without this
        // the next deviation would trip but produce no token bump because
        // isOffRoute would still be true, and the orchestrator would wait
        // forever for a phantom event.
        useRunningPlayer.getState().clearOffRouteState();
        useRunningPlayer.getState().setRecalculatingRoute(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // We DELIBERATELY depend only on the event token. activityType /
    // guidedRouteDistanceKm / cityName are read via refs (or via fresh
    // store reads inside the effect body) so they always reflect the
    // current value at fire-time without re-arming the effect on every
    // render. Re-running on every position update would be catastrophic.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offRouteEventToken]);
}
