'use client';

/**
 * TurnCarousel — horizontal swipeable strip of turn cards mounted at the top
 * of the map during navigation. One card per turn, plus a synthetic
 * destination card at the end. The currently-selected card drives the map
 * camera (smart preview):
 *
 *   • Live GPS turn (auto-follow)  → centre on the turn vertex (`flyTo`).
 *   • User-swiped upcoming turn    → fit-bounds between the user's current
 *                                    position and the turn vertex so the
 *                                    user previews the WHOLE upcoming leg,
 *                                    not just the corner. This is what
 *                                    "smart zoom" means in this codebase.
 *
 * Visual language: light theme — solid white surface, black text, app-primary
 * cyan/blue for active accents, soft elevation shadows. Zero glass / no
 * backdrop-filter blur. Matches the metrics card and SessionControlBar.
 *
 * Replaces the dual NavigationHUD (single-line) + TurnCarousel rendering
 * paths. After this refactor every navigation case in MapShell goes through
 * this component, so a one-turn route reads as a single big card and a
 * many-turn route as a horizontal strip — both with smart zoom.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  CornerUpRight,
  CornerUpLeft,
  Navigation,
  Flag,
} from 'lucide-react';
import type { RouteTurn } from '../services/geoUtils';
import { haversineMeters } from '../services/geoUtils';
import { useMapStore } from '../store/useMapStore';
import { isFiniteLatLng, isFiniteNum, isFiniteLngLat, isFiniteBounds, safeNumber } from '@/utils/geoValidation';
import { reverseGeocodeStreet } from '@/features/user/onboarding/components/steps/UnifiedLocation/location-utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TurnCarouselProps {
  turns: RouteTurn[];
  routePath: [number, number][];
  currentLocation: { lat: number; lng: number };
}

const DEST_INSTRUCTION = 'הגעת ליעד';
const STRAIGHT_INSTRUCTION = 'ישר';
/** Headline shown when the maneuver has no street name AND is "go straight". */
const FALLBACK_HEADLINE = 'המשך ישר';

/**
 * Coordinate-rounding precision for the reverse-geocode cache key.
 * 4 decimals ≈ 11 m at the equator — wide enough that two turns at the
 * same intersection share one geocode call, narrow enough that adjacent
 * streets get distinct results.
 */
const STREET_CACHE_PRECISION = 4;
function streetCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(STREET_CACHE_PRECISION)},${lng.toFixed(STREET_CACHE_PRECISION)}`;
}

// Light-theme tokens. The cyan literals mirror `out-cyan` (#00ADEF) in
// `tailwind.config.ts` — kept inline because rgba()/gradient strings can't
// reference Tailwind tokens without a JIT class. PRIMARY_DARK is the same
// hue at ~85% brightness for the icon-tile gradient.
const PRIMARY = '#00ADEF';        // = out-cyan token
const PRIMARY_DARK = '#0095CC';   // = out-cyan @ ~85%
const DEST_GREEN = '#16A34A';
const DEST_GREEN_LIGHT = '#22C55E';
const NEUTRAL_DIM = 'rgba(0, 0, 0, 0.45)';
const NEUTRAL_BORDER = 'rgba(0, 0, 0, 0.08)';
const ACTIVE_BORDER = 'rgba(0, 173, 239, 0.45)'; // out-cyan at 45%
const SOFT_SHADOW = '0 4px 20px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.04)';
const ACTIVE_SHADOW = '0 8px 28px rgba(0, 173, 239, 0.18), 0 2px 8px rgba(0, 0, 0, 0.06)';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick a lucide icon for a Hebrew maneuver label.
 *
 * IMPORTANT: this function returns the GEOMETRICALLY CORRECT icon for
 * each direction (ימינה → right-pointing, שמאלה → left-pointing).
 *
 * The previous mapping had every left/right pair SWAPPED — apparently
 * an attempt to compensate for an RTL flip that never actually happens
 * (lucide-react SVGs ignore CSS `direction`, they only mirror if you
 * deliberately apply a `transform: scaleX(-1)`). The defence below
 * (`dir="ltr"` on the icon wrapper) makes sure no future RTL ancestor
 * ever introduces such a flip, so this mapping can stay literal.
 */
function getIconForInstruction(instruction: string): React.ElementType {
  switch (instruction) {
    case 'ימינה קל':   return ArrowUpRight;   // slight right
    case 'שמאלה קל':  return ArrowUpLeft;    // slight left
    case 'פנה ימינה': return CornerUpRight;  // sharp right
    case 'פנה שמאלה': return CornerUpLeft;   // sharp left
    case DEST_INSTRUCTION: return Flag;
    default:          return ArrowUp;
  }
}

/** Manhattan-distance nearest-vertex search — fast enough for 10k-point paths. */
function findNearestPathIdx(
  path: [number, number][],
  pos: { lat: number; lng: number },
): number {
  let minD = Infinity;
  let idx = 0;
  for (let i = 0; i < path.length; i++) {
    const d = Math.abs(path[i][1] - pos.lat) + Math.abs(path[i][0] - pos.lng);
    if (d < minD) { minD = d; idx = i; }
  }
  return idx;
}

function formatDistance(meters: number): string {
  if (meters < 100) return `${Math.round(meters)} מ׳`;
  if (meters < 1000) return `${Math.round(meters / 10) * 10} מ׳`;
  return `${(meters / 1000).toFixed(1)} ק"מ`;
}

