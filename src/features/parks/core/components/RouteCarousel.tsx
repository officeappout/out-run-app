'use client';

/**
 * RouteCarousel — UNIFIED floating horizontal carousel for two flows:
 *
 *   1. Loop mode (default, `mode === 'loop'`): generated free-run loops
 *      from `generateDynamicRoutes` with a `targetKm`. The original
 *      free-run experience — three triangular routes around the user's
 *      current location.
 *
 *   2. Commute mode (`mode === 'commute'`): A-to-B routes from the same
 *      `generateDynamicRoutes` entry point, but invoked with a
 *      `destination` coord. The generator branches internally to
 *      produce up to 3 commute variants (fastest / alternative / quiet),
 *      each tagged with `route.variant` so the internal RouteCard
 *      renders a small chip badge.
 *
 * Critical: this is the ONLY carousel for routes — there is no separate
 * commute-cards component. Style changes here reflect in BOTH flows
 * automatically (the user-facing "system-wide consistency" requirement).
 *
 * Sits OVER the map (no full-screen scrim) so the user can still see and
 * pan the world behind the cards, mirroring the BottomJourneyContainer /
 * ActivityCarousel pattern. Each card shows route stats + a "התחל" CTA;
 * swiping the carousel pushes the centered route into `useMapLogic.focusedRoute`
 * so the camera fitBounds-debounce in `useCameraController` reframes
 * the map on every snap.
 *
 * Scroll & focus model (the "no-jitter" contract — read me before touching):
 *   • Snap math reads each card's actual `offsetLeft` from the DOM rather
 *     than a derived `containerWidth × 0.85` formula. This is robust to the
 *     `max-w-[340px]` clip that kicks in on tablet-width viewports — the
 *     old derived formula assumed cards were always 85 % of viewport, so
 *     the snap target drifted on bigger screens and the user occasionally
 *     "skipped" a card.
 *   • `scroll-snap-stop: always` (the `snap-always` Tailwind utility) is
 *     applied to every card, so a fast flick can never blow past one card
 *     and land on the next-next — the browser HAS to settle on each card.
 *   • `onFocusChange` is debounced (~150 ms after the last scroll event)
 *     so a rapid swipe through three cards triggers ONE camera reframe at
 *     the destination, not three back-to-back fitBounds animations.
 *   • Bidirectional sync with the map uses two refs:
 *       - `lastEmittedRouteIdRef`     — last route ID we pushed to the
 *         parent. If the parent re-passes it via `focusedRouteId`, we
 *         skip — no echo loop.
 *       - `isProgrammaticScrollRef`   — true while we're auto-scrolling
 *         in response to a parent-driven focus change (map tap). The
 *         debounced emit checks this and skips firing onFocusChange,
 *         which would otherwise echo the parent's own value back.
 *     Touch / pointer / wheel listeners on the container clear
 *     `isProgrammaticScrollRef` the moment the user takes over, so a
 *     swipe that interrupts an in-flight programmatic scroll always wins.
 *
 * Phases:
 *   mount      → 'searching' (small floating loader at the bottom + radar
 *                  glow over user position; the map stays visible).
 *               → wait for cityName to resolve (or CITY_RESOLUTION_TIMEOUT_MS)
 *               → generateDynamicRoutes() with the resolved cityName
 *   ready      → 'cards' (floating horizontal carousel at the bottom)
 *               → user swipes  → onFocusChange(route) → camera reframes
 *               → user taps התחל → onSelect(route) → parent starts workout
 *               → user taps back chip → onBack() → parent re-opens drawer
 *
 * Z-index: z-[60] — same tier as ActivityCarousel / WorkoutDrawer per the
 * z-index budget in .cursorrules. The map remains fully interactive
 * underneath because the outer container is `pointer-events-none` and only
 * the cards / chips opt back in with `pointer-events-auto`.
 *
 * Map polyline pipeline:
 *   On `setRoutes(result)` we ALSO push the full list into
 *   `useMapStore.freeRunCarouselRoutes` so MapShell.mapRoutes can render
 *   every swipeable route, not just the focused one. We clear the slot on
 *   unmount so the map returns to its standard mode-driven source.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Bike,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Map as MapIcon,
  MapPin,
  Play,
  Shuffle,
  Star,
  Timer,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  generateDynamicRoutes,
} from '../services/route-generator.service';
import { fetchRealParks } from '../services/parks.service';
import { useMapStore } from '../store/useMapStore';
import type { ActivityType, CommuteVariant, Route } from '../types/route.types';

const ACCENT = '#00ADEF';
const BRAND_CYAN = '#00E5FF';

/**
 * Variant chip metadata — single source of truth for the badge rendered
 * on commute route cards. Three practical variants only (no greenery /
 * scenic semantics per the latest commute spec).
 *
 *   • fastest     → cyan, lightning bolt — "הכי מהיר"
 *   • alternative → slate, shuffle — "מסלול חלופי" (a different way to get there)
 *   • quiet       → indigo, mute — "שקט" (avoids motorways)
 *
 * Tailwind class names (rather than inline styles) so the chips inherit
 * the dark/light treatment Tailwind already configures and so future
 * theme tweaks don't need to touch this file.
 */
