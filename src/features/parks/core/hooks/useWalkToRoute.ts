import { useState, useEffect, useRef } from 'react';
import { MapboxService } from '../services/mapbox.service';
import { haversineKm, haversineMeters, nearestPointOnPath } from '../services/geoUtils';
import { useMapStore } from '../store/useMapStore';
import { withCancelPrevious } from '@/lib/requestGovernor';
import type { Route } from '../types/route.types';

/** One Hebrew turn-by-turn step exposed to the UI (timeline row). */
export interface WalkStep {
  /** Hebrew maneuver string, optionally with street name. e.g. "פנה ימינה לרחוב הרצל". */
  instruction: string;
  /** Length of this step in meters (Mapbox `step.distance`, rounded). */
  distanceMeters: number;
}

export interface WalkToRouteState {
  /** GeoJSON LineString of the walking path from user → nearest route endpoint. */
  geoJSON: GeoJSON.FeatureCollection | null;
  /** [lng, lat] midpoint along the walking path. */
  midpoint: [number, number] | null;
  /**
   * Real walking minutes from Mapbox Directions' own `duration` field
   * (seconds, rounded up to whole minutes, minimum 1). Fix (11.10.2026,
   * start-experience state map): this used to be a client-side distance/80
   * guess — Mapbox's real duration was already being fetched in the exact
   * same request and silently discarded. No new network cost.
   */
  walkMinutes: number | null;
  /**
   * The TRUE nearest point on the route's polyline (start-experience-v2
   * Phase 1, 12.10.2026) — not "whichever endpoint is closer" (the pre-fix
   * behavior), which could target the far end of a long route when the
   * nearest point is actually somewhere in the middle. Exposed so the
   * camera controller can compute bearing-to-target when the user taps
   * recenter while still approaching the route, and so this hook's own
   * arrival check (below) tracks the SAME point the line is drawn to.
   * `null` when no walk-leg is being drawn, including when one was
   * computed but gated out for exceeding WALK_LEG_THRESHOLD_MIN.
   */
  targetEndpoint: { lat: number; lng: number } | null;
  /**
   * Pre-composed Hebrew turn-by-turn list for the walk leg. Built from
   * Mapbox's `routes[0].legs[0].steps[]` and shown in the
   * RouteDetailSheet timeline accordion. `null` while a walk is being
   * computed or when no route is focused.
   */
  walkSteps: WalkStep[] | null;
}

const EMPTY: WalkToRouteState = {
  geoJSON: null,
  midpoint: null,
  walkMinutes: null,
  targetEndpoint: null,
  walkSteps: null,
};

// ── Hebrew step composer ───────────────────────────────────────────
// Mapbox's basic Directions API doesn't ship localized instruction
// strings (those require the navigation SDK + voice/banner flags), so
// we compose our own from the structured fields:
//   `step.maneuver.type`    — 'turn' | 'continue' | 'arrive' | 'depart' | 'roundabout' | …
//   `step.maneuver.modifier`— 'left' | 'right' | 'slight left' | … (sometimes absent)
//   `step.name`             — street name in native script (already Hebrew in Israel)
//
// Falls back to "המשך" for unknown maneuver shapes so the timeline
// never shows an empty row.
function modifierLabel(modifier: string | undefined): string {
  switch ((modifier ?? '').toLowerCase()) {
    case 'right':         return 'פנה ימינה';
    case 'left':          return 'פנה שמאלה';
    case 'slight right':  return 'ימינה קל';
    case 'slight left':   return 'שמאלה קל';
    case 'sharp right':   return 'פנה חד ימינה';
    case 'sharp left':    return 'פנה חד שמאלה';
    case 'straight':      return 'המשך ישר';
    case 'uturn':         return 'פנייה חזרה';
    default:              return 'המשך';
  }
}

