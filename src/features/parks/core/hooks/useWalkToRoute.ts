import { useState, useEffect, useRef } from 'react';
import { MapboxService } from '../services/mapbox.service';
import { haversineKm, haversineMeters } from '../services/geoUtils';
import { useMapStore } from '../store/useMapStore';
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
  /** Estimated walking minutes (distance / 80 m per min, minimum 1). */
  walkMinutes: number | null;
  /**
   * The route endpoint (start or end) that was chosen as the walk target.
   * Exposed so the camera controller can compute bearing-to-target when
   * the user taps recenter while still approaching the route.
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

/** Distance threshold (metres) at which we consider the user to have "arrived" at the route. */
const ARRIVAL_RADIUS_M = 30;
/** Time (ms) after workout starts before the dotted line auto-clears regardless of position. */
const MAX_APPROACH_MS = 60_000;

/**
 * Fetches a walking path from the user's current position to whichever
 * endpoint of the focused route is closer (start OR end).
 *
 * Lifecycle:
 *  - Loaded in discover mode (pre-workout).
 *  - Persists after workout starts so the user can follow the dotted line
 *    to reach the route.
 *  - Clears automatically when:
 *      a) User steps within 30 m of either route endpoint (arrived), OR
 *      b) 60 seconds have elapsed since the workout started (fallback).
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
  const userLat      = currentUserPos?.lat;
  const userLng      = currentUserPos?.lng;
  const routeId      = focusedRoute?.id;
  const path         = focusedRoute?.path;
  const routeStartLng = path?.[0]?.[0];
  const routeStartLat = path?.[0]?.[1];
  const routeEndLng   = path?.[path.length - 1]?.[0];
  const routeEndLat   = path?.[path.length - 1]?.[1];

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

      // Proximity check: within 30 m of either endpoint → arrived.
      if (userLat != null && userLng != null) {
        const near = (lat: number | undefined, lng: number | undefined) =>
          lat != null && lng != null &&
          haversineMeters(userLat, userLng, lat, lng) <= ARRIVAL_RADIUS_M;

        if (near(routeStartLat, routeStartLng) || near(routeEndLat, routeEndLng)) {
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
      routeStartLng == null || routeStartLat == null
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
      // Pick whichever endpoint is closer to the user.
      let targetLng = routeStartLng;
      let targetLat = routeStartLat;

      if (routeEndLng != null && routeEndLat != null) {
        const dStart = haversineKm(userLat, userLng, routeStartLat, routeStartLng);
        const dEnd   = haversineKm(userLat, userLng, routeEndLat,   routeEndLng);
        if (dEnd < dStart) {
          targetLng = routeEndLng;
          targetLat = routeEndLat;
        }
      }

      try {
        const result = await MapboxService.getSmartPath(
          { lng: userLng, lat: userLat },
          { lng: targetLng, lat: targetLat },
          'walking',
        );

        if (!result || result.path.length < 2) return;

        const coords = result.path;
        const midIdx  = Math.floor(coords.length / 2);
        const midpoint: [number, number] = coords[midIdx];
        const walkMinutes = Math.max(1, Math.round(result.distance / 80));
        const walkSteps   = transformWalkSteps((result as any).steps ?? []);

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
    routeId,
    routeStartLng, routeStartLat,
    routeEndLng, routeEndLat,
    isActiveWorkout, mapMode,
    setWalkToRouteMinutes, setWalkSteps,
  ]);

  return state;
}