const VARIANT_CHIP_META: Record<
  CommuteVariant,
  { label: string; bg: string; text: string; Icon: typeof Zap }
> = {
  fastest: { label: 'הכי מהיר', bg: 'bg-cyan-50', text: 'text-cyan-700', Icon: Zap },
  alternative: { label: 'מסלול חלופי', bg: 'bg-slate-100', text: 'text-slate-700', Icon: Shuffle },
  quiet: { label: 'שקט', bg: 'bg-indigo-50', text: 'text-indigo-700', Icon: VolumeX },
};

/**
 * Hard cap on how long we wait for `cityName` to resolve before firing the
 * generator anyway. Mirrors the value previously used by FreeRunRouteSelector
 * — keeps the resolver-vs-radar contract identical.
 */
const CITY_RESOLUTION_TIMEOUT_MS = 2000;
/**
 * Minimum time the searching phase stays on screen, even if both the
 * generator AND city resolution finished faster. Prevents a jarring
 * one-frame "loader → cards" flash on cached-route runs and gives the
 * user a moment to read the activity/destination context.
 */
const MIN_SEARCH_MS = 1500;

/**
 * How long the carousel waits after the last scroll event before
 * notifying the parent of a focus change. Long enough to ride out a
 * rapid multi-card flick (so we emit ONCE at the destination), short
 * enough that the camera reframe still feels responsive after a normal
 * single-card swipe. Tuned by feel against Instagram/Spotify (~120–
 * 180 ms scroll-end debounce).
 */
const SCROLL_IDLE_DEBOUNCE_MS = 150;

/**
 * How long we keep `isProgrammaticScrollRef` set true after kicking off
 * a smooth scroll-to-card. Long enough that the trailing scroll events
 * fired by the browser's smooth-scroll all see "programmatic = true"
 * and skip the onFocusChange emit. The user-takeover listeners
 * (touch / wheel / pointer) reset the flag earlier if they fire.
 */
const PROGRAMMATIC_SCROLL_LOCKOUT_MS = 600;

interface RouteCarouselProps {
  userPosition: { lat: number; lng: number };
  activity: ActivityType;
  /**
   * Which generation flow to drive. Defaults to `'loop'` for full
   * backwards compatibility with the existing free-run callers.
   *   - 'loop'    → uses `targetKm` + `includeStrength` + `surface` to
   *                 generate triangular routes returning to userPosition.
   *   - 'commute' → uses `destination` to generate fastest / alternative
   *                 / quiet variants from userPosition to destination.
   */
  mode?: 'loop' | 'commute';
  /**
   * Pre-computed target distance in km (caller converts time/calories → km).
   * Required when `mode === 'loop'`. Ignored in commute mode.
   */
  targetKm?: number;
  /** Whether the user toggled "Gym Parks" in the extras drawer. Loop-only. */
  includeStrength?: boolean;
  /** Surface preference from the extras drawer — drives segment scoring and route features. Loop-only. */
  surface?: 'road' | 'trail';
  /**
   * Destination coord for A-to-B commutes. Required when `mode === 'commute'`,
   * ignored otherwise. Stored as `{ lat, lng }` (NOT the `[lng, lat]` tuple)
   * so the boundary with the route generator stays explicit.
   */
  destination?: { lat: number; lng: number };
  /**
   * Optional name shown on the destination chip in commute mode (e.g.
   * "תל אביב, רחוב הרצל 14"). Falls back to a generic "אל היעד" string.
   * Ignored in loop mode.
   */
  destinationLabel?: string;
  /**
   * Optional callback fired when the user picks a different transport
   * mode in the commute activity picker (Walking / Running / Cycling).
   * The parent owns the chosen activity and re-renders the carousel
   * with the new value, which triggers a fresh route generation. When
   * omitted, the inline picker stays hidden — backwards-compatible
   * for any caller that wants the old "use the passed-in activity
   * verbatim" behaviour.
   */
  onActivityChange?: (activity: ActivityType) => void;
  cityName?: string;
  /**
   * The map's currently-focused route id. When this changes from a
   * source OUTSIDE the carousel (e.g. user tapped a route line on the
   * map), the carousel scrolls to the matching card. Echoes from our
   * own onFocusChange emit are filtered via `lastEmittedRouteIdRef`.
   */
  focusedRouteId?: string | null;
  /** Fired when the user taps a card's "Start" CTA. */
  onSelect: (route: Route) => void;
  /** Fired when the user taps the back chip — returns to the config drawer. */
  onBack: () => void;
  /**
   * Fired when scrolling settles on a new card (debounced ~150 ms after
   * the last scroll event) so the parent can sync `logic.focusedRoute`
   * and the camera fitBounds-debounce reframes the map exactly once
   * per gesture. Skipped while a programmatic scroll is in flight to
   * prevent map-tap → carousel-scroll → onFocusChange → map-reframe
   * echo loops.
   */
  onFocusChange?: (route: Route) => void;
}