function composeHebrewInstruction(step: any): string {
  const type     = (step?.maneuver?.type ?? '').toLowerCase();
  const modifier = step?.maneuver?.modifier as string | undefined;
  const name     = (step?.name as string | undefined)?.trim();

  let base: string;
  switch (type) {
    case 'depart':      base = 'התחל הליכה'; break;
    case 'arrive':      base = 'הגעת ליעד'; break;
    case 'continue':    base = 'המשך ישר'; break;
    case 'roundabout':
    case 'rotary':      base = 'בכיכר, צא בהתאם'; break;
    case 'merge':       base = 'התמזג'; break;
    case 'fork':        base = modifierLabel(modifier); break;
    case 'turn':        base = modifierLabel(modifier); break;
    case 'new name':    base = 'המשך'; break;
    default:            base = modifierLabel(modifier); break;
  }

  // Skip arrival street names — "הגעת ליעד לרחוב X" reads awkwardly.
  return type === 'arrive' || !name ? base : `${base} לרחוב ${name}`;
}

function transformWalkSteps(rawSteps: any[]): WalkStep[] {
  if (!Array.isArray(rawSteps)) return [];
  // Drop the trailing "arrive" step — we render a discrete 📍 endpoint.
  return rawSteps
    .filter((s) => (s?.maneuver?.type ?? '').toLowerCase() !== 'arrive')
    .map((s) => ({
      instruction: composeHebrewInstruction(s),
      distanceMeters: Math.max(0, Math.round(Number(s?.distance ?? 0))),
    }))
    // Hide micro-segments (<10 m) — usually noise from snapping.
    .filter((s) => s.distanceMeters >= 10);
}

/** Distance threshold (metres) at which we consider the user to have "arrived" at the route.
 *  Exported (11.10.2026, start-experience state map) so start-experience-state.ts can reuse
 *  this exact value for its own "at start" check instead of duplicating the number. */
export const ARRIVAL_RADIUS_M = 30;
/** Time (ms) after workout starts before the dotted line auto-clears regardless of position. */
const MAX_APPROACH_MS = 60_000;

/**
 * Walking-time threshold (minutes) above which the walk-leg LINE itself is
 * never drawn (start-experience-v2 Phase 1, 12.10.2026). Mirrors
 * start-experience-state.ts's WALK_TO_ROUTE_THRESHOLD_MIN — duplicated as a
 * literal (not imported) because that file already imports ARRIVAL_RADIUS_M
 * from THIS one; importing back would be a circular dependency. Keep both
 * in sync if the threshold ever changes.
 */
const WALK_LEG_THRESHOLD_MIN = 15;
/**
 * Pre-fetch skip margin, as a multiple of WALK_LEG_THRESHOLD_MIN: a
 * straight-line estimate comfortably over threshold skips the real Mapbox
 * request entirely, since real walking distance only ever EXCEEDS the
 * straight-line one (roads aren't straight) — an estimate already this bad
 * can only get worse with real road geometry. A borderline estimate still
 * gets a real fetch; only the REAL fetched duration below is authoritative
 * for the final draw/no-draw decision.
 */
const PRE_FETCH_SKIP_MULTIPLIER = 1.5;

/**
 * Fetches a walking path from the user's current position to the TRUE
 * nearest point on the focused route's polyline (start-experience-v2 Phase
 * 1, 12.10.2026 — previously "whichever endpoint is closer").
 *
 * Lifecycle:
 *  - Loaded in discover mode (pre-workout).
 *  - Persists after workout starts so the user can follow the dotted line
 *    to reach the route.
 *  - Clears automatically when:
 *      a) User steps within 30 m of the walk-leg's target (arrived), OR
 *      b) 60 seconds have elapsed since the workout started (fallback).
 *  - Never draws the line at all above WALK_LEG_THRESHOLD_MIN minutes —
 *    walkMinutes is still recorded (real fetched value, or a straight-line
 *    estimate when the pre-fetch gate skipped the real request) so
 *    computeStartExperienceState can still correctly classify and message
 *    off_route_too_far with a real number; only the geometry is withheld.
 *  - Debounced 500 ms so carousel scrolling doesn't fire per card.
 *  - Results cached per routeId — revisiting the same card is free.
 *  - Syncs walkMinutes to useMapStore for BottomJourneyContainer.
 */