/**
 * Build a {SW, NE} bounds tuple from two coords with a tiny padding so the
 * fitBounds call doesn't try to render a zero-area rectangle when the user
 * has just passed the turn point. Padding is ~55 m at the equator, scaled
 * appropriately at higher latitudes by Mapbox itself.
 *
 * Returns `null` when EITHER endpoint is invalid. Callers MUST treat null
 * as "skip the camera move" — passing a partially-valid bounds tuple to
 * Mapbox triggers the (NaN, NaN) LngLat crash this guard was added to fix.
 *
 * Coordinate validity is delegated to the shared `isFiniteLatLng` helper
 * in `src/utils/geoValidation.ts` so AppMap and TurnCarousel can never
 * apply different "valid" rules.
 */
function buildLegBounds(
  user: { lat: number; lng: number } | null | undefined,
  turn: { lat: number; lng: number } | null | undefined,
): [[number, number], [number, number]] | null {
  if (!isFiniteLatLng(user) || !isFiniteLatLng(turn)) return null;
  const PAD = 0.0005; // ~55m
  const minLng = Math.min(user.lng, turn.lng) - PAD;
  const maxLng = Math.max(user.lng, turn.lng) + PAD;
  const minLat = Math.min(user.lat, turn.lat) - PAD;
  const maxLat = Math.max(user.lat, turn.lat) + PAD;
  return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * Pick the "leg start" point for the segment leading INTO `turnIdx`.
 *
 * Used both for the desktop / no-GPS preview fallback (where we have no
 * `currentLocation` to fitBounds against) and as a defensive value for
 * any other consumer that wants the segment's origin without re-walking
 * the path.
 *
 * Logic:
 *   • If `turnIdx > 0` AND the previous turn has finite coords → use it.
 *     This frames "the segment between the previous maneuver and this
 *     one", which is exactly the road the runner would walk to reach
 *     the highlighted turn.
 *   • Otherwise → fall back to the route's first vertex (`routePath[0]`),
 *     which is the user's start point.
 *
 * Returns `null` only when neither candidate is finite — caller then
 * skips the camera move entirely.
 */
function pickLegStart(
  turns: RouteTurn[],
  routePath: [number, number][] | null | undefined,
  turnIdx: number,
): { lat: number; lng: number } | null {
  if (turnIdx > 0) {
    const prev = turns[turnIdx - 1];
    if (prev && isFiniteNum(prev.lat) && isFiniteNum(prev.lng)) {
      return { lat: prev.lat, lng: prev.lng };
    }
  }
  if (routePath && routePath.length > 0) {
    const start = routePath[0];
    if (Array.isArray(start) && isFiniteNum(start[0]) && isFiniteNum(start[1])) {
      return { lat: start[1], lng: start[0] };
    }
  }
  return null;
}

/**
 * Lazy, throttled reverse-geocode of street names for a list of turns.
 *
 * Strategy:
 *   • Resolve only the WINDOW around the selected card (selectedIdx − 1 ..
 *     selectedIdx + 2). The user can only see ~1 card at a time, so
 *     pre-fetching one ahead keeps the next swipe instant without
 *     resolving 30 cards up front.
 *   • Cache by rounded `(lat, lng)` so two adjacent maneuvers at the
 *     same intersection share a single Mapbox call. See
 *     STREET_CACHE_PRECISION.
 *   • One pending fetch at a time, with a 120 ms gap between calls,
 *     to keep us well under Mapbox's free-tier rate limits.
 *   • Idempotent under re-renders — the "in-flight" set prevents
 *     dispatching the same key twice while a request is pending.
 *
 * The hook returns a `Map<turnIdx, streetName | null>`. Callers should
 * read it like `streetNames.get(i)` per card and treat `undefined`
 * (still resolving) and `null` (Mapbox returned nothing) the same:
 * fall back to the maneuver label.
 */
function useStreetNamesForTurns(
  turns: RouteTurn[],
  selectedIdx: number,
): Map<number, string | null> {
  // Cache key → resolved street name (or null sentinel for "no match").
  const cacheRef = useRef<Map<string, string | null>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  // Force a re-render when a new name lands in the cache. We don't store
  // the cache in state because every fetch would otherwise replace the
  // Map identity and re-trigger this effect — burning the API quota.
  const [, bump] = useState(0);
  const triggerRender = useCallback(() => bump((n) => (n + 1) % 1000000), []);

  useEffect(() => {
    let cancelled = false;

    const window = [-1, 0, 1, 2]
      .map((delta) => selectedIdx + delta)
      .filter((i) => i >= 0 && i < turns.length);

    (async () => {
      for (const i of window) {
        if (cancelled) return;
        const t = turns[i];
        if (!t || !isFiniteNum(t.lat) || !isFiniteNum(t.lng)) continue;

        const key = streetCacheKey(t.lat, t.lng);
        if (cacheRef.current.has(key)) continue;
        if (inFlightRef.current.has(key)) continue;

        inFlightRef.current.add(key);
        try {
          const street = await reverseGeocodeStreet(t.lat, t.lng);
          if (cancelled) return;
          cacheRef.current.set(key, street);
          triggerRender();
        } finally {
          inFlightRef.current.delete(key);
        }

        // Soft throttle so a fast swipe doesn't spam the API.
        await new Promise((r) => setTimeout(r, 120));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [turns, selectedIdx, triggerRender]);

  // Project the cache into a per-index map for the renderer. Cheap (one
  // pass, ≤ ~30 entries on a typical route).
  return useMemo(() => {
    const out = new Map<number, string | null>();
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (!t || !isFiniteNum(t.lat) || !isFiniteNum(t.lng)) continue;
      const key = streetCacheKey(t.lat, t.lng);
      if (cacheRef.current.has(key)) {
        out.set(i, cacheRef.current.get(key) ?? null);
      }
    }
    return out;
    // `bump` is intentionally omitted — we already re-render via setState
    // and the render reads the ref, so the projection is always fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, selectedIdx, cacheRef.current.size]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function TurnCarousel({
  turns,
  routePath,
  currentLocation,
}: TurnCarouselProps) {
  // Append a synthetic destination card so the user can swipe all the way
  // to the finish and see the endpoint highlighted on the map.
  // Memoised so identity is stable across renders — otherwise effects below
  // that depend on `allTurns` would re-fire every parent render.
  const allTurns = useMemo<RouteTurn[]>(() => {
    if (!routePath || routePath.length === 0) return turns;
    const last = routePath[routePath.length - 1];
    return [
      ...turns,
      {
        instruction: DEST_INSTRUCTION,
        distanceMeters: 0,
        lat: last[1],
        lng: last[0],
        bearingAfter: 0,
        pathIndex: routePath.length - 1,
      },
    ];
  }, [turns, routePath]);

  const setTurnFlyToTarget = useMapStore((s) => s.setTurnFlyToTarget);
  const setNavCardHeight = useMapStore((s) => s.setNavCardHeight);
  const setActiveTurnIdx = useMapStore((s) => s.setActiveTurnIdx);
  const storyBarHeight = useMapStore((s) => s.storyBarHeight);

  // Measure this component's rendered height and publish it to the store so
  // useDraggableMetrics can position the metrics card's top snap directly
  // below the carousel — no magic constants, real pixels.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const h =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (Number.isFinite(h) && h > 0) setNavCardHeight(Math.round(h));
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      setNavCardHeight(0);
    };
  }, [setNavCardHeight]);

  // Compose the top-offset CSS for the carousel root: stack BELOW the story
  // bar (which itself sits below the safe-area inset). 8 px breathing gap
  // keeps the bar's progress fill visually disconnected from the cards.
  // Falls back to a 1rem top inset before the bar's height is published.
  const stackedTop = storyBarHeight > 0
    ? `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight + 8}px)`
    : `max(1rem, env(safe-area-inset-top))`;

  // Refs to read live state from the camera effect without making it
  // re-fire on every GPS tick (the position object identity changes ~1Hz).
  const currentLocationRef = useRef(currentLocation);
  currentLocationRef.current = currentLocation;

  // Mirror routePath into a ref too so the camera effect (which depends on
  // selectedIdx / setTurnFlyToTarget only) can access the latest path
  // when computing the desktop-fallback bounds without re-firing on
  // every parent render.
  const routePathRef = useRef(routePath);
  routePathRef.current = routePath;

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [userHasManuallySelected, setUserHasManuallySelected] = useState(false);

  // Lazily resolve street names for the visible window of cards.
  const streetNames = useStreetNamesForTurns(allTurns, selectedIdx);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  // True while a programmatic scrollTo is in flight — suppresses onScroll
  // user-detection until the animation settles.
  const isProgrammaticScrollRef = useRef(false);
  const scrollResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track previous values to avoid redundant updates
  const prevGpsTurnIdxRef = useRef(-1);
  const prevSelectedIdxRef = useRef(-1);

  // ── Derived: GPS current turn ─────────────────────────────────────────────
  const currentGpsTurnIdx = useMemo(() => {
    if (!routePath || routePath.length === 0) return 0;
    const nearestPathIdx = findNearestPathIdx(routePath, currentLocation);
    // First turn that hasn't been passed yet
    const idx = turns.findIndex((t) => t.pathIndex >= nearestPathIdx);
    return idx === -1 ? Math.max(0, allTurns.length - 1) : idx;
  }, [routePath, currentLocation, turns, allTurns.length]);

  // ── Scroll to a specific card ─────────────────────────────────────────────
  const scrollToCard = useCallback(
    (idx: number, behavior: ScrollBehavior = 'smooth') => {
      const container = scrollRef.current;
      if (!container) return;
      const cards = Array.from(
        container.querySelectorAll<HTMLElement>('[data-turn-card]'),
      );
      if (!cards[idx]) return;

      isProgrammaticScrollRef.current = true;

      const cardEl = cards[idx];
      const targetScrollLeft =
        cardEl.offsetLeft + cardEl.offsetWidth / 2 - container.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior });

      if (scrollResetTimerRef.current) clearTimeout(scrollResetTimerRef.current);
      scrollResetTimerRef.current = setTimeout(
        () => { isProgrammaticScrollRef.current = false; },
        behavior === 'smooth' ? 650 : 50,
      );
    },
    [],
  );

  // ── Mount: snap to GPS turn instantly ────────────────────────────────────
  useEffect(() => {
    setSelectedIdx(currentGpsTurnIdx);
    prevGpsTurnIdxRef.current = currentGpsTurnIdx;
    const t = setTimeout(() => scrollToCard(currentGpsTurnIdx, 'instant'), 80);
    // One-shot diagnostic so QA can confirm in DevTools that the
    // mirror-fix shipped (icon container is `dir="ltr"` AND the
    // ימינה / שמאלה mapping returns geometrically correct icons).
    console.log('[UI] Turn icons mirroring disabled');
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ── Publish active turn idx to store ─────────────────────────────────────
  // AppMap reads this to render the ground arrow icon ONLY at the active
  // turn's coordinates (not the whole route). On unmount we reset to -1 so
  // the icon disappears instantly when navigation ends.
  useEffect(() => {
    setActiveTurnIdx(selectedIdx);
  }, [selectedIdx, setActiveTurnIdx]);
  useEffect(() => {
    return () => setActiveTurnIdx(-1);
  }, [setActiveTurnIdx]);

  // ── Auto-advance when GPS passes a turn ──────────────────────────────────
  useEffect(() => {
    if (currentGpsTurnIdx === prevGpsTurnIdxRef.current) return;
    prevGpsTurnIdxRef.current = currentGpsTurnIdx;

    if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);

    if (!userHasManuallySelected) {
      setSelectedIdx(currentGpsTurnIdx);
      scrollToCard(currentGpsTurnIdx);
    }

    autoResumeTimerRef.current = setTimeout(() => {
      setUserHasManuallySelected(false);
    }, 3000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGpsTurnIdx, scrollToCard]);

  // ── Camera move when selected card changes ───────────────────────────────
  // Behaviour matrix:
  //   selectedIdx === currentGpsTurnIdx (live GPS turn) → simple flyTo on
  //     the turn vertex. We're already framed on the user; no need to
  //     recompute bounds.
  //   selectedIdx > currentGpsTurnIdx (peeking ahead, GPS valid) →
  //     fitBounds between the user position and the previewed turn so
  //     they SEE the leg they'd be heading into.
  //   selectedIdx > currentGpsTurnIdx (peeking ahead, NO GPS — desktop)
  //     → fitBounds between the PREVIOUS turn vertex (or route start)
  //     and the previewed turn. This is the David-on-PC path: without
  //     it the carousel would silently flyTo a single point and David
  //     would think the swipe-preview was broken. See `pickLegStart`.
  //   selectedIdx < currentGpsTurnIdx (looking back) → flyTo the past
  //     turn vertex. AppMap's flyTo defaults (zoom 17, pitch 45) keep
  //     the Waze 3D feel during the transition.
  useEffect(() => {
    if (selectedIdx === prevSelectedIdxRef.current) return;
    prevSelectedIdxRef.current = selectedIdx;
    const turn = allTurns[selectedIdx];
    if (!turn) return;

    // Turn-vertex guard. A malformed route (Mapbox response that lost a
    // coord, a hand-built turn array with a stub `{lat: null}`, anything)
    // could land NaN here even when the user's GPS is perfect. NULL the
    // pending camera request so a previously-valid target can't be
    // consumed later and double-fly.
    if (!isFiniteNum(turn.lat) || !isFiniteNum(turn.lng)) {
      console.warn(
        '[TurnCarousel] Skipping camera move: turn vertex contains non-finite coords.',
        { idx: selectedIdx, turn },
      );
      setTurnFlyToTarget(null);
      return;
    }

    const bearing = safeNumber(turn.bearingAfter, 0);
    // Treat ANY selection that isn't the live GPS turn as a "peek" so
    // desktop testing (currentGpsTurnIdx defaults to 0 with no GPS) and
    // touch-screen navigation both get the leg-framing preview. The
    // distinction the old code drew (`> currentGpsTurnIdx`) hid the
    // preview entirely from David's PC because every swipe-target
    // landed at the same idx the GPS-less default had locked in.
    const isPeek = selectedIdx !== currentGpsTurnIdx || userHasManuallySelected;

    if (isPeek) {
      // Prefer real GPS for the leg origin — it shows "the bit of road
      // you'd actually walk now". When unavailable, anchor on the
      // previous turn vertex so the preview still frames the correct
      // segment of the route. Either way we get a meaningful fitBounds.
      const userValid = isFiniteLatLng(currentLocationRef.current);
      const legOrigin = userValid
        ? currentLocationRef.current
        : pickLegStart(allTurns, routePathRef.current, selectedIdx);

      if (!legOrigin) {
        // No GPS AND no usable leg origin (path was empty / first turn
        // with no path). Degrade to a single-point flyTo so the user
        // still sees SOMETHING happen on swipe.
        console.warn(
          '[TurnCarousel] No GPS and no usable leg origin — falling back to flyTo.',
        );
      } else {
        const bounds = buildLegBounds(legOrigin, turn);
        // ── FINAL pre-dispatch guard ─────────────────────────────────
        // Even though `buildLegBounds` already runs its endpoints
        // through `isFiniteLatLng`, we re-validate the OUTPUT shape
        // here with the same `isFiniteBounds` helper that AppMap's
        // structural guard uses. Belt-and-braces: if a future change
        // to buildLegBounds (or a NaN that sneaks in via Math.min /
        // Math.max on Infinity inputs) produces a malformed tuple,
        // it dies HERE — never reaching the camera store, never
        // reaching Mapbox's `LngLat invalid: NaN, NaN` throw at
        // AppMap.tsx:265.
        if (!bounds || !isFiniteBounds(bounds)) {
          console.warn(
            '[TurnCarousel] Invalid bounds detected - aborting zoom.',
            { bounds, legOrigin, turn, selectedIdx },
          );
          setTurnFlyToTarget(null);
          return;
        }
        if (!userValid) {
          console.log(
            '[TurnCarousel] Desktop preview: framing segment from previous turn → selected turn.',
            { fromIdx: selectedIdx - 1, toIdx: selectedIdx },
          );
        }
        setTurnFlyToTarget({ kind: 'fitBounds', bounds, bearing });
        return;
      }
    }

    // ── flyTo final guard ────────────────────────────────────────────
    // Mirror the fitBounds guard above for the single-point branch.
    // The turn-vertex check at the top of the effect already verifies
    // turn.lat / turn.lng individually, so this is structural defence:
    // if the tuple shape ever drifts (e.g. someone changes the kind to
    // accept `[lng, lat, alt]`), the dispatch still refuses NaN.
    const flyCenter: [number, number] = [turn.lng, turn.lat];
    if (!isFiniteLngLat(flyCenter)) {
      console.warn(
        '[TurnCarousel] Invalid bounds detected - aborting zoom.',
        { flyCenter, turn, selectedIdx },
      );
      setTurnFlyToTarget(null);
      return;
    }
    setTurnFlyToTarget({
      kind: 'flyTo',
      center: flyCenter,
      bearing,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdx, setTurnFlyToTarget]);

  // ── Scroll event: detect manual interaction ───────────────────────────────
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) return;

    setUserHasManuallySelected(true);

    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;
      const centerTarget = container.scrollLeft + container.clientWidth / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      container
        .querySelectorAll<HTMLElement>('[data-turn-card]')
        .forEach((el, i) => {
          const cardCenter = el.offsetLeft + el.offsetWidth / 2;
          const dist = Math.abs(cardCenter - centerTarget);
          if (dist < closestDist) { closestDist = dist; closestIdx = i; }
        });
      setSelectedIdx(closestIdx);
    }, 300);
  }, []);

  // ── Resume GPS follow ─────────────────────────────────────────────────────
  const handleResumeFollow = useCallback(() => {
    setUserHasManuallySelected(false);
    setSelectedIdx(currentGpsTurnIdx);
    scrollToCard(currentGpsTurnIdx);
  }, [currentGpsTurnIdx, scrollToCard]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoResumeTimerRef.current) clearTimeout(autoResumeTimerRef.current);
      if (scrollEndTimerRef.current)  clearTimeout(scrollEndTimerRef.current);
      if (scrollResetTimerRef.current) clearTimeout(scrollResetTimerRef.current);
    };
  }, []);

  // Empty-state guard: a 2-point straight line has no turns. Render nothing
  // rather than a single destination card on its own — the metrics card
  // shows distance-to-finish for that case and the duplicate would be noise.
  if (!allTurns || allTurns.length === 0) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={rootRef}
      // z-30 sits below FreeRunActive's subtree (z-40) so the metrics card
      // and story bar paint above the navigation cards. The story bar
      // remains visible at all times because the TurnCarousel is positioned
      // *below* it via `stackedTop` (storyBarHeight + safe-area + gap).
      className="absolute left-0 right-0 z-30"
      style={{ top: stackedTop }}
    >
      {/* ── Carousel strip ── */}
      <div
        ref={scrollRef}
        dir="ltr"
        className="flex gap-2 overflow-x-auto pb-1"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingInline: '12.5vw',
        }}
        onScroll={handleScroll}
      >
        <style>{`
          [data-turn-scroll]::-webkit-scrollbar { display: none; }
        `}</style>

        {allTurns.map((turn, i) => {
          const isCurrent = i === selectedIdx;
          const isGpsActive = i === currentGpsTurnIdx;
          const isDestination = turn.instruction === DEST_INSTRUCTION;
          const IconComp = getIconForInstruction(turn.instruction);

          const isFirstCard = i === 0;
          const isLastCard = i === allTurns.length - 1;

          // Live distance to this turn from the user's current position.
          // Computed on every render — RAF-friendly, the math is trivial
          // and only fires for turns currently in the DOM viewport.
          //
          // When `currentLocation` is missing/NaN (GPS still searching),
          // skip the haversine call and render the static `distanceMeters`
          // baked into the turn at compute time. This keeps the card
          // legible during the cold-start window instead of flashing
          // "NaN מ׳" while the GPS subsystem warms up.
          const userValid = isFiniteLatLng(currentLocation);
          const liveDistM = userValid
            ? haversineMeters(
                currentLocation.lat, currentLocation.lng,
                turn.lat, turn.lng,
              )
            : turn.distanceMeters;

          const accent = isDestination ? DEST_GREEN_LIGHT : PRIMARY;
          const accentDark = isDestination ? DEST_GREEN : PRIMARY_DARK;
          const borderColor = isCurrent ? ACTIVE_BORDER : NEUTRAL_BORDER;

          return (
            <div
              key={i}
              data-turn-card
              dir="rtl"
              style={{
                scrollSnapAlign: 'center',
                minWidth: '75vw',
                maxWidth: '75vw',
                flexShrink: 0,
                marginRight: isFirstCard ? '12.5vw' : undefined,
                marginLeft:  isLastCard  ? '12.5vw' : undefined,
                opacity: isCurrent ? 1 : 0.85,
                transform: isCurrent ? 'scale(1)' : 'scale(0.96)',
                transition: 'opacity 0.25s ease, transform 0.25s ease',
              }}
            >
              <div
                className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-white"
                style={{
                  // Light surface — solid white, no backdrop-filter. The
                  // hairline border + soft elevation shadow read as a
                  // floating card without the dark-mode glass haze.
                  border: `1px solid ${borderColor}`,
                  boxShadow: isCurrent ? ACTIVE_SHADOW : SOFT_SHADOW,
                }}
              >
                {/* Icon — primary-coloured tile, white glyph. The accent
                    swap to green for the destination is the only visual
                    cue users need to know which card represents the finish.
                    `dir="ltr"` is required: the parent card is `dir="rtl"`
                    for Hebrew text, and even though lucide SVGs don't
                    auto-mirror, defensive LTR here means a future ancestor
                    that DOES apply `transform: scaleX(-1)` for RTL (e.g.
                    a Tailwind `rtl:` variant added to the wrapper) won't
                    flip turn icons and reintroduce the David bug. */}
                <div
                  dir="ltr"
                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${accentDark}, ${accent})`,
                    boxShadow: `0 4px 12px ${accent}55`,
                  }}
                >
                  <IconComp size={22} className="text-white" strokeWidth={2.5} />
                </div>

                {/* Text — Waze-style hierarchy:
                    Top line   = small / dim ACTION ("פנה שמאלה")
                    Bottom line= BIG / bold STREET NAME ("רחוב הרצל")
                    Fallbacks (in order):
                      1. street name from reverse geocode → big
                      2. no street name + "go straight" → "המשך ישר" big
                      3. no street name + actual turn → action label big,
                         action label small text omitted (avoid duplicate)
                    The destination card is special-cased to show the
                    fixed "הגעת ליעד" headline. */}
                <div className="flex-1 min-w-0">
                  {(() => {
                    const resolvedStreet = streetNames.get(i);
                    const isStraight = turn.instruction === STRAIGHT_INSTRUCTION;

                    // Build action / headline lines per the fallback matrix.
                    let actionLine: string | null = null;
                    let headlineLine: string;

                    if (isDestination) {
                      headlineLine = DEST_INSTRUCTION;
                    } else if (resolvedStreet) {
                      actionLine = turn.instruction;
                      headlineLine = resolvedStreet;
                    } else if (isStraight) {
                      headlineLine = FALLBACK_HEADLINE;
                    } else {
                      headlineLine = turn.instruction;
                    }

                    return (
                      <>
                        {/* Action label + index pill row. Renders only
                            when we have a street name OR the destination
                            "tag-line" so the column doesn't waste vertical
                            space on the fallback case. */}
                        {(actionLine || isGpsActive) && (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            {!isDestination && (
                              <span
                                className="text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{
                                  background: isGpsActive ? accent : 'rgba(0,0,0,0.06)',
                                  color: isGpsActive ? '#FFFFFF' : NEUTRAL_DIM,
                                }}
                              >
                                {i + 1}
                              </span>
                            )}
                            {actionLine && (
                              <p
                                className="text-[11px] font-bold leading-tight truncate"
                                style={{ color: NEUTRAL_DIM }}
                              >
                                {actionLine}
                              </p>
                            )}
                            {!actionLine && isGpsActive && (
                              <p
                                className="text-[10px] font-bold leading-tight"
                                style={{ color: accentDark }}
                              >
                                {isDestination ? 'כמעט שם!' : 'תפנייה הבאה'}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Headline — the eye-catcher. Bigger than the
                            old single-line layout to give street names
                            real presence. text-lg / font-black creates
                            the strong "street name dominates the card"
                            hierarchy David asked for, while the action
                            label above (text-[11px] / font-bold / dim)
                            stays clearly secondary. truncate keeps long
                            Hebrew street names from overflowing on
                            narrow screens; the gradient icon already
                            gives the user the maneuver direction at a
                            glance. */}
                        <p className="text-black text-lg font-black leading-tight truncate">
                          {headlineLine}
                        </p>

                        {/* GPS pill secondary line — only when the action
                            already occupies the top slot (otherwise it
                            already lived in that row). */}
                        {actionLine && isGpsActive && (
                          <p
                            className="text-[10px] font-bold mt-0.5"
                            style={{ color: accentDark }}
                          >
                            {isDestination ? 'כמעט שם!' : 'תפנייה הבאה'}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Distance — bold black numbers per design spec. The
                    accent colour is reserved for the icon + GPS pill so
                    the eye lands on the maneuver direction first, distance
                    second. */}
                {!isDestination && (
                  <div className="flex-shrink-0 text-start">
                    <p
                      className="text-base font-black leading-none"
                      style={{ color: isCurrent ? '#000000' : NEUTRAL_DIM }}
                    >
                      {formatDistance(liveDistM)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Resume GPS-follow pill — light theme ── */}
      {userHasManuallySelected && (
        <div className="flex justify-center mt-1.5" dir="rtl">
          <button
            onClick={handleResumeFollow}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold pointer-events-auto bg-white"
            style={{
              border: `1px solid ${ACTIVE_BORDER}`,
              color: PRIMARY_DARK,
              boxShadow: SOFT_SHADOW,
            }}
          >
            <Navigation size={11} />
            חזור למיקומי
          </button>
        </div>
      )}
    </div>
  );
}