type Phase = 'searching' | 'cards' | 'empty';

export default function RouteCarousel({
  userPosition,
  activity,
  mode = 'loop',
  targetKm,
  includeStrength = false,
  surface = 'road',
  destination,
  destinationLabel,
  onActivityChange,
  cityName,
  focusedRouteId,
  onSelect,
  onBack,
  onFocusChange,
}: RouteCarouselProps) {
  const setFreeRunCarouselRoutes = useMapStore((s) => s.setFreeRunCarouselRoutes);

  const [phase, setPhase] = useState<Phase>('searching');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Track whether each gate has fired. We only flip into 'cards' when BOTH
  // the min-search timer AND the generator have completed — same coalescing
  // pattern as the legacy FreeRunRouteSelector to avoid a one-frame flash.
  const [searchMinElapsed, setSearchMinElapsed] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);

  // City-resolution gate (LOOP MODE ONLY). The loop generator may NOT
  // fire until either:
  //   (a) cityName flips from `undefined` to a string,
  //   (b) CITY_RESOLUTION_TIMEOUT_MS elapsed → proceed with cityName=undefined
  //       and let the generator fall back to random waypoints.
  // Commute mode IGNORES the city gate — destination already pins the
  // request geographically, so blocking on `useUserCityName` would just
  // add 0–2s of latency for nothing.
  const [cityTimedOut, setCityTimedOut] = useState(false);
  const cityReady = mode === 'commute' || cityName !== undefined || cityTimedOut;

  useEffect(() => {
    if (mode === 'commute') return; // no city gate in commute mode
    const t = setTimeout(() => setCityTimedOut(true), CITY_RESOLUTION_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [mode]);

  useEffect(() => {
    const t = setTimeout(() => setSearchMinElapsed(true), MIN_SEARCH_MS);
    return () => clearTimeout(t);
  }, []);

  // Reset generation gate AND staged routes whenever the user swaps
  // the commute activity (e.g. Walking → Cycling). Without this the
  // gate stays "done" from the previous fetch and the new activity's
  // routes never replace the old ones; the user would see stale
  // walking polylines under a "Cycling" picker. Loop mode is unaffected
  // — it has no activity-driven re-fetch contract.
  useEffect(() => {
    if (mode !== 'commute') return;
    setPhase('searching');
    setGenerationDone(false);
    setSearchMinElapsed(false);
    setRoutes([]);
    setGenerationError(null);
    const t = setTimeout(() => setSearchMinElapsed(true), MIN_SEARCH_MS);
    return () => clearTimeout(t);
  }, [activity, mode]);

  // Generator effect — gated on cityReady. The cancellation flag is the
  // sole dedup mechanism so we stay safe under React Strict Mode.
  // Branches on `mode`: loop mode passes targetDistance + city; commute
  // mode passes destination. The generator picks the right algorithm
  // based on the presence of `destination`.
  useEffect(() => {
    if (!cityReady) return;
    if (mode === 'commute' && !destination) {
      // Defensive: caller asked for commute but didn't supply a target.
      // Skip the call entirely so we don't hit the generator with an
      // unusable shape — the empty state will render with a clear copy.
      setGenerationDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const parks = await fetchRealParks();
        const result = await generateDynamicRoutes(
          mode === 'commute'
            ? {
                userLocation: userPosition,
                destination,
                activity,
                routeGenerationIndex: Date.now(),
                preferences: { includeStrength: false },
                parks,
                // targetDistance is unused on this branch but the option
                // shape requires it; pass a benign placeholder.
                targetDistance: 0,
              }
            : {
                userLocation: userPosition,
                targetDistance: targetKm ?? 3,
                activity,
                routeGenerationIndex: Date.now(),
                preferences: { includeStrength, surface },
                parks,
                cityName,
              },
        );
        if (cancelled) return;
        setRoutes(result.slice(0, 3));
      } catch (err) {
        if (cancelled) return;
        setGenerationError((err as Error).message ?? 'יצירת המסלולים נכשלה');
        setRoutes([]);
      } finally {
        if (!cancelled) setGenerationDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally include `activity` for commute mode (so a picker
    // swap refetches) but NOT cityName / destination, which are captured
    // at firing time — re-firing on a resolve flicker would waste
    // Mapbox calls and re-trigger the radar UX. The reset effect above
    // also primes a fresh searching gate so this fetch starts clean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityReady, mode, activity]);

  // Coalesce the gates → phase transition. Empty result still advances to
  // a dedicated 'empty' state so the user gets actionable feedback rather
  // than a perpetually-spinning loader.
  useEffect(() => {
    if (!searchMinElapsed || !generationDone) return;
    if (phase !== 'searching') return;
    setPhase(routes.length > 0 ? 'cards' : 'empty');
  }, [searchMinElapsed, generationDone, routes.length, phase]);

  // ── Map sync — push generated routes into the store so MapShell can
  // render the polylines, and seed the focus to the first card so the
  // camera fits bounds immediately. Cleared on unmount.
  useEffect(() => {
    if (routes.length === 0) return;
    setFreeRunCarouselRoutes(routes);
    if (onFocusChange) onFocusChange(routes[0]);
    // We intentionally leave `onFocusChange` out of the deps — it's only
    // meant to fire ONCE on the initial seeding. Subsequent updates come
    // from the carousel scroll handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, setFreeRunCarouselRoutes]);

  useEffect(() => {
    return () => {
      setFreeRunCarouselRoutes(null);
    };
  }, [setFreeRunCarouselRoutes]);

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none"
      dir="rtl"
      role="dialog"
      aria-label="בחירת מסלול"
    >
      <AnimatePresence mode="wait">
        {phase === 'searching' && (
          <SearchingState
            key="searching"
            mode={mode}
            cityName={cityName}
            destinationLabel={destinationLabel}
            activity={activity}
            onActivityChange={onActivityChange}
            onCancel={onBack}
          />
        )}
        {phase === 'empty' && (
          <EmptyState
            key="empty"
            mode={mode}
            targetKm={targetKm}
            destinationLabel={destinationLabel}
            activity={activity}
            onActivityChange={onActivityChange}
            error={generationError}
            onBack={onBack}
          />
        )}
        {phase === 'cards' && (
          <CardsState
            key="cards"
            mode={mode}
            routes={routes}
            activity={activity}
            onActivityChange={onActivityChange}
            destinationLabel={destinationLabel}
            focusedRouteId={focusedRouteId ?? null}
            onSelect={onSelect}
            onBack={onBack}
            onFocusChange={onFocusChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Compact commute activity picker ─────────────────────────────────────
// Three glass-morphic chips (Walking / Running / Cycling) shown ONLY in
// commute mode, just above the bottom carousel. The chip the user picks
// becomes the new `activity` prop on RouteCarousel, which kicks off a
// fresh route generation through the reset effect.
//
// Why not reuse ActivityCarousel: that surface is a full-width 3-card
// "selector before the workout" — too heavy for an inline mode swap.
// This is a 3-pill segmented control sized for a single tap on a
// glance, no commitment narrative, mirroring how Maps apps let you
// switch profiles inline mid-search.
//
// Hidden entirely when `onActivityChange` isn't passed — keeps the
// loop-mode branch and any historical caller bit-identical.

interface CommuteActivityPickerProps {
  activity: ActivityType;
  onActivityChange?: (activity: ActivityType) => void;
}

const COMMUTE_ACTIVITY_OPTIONS: Array<{
  id: Extract<ActivityType, 'walking' | 'running' | 'cycling'>;
  label: string;
  Icon: typeof Footprints;
}> = [
  { id: 'walking', label: 'הליכה', Icon: Footprints },
  { id: 'running', label: 'ריצה', Icon: Activity },
  { id: 'cycling', label: 'רכיבה', Icon: Bike },
];

function CommuteActivityPicker({
  activity,
  onActivityChange,
}: CommuteActivityPickerProps) {
  if (!onActivityChange) return null;
  return (
    <div className="flex justify-center pointer-events-none mb-2 px-4">
      <div
        className="pointer-events-auto rounded-full ring-1 ring-black/5 shadow-[0_4px_14px_rgba(0,0,0,0.08)] p-1 flex items-center gap-1"
        style={{
          backgroundColor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(14px) saturate(160%)',
          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
        }}
        role="group"
        aria-label="בחר אופן תנועה"
      >
        {COMMUTE_ACTIVITY_OPTIONS.map(({ id, label, Icon }) => {
          const isActive = activity === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onActivityChange(id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black active:scale-95 transition-all"
              style={{
                backgroundColor: isActive ? ACCENT : 'transparent',
                color: isActive ? '#FFFFFF' : '#374151',
                boxShadow: isActive ? '0 2px 8px rgba(0,173,239,0.32)' : 'none',
              }}
              aria-pressed={isActive}
              aria-label={label}
            >
              <Icon size={13} strokeWidth={isActive ? 2.6 : 2.2} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Searching state — small floating loader at the bottom ─────────────────────
// Map stays fully visible while the generator runs. We deliberately do NOT
// reuse the full-screen RadarAnimation here: the user just left the
// FreeRunDrawer and asked to see options on the map; flooding the screen
// with another full-bleed overlay would defeat the "cards-only / map
// visible" goal of this redesign.

function SearchingState({
  mode,
  cityName,
  destinationLabel,
  activity,
  onActivityChange,
  onCancel,
}: {
  mode: 'loop' | 'commute';
  cityName?: string;
  destinationLabel?: string;
  activity: ActivityType;
  onActivityChange?: (activity: ActivityType) => void;
  onCancel: () => void;
}) {
  // Mode-aware copy. Commute mode reads as a navigation prep flow
  // ("computing routes to {destination}"), loop mode keeps the
  // "scanning streets near you" framing the radar UX uses today.
  const primaryCopy =
    mode === 'commute'
      ? destinationLabel
        ? `מחשב מסלולים אל ${destinationLabel}…`
        : 'מחשב מסלולים אל היעד…'
      : cityName
        ? `מחפש מסלולים ב${cityName}…`
        : 'מחפש מסלולים קרובים…';
  const secondaryCopy =
    mode === 'commute'
      ? 'בודק מהיר, חלופי ושקט'
      : 'סורק את הרחובות הסמוכים אליך';
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 pointer-events-none"
      style={{
        paddingBottom: 'calc(max(85px, env(safe-area-inset-bottom, 0px) + 75px))',
      }}
    >
      {/* Commute activity picker — only visible in commute mode AND when
          the parent passed `onActivityChange`. Sits ABOVE the loader
          card so the user can switch modes mid-search without going
          back to the search overlay. */}
      {mode === 'commute' && (
        <CommuteActivityPicker
          activity={activity}
          onActivityChange={onActivityChange}
        />
      )}

      <div className="flex justify-center px-4">
        <div
          className="pointer-events-auto bg-white rounded-3xl shadow-[0_14px_32px_rgba(0,0,0,0.18)] px-5 py-4 flex items-center gap-3 w-full max-w-[300px]"
          dir="rtl"
        >
          {/* Spinning radar dot — Tailwind's `animate-spin` on a conic
              gradient gives the same visual as RadarAnimation's halo at
              a fraction of the bundle cost (no GPU compositing layer for
              a sub-second loader). */}
          <span className="relative w-9 h-9 shrink-0 flex items-center justify-center">
            <span
              className="absolute inset-0 rounded-full animate-spin"
              style={{
                background: `conic-gradient(from 0deg, ${BRAND_CYAN}, transparent 70%)`,
                animationDuration: '1.2s',
              }}
            />
            <span className="relative w-7 h-7 rounded-full bg-white flex items-center justify-center">
              <MapIcon size={14} style={{ color: ACCENT }} />
            </span>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-black text-gray-900 leading-tight truncate">
              {primaryCopy}
            </p>
            <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
              {secondaryCopy}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform shrink-0"
            aria-label="ביטול"
          >
            <X size={14} className="text-gray-600" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Empty state — generator returned no routes ────────────────────────────────

function EmptyState({
  mode,
  targetKm,
  destinationLabel,
  activity,
  onActivityChange,
  error,
  onBack,
}: {
  mode: 'loop' | 'commute';
  targetKm?: number;
  destinationLabel?: string;
  activity: ActivityType;
  onActivityChange?: (activity: ActivityType) => void;
  error: string | null;
  onBack: () => void;
}) {
  // Mode-aware empty copy. Loop empty = "no route of N km around you";
  // commute empty = "no route to {destination}". Both keep the same
  // "try again / change settings" CTA shape so the back-out gesture
  // is identical.
  const primaryCopy =
    mode === 'commute'
      ? destinationLabel
        ? `לא הצלחנו לחשב מסלול אל ${destinationLabel} כרגע`
        : 'לא הצלחנו לחשב מסלול אל היעד כרגע'
      : `לא הצלחנו ליצור מסלול ${(targetKm ?? 0).toFixed(1)} ק״מ קרוב אליך כרגע`;
  const secondaryCopy =
    mode === 'commute'
      ? 'נסה יעד אחר או החלף סוג פעילות.'
      : 'נסה לשנות את המרחק או את סוג הפעילות.';
  const ctaCopy = mode === 'commute' ? 'חזור לחיפוש' : 'חזור להגדרות';
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 pointer-events-none"
      style={{
        paddingBottom: 'calc(max(85px, env(safe-area-inset-bottom, 0px) + 75px))',
      }}
    >
      {/* Same picker on the empty state — lets the user retry with a
          different transport mode without going back to search. */}
      {mode === 'commute' && (
        <CommuteActivityPicker
          activity={activity}
          onActivityChange={onActivityChange}
        />
      )}

      <div className="flex justify-center px-4">
        <div
          className="pointer-events-auto bg-white rounded-3xl shadow-[0_14px_32px_rgba(0,0,0,0.18)] px-5 py-5 w-full max-w-[320px] text-center"
          dir="rtl"
        >
          <p className="text-[14px] font-black text-gray-900 leading-tight">
            {primaryCopy}
          </p>
          <p className="text-[12px] text-gray-500 mt-1.5 leading-snug">
            {secondaryCopy}
          </p>
          {error && (
            <p
              className="text-[10px] text-gray-400 font-mono mt-2 break-all leading-tight"
              dir="ltr"
            >
              {error.slice(0, 160)}
            </p>
          )}
          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full py-2.5 rounded-xl text-white text-sm font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
            style={{ backgroundColor: ACCENT }}
          >
            <ChevronRight size={14} strokeWidth={3} />
            {ctaCopy}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Cards state — floating horizontal carousel ────────────────────────────────

function CardsState({
  mode,
  routes,
  activity,
  onActivityChange,
  destinationLabel,
  focusedRouteId,
  onSelect,
  onBack,
  onFocusChange,
}: {
  mode: 'loop' | 'commute';
  routes: Route[];
  activity: ActivityType;
  onActivityChange?: (activity: ActivityType) => void;
  destinationLabel?: string;
  focusedRouteId: string | null;
  onSelect: (route: Route) => void;
  onBack: () => void;
  onFocusChange?: (route: Route) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Bidirectional sync refs ──────────────────────────────────────────
  // See the file-header doc comment for the contract these enforce.
  // Last route id we emitted to the parent — guards against the parent
  // echoing the same id back via `focusedRouteId` and triggering a
  // pointless re-scroll.
  const lastEmittedRouteIdRef = useRef<string | null>(null);
  // True while a programmatic scroll-to-card is in flight. The debounced
  // scroll-idle handler below checks this and skips emitting onFocusChange
  // — otherwise a map-tap would echo back as a manual focus change and
  // double-fire the camera reframe. Cleared on user takeover (touch /
  // wheel / pointer) or after PROGRAMMATIC_SCROLL_LOCKOUT_MS.
  const isProgrammaticScrollRef = useRef(false);
  // Pending scroll-idle debounce timer. Reset on every scroll event so
  // the emit only fires once the user actually stops swiping.
  const scrollIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inject scrollbar-hide style once.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent =
      '.scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}';
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Clean up any pending debounce timer on unmount so we don't fire
  // onFocusChange against a parent that's already torn the carousel down.
  useEffect(() => {
    return () => {
      if (scrollIdleTimerRef.current) {
        clearTimeout(scrollIdleTimerRef.current);
        scrollIdleTimerRef.current = null;
      }
    };
  }, []);

  // ── Helper: which card is currently centered? ────────────────────────
  // Reads each card's actual `offsetLeft` from the DOM rather than a
  // derived `containerWidth × 0.85` formula. This is correct even when
  // `max-w-[340px]` clips the card width on tablet-sized viewports —
  // the previous derived formula was the root cause of the "snap drifts
  // off the second card" bug on those screens.
  const findCenteredIndex = useCallback((): number => {
    const container = carouselRef.current;
    if (!container) return -1;
    const cards = Array.from(container.children) as HTMLElement[];
    if (cards.length === 0) return -1;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    let closestIdx = 0;
    let minDist = Infinity;
    cards.forEach((card, i) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - containerCenter);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, []);

  // ── Helper: programmatically scroll a given card to centre ───────────
  // Used when the parent pushes a new `focusedRouteId` (e.g. the user
  // tapped a route on the map). Sets the programmatic-scroll flag so
  // the resulting onScroll events skip the parent emit.
  const scrollCardToCentre = useCallback((domIdx: number) => {
    const container = carouselRef.current;
    if (!container) return;
    const card = container.children[domIdx] as HTMLElement | undefined;
    if (!card) return;
    isProgrammaticScrollRef.current = true;
    container.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - container.offsetWidth / 2,
      behavior: 'smooth',
    });
    // Release the lock after the smooth scroll has finished. The user-
    // takeover listeners below release it earlier on any manual input.
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, PROGRAMMATIC_SCROLL_LOCKOUT_MS);
  }, []);

  // ── Initial scroll — first route on the right (RTL UX) ───────────────
  // Outer container is dir="ltr" + flex-row-reverse so routes[0] is the
  // rightmost DOM child. We jump to centre-routes[0] using its actual
  // offsetLeft (no derived math) so the snap lands exactly on the card.
  // useLayoutEffect prevents a left-to-right flash on first paint.
  useLayoutEffect(() => {
    const container = carouselRef.current;
    if (!container || routes.length === 0) return;
    const target = container.children[0] as HTMLElement | undefined;
    if (!target) return;
    container.scrollLeft =
      target.offsetLeft + target.offsetWidth / 2 - container.offsetWidth / 2;
    setActiveIndex(0);
  }, [routes.length]);

  // ── External focus → scroll the matching card into centre ────────────
  // Triggered when the parent updates `focusedRouteId` from outside the
  // carousel (e.g. a map-tap on a route line). Skips itself if the id
  // matches what we last emitted (i.e. the parent is just echoing us
  // back through Zustand state) — that's the loop-breaker.
  useEffect(() => {
    if (!focusedRouteId) return;
    if (focusedRouteId === lastEmittedRouteIdRef.current) return;
    const idx = routes.findIndex((r) => r.id === focusedRouteId);
    if (idx < 0 || idx === activeIndex) return;
    // Mark as "we own this id now" so the trailing onFocusChange (if any)
    // and the inevitable Zustand re-emit are filtered out.
    lastEmittedRouteIdRef.current = focusedRouteId;
    setActiveIndex(idx);
    scrollCardToCentre(idx);
  }, [focusedRouteId, routes, activeIndex, scrollCardToCentre]);

  // ── Scroll handler ───────────────────────────────────────────────────
  // Two-track behaviour:
  //   • Update `activeIndex` immediately on every scroll tick so the dot
  //     indicator and card scaling track the user's finger in real time.
  //   • Debounce the parent emit (~150 ms after the last scroll event)
  //     so a fast multi-card flick triggers ONE camera reframe instead
  //     of N. Spotify/Instagram use the same scroll-end pattern.
  const handleScroll = useCallback(() => {
    const idx = findCenteredIndex();
    if (idx < 0) return;

    if (idx !== activeIndex) {
      setActiveIndex(idx);
    }

    if (scrollIdleTimerRef.current) {
      clearTimeout(scrollIdleTimerRef.current);
    }
    scrollIdleTimerRef.current = setTimeout(() => {
      scrollIdleTimerRef.current = null;
      // Suppress emits originating from a programmatic scroll — those
      // are the carousel reacting to the parent, not the other way
      // around, and re-emitting would create the echo loop.
      if (isProgrammaticScrollRef.current) return;
      const route = routes[idx];
      if (!route) return;
      if (route.id === lastEmittedRouteIdRef.current) return;
      lastEmittedRouteIdRef.current = route.id;
      onFocusChange?.(route);
    }, SCROLL_IDLE_DEBOUNCE_MS);
  }, [activeIndex, findCenteredIndex, routes, onFocusChange]);

  // ── User-takeover hook ───────────────────────────────────────────────
  // The moment the user touches the carousel, drop any in-flight
  // programmatic-scroll lockout so the upcoming swipe is treated as
  // genuine manual input. Without this, swiping during an in-flight
  // map-tap response would silently fail to update the parent.
  const handleManualInteractionStart = useCallback(() => {
    isProgrammaticScrollRef.current = false;
  }, []);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="absolute bottom-0 left-0 right-0 pointer-events-none"
      style={{
        paddingBottom: 'calc(max(85px, env(safe-area-inset-bottom, 0px) + 75px))',
      }}
    >
      {/* Commute activity picker — segmented chip group above the
          title chip, ONLY in commute mode. In loop mode the activity
          was set on the previous step (FreeRunDrawer) and is locked
          for this carousel session, so the picker stays hidden. */}
      {mode === 'commute' && (
        <CommuteActivityPicker
          activity={activity}
          onActivityChange={onActivityChange}
        />
      )}

      {/* Title chip — narrow, centered, sits just above the cards.
          In-flow (NOT absolutely positioned) so it never collides with
          the search bar / mode pills / layers button at the top. The
          back button lives here so the user always has a one-tap way
          back to the previous stage without losing the cards.
          Commute mode adds a more prominent rightmost X (close)
          button per the field-test refinement — the chevron alone
          read as "scroll to next" rather than "exit", and users
          missed it. */}
      <div className="flex justify-center pointer-events-none mb-2 px-4">
        <div
          className="pointer-events-auto bg-white/95 backdrop-blur-sm rounded-full shadow-md border border-gray-100 ps-2 pe-2 py-1.5 flex items-center gap-2"
          dir="rtl"
        >
          <button
            type="button"
            onClick={onBack}
            className="w-6 h-6 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ backgroundColor: `${ACCENT}1A` }}
            aria-label={mode === 'commute' ? 'חזור לחיפוש' : 'חזור להגדרות'}
          >
            <ChevronRight size={12} strokeWidth={3} style={{ color: ACCENT }} />
          </button>
          <span className="text-[12px] font-black text-gray-800 leading-tight px-1">
            {mode === 'commute'
              ? destinationLabel
                ? `${routes.length} דרכים אל ${destinationLabel}`
                : `${routes.length} דרכים אל היעד`
              : `${routes.length} מסלולים מותאמים אישית`}
          </span>
          {mode === 'commute' && (
            <button
              type="button"
              onClick={onBack}
              className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
              aria-label="סגור ניווט"
            >
              <X size={11} strokeWidth={3} className="text-gray-600" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={carouselRef}
        dir="ltr"
        onScroll={handleScroll}
        onTouchStart={handleManualInteractionStart}
        onPointerDown={handleManualInteractionStart}
        onWheel={handleManualInteractionStart}
        className="w-full overflow-x-auto snap-x snap-mandatory flex flex-row-reverse gap-3 pb-3 pt-2 scrollbar-hide pointer-events-auto"
        style={{
          paddingInlineStart: '16px',
          paddingInlineEnd: '40px',
          scrollBehavior: 'smooth',
        }}
      >
        {routes.map((route, idx) => {
          const isActive = idx === activeIndex;
          return (
            <RouteCard
              key={route.id}
              route={route}
              activity={activity}
              isActive={isActive}
              onStart={() => onSelect(route)}
            />
          );
        })}
      </div>

      {/* Page indicator dots — driven by scroll position. Rendered in
          reverse-DOM order so the rightmost dot maps to routes[0]. */}
      <div className="flex justify-center items-center gap-1.5 pt-1 pointer-events-none">
        {[...routes].reverse().map((route) => {
          const idx = routes.findIndex((r) => r.id === route.id);
          const isActive = idx === activeIndex;
          return (
            <span
              key={route.id}
              className={`block rounded-full transition-all ${
                isActive ? 'bg-white' : 'bg-white/55'
              }`}
              style={{
                width: isActive ? 18 : 6,
                height: 6,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────

function RouteCard({
  route,
  activity,
  isActive,
  onStart,
}: {
  route: Route;
  activity: ActivityType;
  isActive: boolean;
  onStart: () => void;
}) {
  const stars = scoreToStars(route.score);
  const highlight = useMemo(() => routeHighlight(route), [route]);
  const displayName = route.name?.trim() || 'סיבוב מעגלי';
  const distanceText = `${route.distance.toFixed(1)} ק״מ`;
  const durationText = `~${route.duration} דק׳`;
  const activityEmoji =
    activity === 'cycling' ? '🚴' : activity === 'running' ? '🏃' : '🚶';
  const variantMeta = route.variant ? VARIANT_CHIP_META[route.variant] : null;

  // Card width comes EXCLUSIVELY from Tailwind (`w-[85vw] max-w-[340px]`).
  // The previous inline `style={{ width: '85%' }}` competed with the
  // viewport-based Tailwind value and produced inconsistent widths across
  // viewport sizes — the snap target drifted whenever max-w clipped, so
  // the centre-of-card calc didn't line up with the snap point and the
  // user would "skip" past a card. One source of truth fixes the snap.
  //
  // `snap-always` (= scroll-snap-stop: always) tells the browser it MAY
  // NOT skip past this card on a fast flick — it has to stop here even
  // if the user's gesture momentum would carry them further. Without
  // this, snap-mandatory still allows the browser to leapfrog cards
  // when scroll velocity is high.
  return (
    <div
      dir="rtl"
      className={`w-[85vw] max-w-[340px] snap-center snap-always flex-shrink-0 bg-white rounded-3xl p-5 transition-all duration-300 ${
        isActive
          ? 'shadow-[0_0_0_2.5px_rgba(0,229,255,0.85),0_14px_32px_rgba(0,0,0,0.18)] scale-[1.02]'
          : 'shadow-[0_10px_28px_rgba(0,0,0,0.14)] opacity-90 scale-[0.97]'
      }`}
    >
      {/* Variant chip — commute mode only. Sits above the title row so
          the user immediately reads the semantic ("הכי מהיר" / "מסלול
          חלופי" / "שקט") before diving into stats. Loop routes leave
          `route.variant` undefined and the chip is skipped entirely so
          the existing free-run cards render unchanged. */}
      {variantMeta && (
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${variantMeta.bg} ${variantMeta.text}`}
          >
            <variantMeta.Icon size={10} strokeWidth={3} />
            {variantMeta.label}
          </span>
        </div>
      )}

      {/* Title row */}
      <div className="flex items-start gap-2 mb-1">
        <span
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${ACCENT}1A` }}
          aria-hidden="true"
        >
          {activityEmoji}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-black text-gray-900 truncate leading-tight">
            {displayName}
          </h3>
          <div className="flex items-center gap-0.5 mt-0.5">
            {[1, 2, 3].map((i) => (
              <Star
                key={i}
                size={11}
                fill={i <= stars ? ACCENT : 'transparent'}
                className={i <= stars ? '' : 'text-gray-300'}
                style={i <= stars ? { color: ACCENT } : undefined}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Highlight tag */}
      <p className="text-[12px] text-gray-600 mt-2 mb-3 leading-snug">
        {highlight}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} style={{ color: ACCENT }} className="shrink-0" />
          <span className="text-[13px] font-black text-gray-800" dir="ltr">
            {distanceText}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Timer size={13} style={{ color: ACCENT }} className="shrink-0" />
          <span className="text-[13px] font-black text-gray-800" dir="ltr">
            {durationText}
          </span>
        </div>
      </div>

      {/* Start CTA — same shape as ActivityCarousel CTA */}
      <button
        type="button"
        onClick={onStart}
        className="w-full text-center py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform"
        style={{ backgroundColor: ACCENT }}
      >
        <Play size={14} fill="currentColor" />
        התחל אימון
        <ChevronLeft size={14} strokeWidth={3} />
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToStars(score: number): number {
  if (score >= 70) return 3;
  if (score >= 40) return 2;
  return 1;
}

function routeHighlight(route: Route): string {
  const f = route.features;
  if (f?.hasGym) return 'עובר ליד גינת כושר';
  if (f?.scenic) return 'מסלול ירוק ונופי';
  if (f?.hasBenches) return 'יש ספסלים בדרך';
  if (f?.lit) return 'מואר היטב';
  return 'מסלול מעגלי חוזר אליך';
}