export function useWalkToRoute(
  currentUserPos: { lat: number; lng: number } | null | undefined,
  focusedRoute: Route | null | undefined,
  isActiveWorkout: boolean,
  mapMode?: string,
): WalkToRouteState {
  const [state, setState] = useState<WalkToRouteState>(EMPTY);
  const setWalkToRouteMinutes = useMapStore((s) => s.setWalkToRouteMinutes);
  const setWalkSteps          = useMapStore((s) => s.setWalkSteps);

  const cacheRef    = useRef<Map<string, WalkToRouteState>>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracks when the current workout started — used for the 60-second fallback.
  const workoutStartTimeRef = useRef<number | null>(null);

  // Once the user arrives at a route endpoint we store the routeId here so the
  // dotted line cannot reappear even if the hook re-runs for the same route.
  const arrivedRouteIdRef = useRef<string | null>(null);

  // Record workout start / clear timer on transition.
  useEffect(() => {
    if (isActiveWorkout) {
      if (workoutStartTimeRef.current == null) {
        workoutStartTimeRef.current = Date.now();
      }
    } else {
      workoutStartTimeRef.current = null;
    }
  }, [isActiveWorkout]);

  // Flatten to primitives so the main effect only re-runs on meaningful changes.
  // path itself is deliberately NOT in this list (an array reference isn't a
  // stable dep) — routeId already captures "the path changed" for route
  // objects in this app (a given Route's path never mutates in place; a
  // different path always comes with a different id), so the effect below
  // still re-runs whenever path's shape actually changes.
  const userLat      = currentUserPos?.lat;
  const userLng      = currentUserPos?.lng;
  const routeId      = focusedRoute?.id;
  const path         = focusedRoute?.path;
  const hasValidPath = !!path && path.length >= 2;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Helper: clear local + store in lockstep so the timeline UI never
    // shows minutes from the previous route alongside steps from this one.
    const clearAll = () => {
      setState(EMPTY);
      setWalkToRouteMinutes(null);
      setWalkSteps(null);
    };

    // ── During active workout: check arrival, keep or clear ──────────────────
    if (isActiveWorkout) {
      // If the line was never loaded (user started workout without visiting
      // discover, or a different route), nothing to do.
      if (!routeId || !cacheRef.current.has(routeId)) {
        clearAll();
        return;
      }

      // Already marked as arrived for this route — stay cleared.
      if (arrivedRouteIdRef.current === routeId) {
        clearAll();
        return;
      }

      // 60-second fallback: clear regardless of position.
      const startTime = workoutStartTimeRef.current;
      if (startTime != null && Date.now() - startTime > MAX_APPROACH_MS) {
        arrivedRouteIdRef.current = routeId;
        clearAll();
        return;
      }

      // Proximity check: within 30 m of the walk-leg's ACTUAL target (the
      // true nearest point on the route, Phase 1) — not "either endpoint",
      // which could be far from where the dashed line was really pointing.
      // Read from the cache (not state) since this branch doesn't recompute
      // anything; `targetEndpoint` is null when the line was gated out for
      // exceeding WALK_LEG_THRESHOLD_MIN, in which case there's nothing to
      // track arrival against here.
      const target = cacheRef.current.get(routeId)?.targetEndpoint;
      if (target && userLat != null && userLng != null) {
        if (haversineMeters(userLat, userLng, target.lat, target.lng) <= ARRIVAL_RADIUS_M) {
          arrivedRouteIdRef.current = routeId;
          clearAll();
          return;
        }
      }

      // Not yet arrived — keep the dotted line showing, don't change state.
      return;
    }

    // ── Not in active workout: reset arrival tracker, handle discover ────────
    arrivedRouteIdRef.current = null;

    if (mapMode !== 'discover') {
      clearAll();
      return;
    }

    if (
      userLat == null || userLng == null ||
      !routeId ||
      !hasValidPath
    ) {
      clearAll();
      return;
    }

    // Serve from cache immediately — no spinner, no flash.
    const cached = cacheRef.current.get(routeId);
    if (cached) {
      setState(cached);
      setWalkToRouteMinutes(cached.walkMinutes);
      setWalkSteps(cached.walkSteps);
      return;
    }

    // Debounce: wait 500 ms after the last carousel snap before fetching.
    debounceRef.current = setTimeout(async () => {
      // TRUE nearest point on the route's polyline (Phase 1) — not
      // "whichever endpoint is closer". path is captured via closure;
      // hasValidPath (checked above, in the effect's own dep array) already
      // guarantees it has ≥2 points by the time this timer fires for the
      // same routeId (a path change always comes with a routeId change,
      // which clears/recreates this timer — see the comment on userLat's
      // destructuring above).
      const nearest = nearestPointOnPath({ lat: userLat, lng: userLng }, path!);
      if (!nearest) { clearAll(); return; }
      const [targetLng, targetLat] = nearest.point;

      // Straight-line pre-fetch estimate — same formula as
      // start-experience-state.ts's estimateWalkMinutesFromKm, duplicated as
      // a literal for the circular-import reason noted on
      // WALK_LEG_THRESHOLD_MIN above.
      const estimateKm = haversineKm(userLat, userLng, targetLat, targetLng);
      const estimateMinutes = Number.isFinite(estimateKm) && estimateKm >= 0
        ? Math.max(1, Math.round((estimateKm * 1000) / 80))
        : null;

      // Pre-fetch gate: skip the real Mapbox request when the estimate is
      // CLEARLY over threshold (see PRE_FETCH_SKIP_MULTIPLIER's doc comment).
      // walkMinutes is still recorded as the estimate — never silently
      // nulled — so computeStartExperienceState keeps a real number to
      // classify and message off_route_too_far with; only the line itself
      // (geoJSON/midpoint/walkSteps/targetEndpoint) is withheld.
      if (estimateMinutes != null && estimateMinutes > WALK_LEG_THRESHOLD_MIN * PRE_FETCH_SKIP_MULTIPLIER) {
        const gatedState: WalkToRouteState = {
          geoJSON: null, midpoint: null, walkMinutes: estimateMinutes,
          targetEndpoint: null, walkSteps: null,
        };
        cacheRef.current.set(routeId, gatedState);
        setState(gatedState);
        setWalkToRouteMinutes(estimateMinutes);
        setWalkSteps(null);
        return;
      }

      try {
        // withCancelPrevious: only one walk-to-route calc is ever relevant at
        // a time (the currently focused route), so a fresh call here aborts
        // whatever was still in flight — previously the stale fetch would
        // complete anyway and could overwrite fresher state with old data
        // (no staleness guard existed). See cryptic-munching-gadget.md.
        const result = await withCancelPrevious('walk-to-route', (signal) =>
          MapboxService.getSmartPath(
            { lng: userLng, lat: userLat },
            { lng: targetLng, lat: targetLat },
            'walking',
            [],
            {},
            { signal },
          ),
        );

        if (!result || result.path.length < 2) return;

        // Real Mapbox duration (seconds), not a distance/80 guess — see the
        // WalkToRouteState.walkMinutes doc comment above.
        const walkMinutes = Math.max(1, Math.round(result.duration / 60));

        // The REAL fetched duration is authoritative for the final
        // draw/no-draw decision, regardless of what the pre-fetch estimate
        // said — an estimate that looked promising can still come back over
        // threshold once real road geometry is known. Same gated shape as
        // the pre-fetch branch above; walkMinutes is still the real value.
        if (walkMinutes > WALK_LEG_THRESHOLD_MIN) {
          const gatedState: WalkToRouteState = {
            geoJSON: null, midpoint: null, walkMinutes,
            targetEndpoint: null, walkSteps: null,
          };
          cacheRef.current.set(routeId, gatedState);
          setState(gatedState);
          setWalkToRouteMinutes(walkMinutes);
          setWalkSteps(null);
          return;
        }

        const coords = result.path;
        const midIdx  = Math.floor(coords.length / 2);
        const midpoint: [number, number] = coords[midIdx];
        const walkSteps = transformWalkSteps((result as any).steps ?? []);

        const geoJSON: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          }],
        };

        const newState: WalkToRouteState = {
          geoJSON,
          midpoint,
          walkMinutes,
          targetEndpoint: { lat: targetLat, lng: targetLng },
          walkSteps: walkSteps.length > 0 ? walkSteps : null,
        };
        cacheRef.current.set(routeId, newState);
        setState(newState);
        setWalkToRouteMinutes(walkMinutes);
        setWalkSteps(newState.walkSteps);
      } catch {
        // Network / API error — non-critical, stay empty.
      }
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [
    userLat, userLng,
    routeId, hasValidPath,
    isActiveWorkout, mapMode,
    setWalkToRouteMinutes, setWalkSteps,
  ]);

  return state;
}
