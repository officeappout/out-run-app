'use client';

/**
 * FreeRunRouteSelector — full-screen overlay shown when the user picks
 * "אירובי חופשי → עם מסלול → התחל אימון חופשי" in FreeRunDrawer.
 *
 * Flow:
 *   mount → RadarAnimation (1500ms minimum)
 *        → wait for cityName to resolve (or CITY_RESOLUTION_TIMEOUT_MS)
 *        → generateDynamicRoutes() with the (possibly undefined) cityName
 *        → 3 route cards (or empty-state if generator returned nothing)
 *        → user taps a card → onSelect(route) → parent handles startWorkout
 *
 * Why we wait for cityName:
 *   useUserCityName has three resolution paths and the third (Mapbox
 *   reverse-geocode) is async. If we fire the generator on mount, the
 *   cityName prop is `undefined` for the first ~300–800ms even though
 *   the resolver is moments away from succeeding. The generator then
 *   skips the street_segments query and silently falls back to random
 *   waypoints — defeating the entire scored-segments pipeline.
 *
 * The radar timer and the generator still run in parallel; we only switch
 * to the cards screen once BOTH have finished. The 2s timeout guarantees
 * we never block the user forever if reverse-geocode dies.
 *
 * Z-index: z-[110] — above FreeRunDrawer (z-[100]) so the radar fully covers
 * the drawer chrome below. Not in the documented z-index budget; the only
 * thing higher in this app is the post-workout summary at z-[200], which
 * cannot be open at the same time as the discover-mode drawer.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Map as MapIcon, Star } from 'lucide-react';
import { RadarAnimation } from '@/features/partners';
import {
  generateDynamicRoutes,
  getLastGenerationDiagnostics,
  type RouteGenerationDiagnostics,
} from '../services/route-generator.service';
import { fetchRealParks } from '../services/parks.service';
import type { ActivityType, Route } from '../types/route.types';

const ACCENT = '#00ADEF';

/**
 * Hard cap on how long we wait for `cityName` to resolve before firing the
 * generator anyway. The radar's own minimum show is 1500ms; setting this to
 * 2000ms gives the reverse-geocode just-enough headroom on slow networks
 * without making the user wait noticeably longer than the radar already does.
 */
const CITY_RESOLUTION_TIMEOUT_MS = 2000;

interface FreeRunRouteSelectorProps {
  userPosition: { lat: number; lng: number };
  activity: ActivityType;
  /** Pre-computed target distance in km (caller converts time/calories → km). */
  targetKm: number;
  cityName?: string;
  onSelect: (route: Route) => void;
  onCancel: () => void;
}

type Phase = 'searching' | 'cards';

export default function FreeRunRouteSelector({
  userPosition,
  activity,
  targetKm,
  cityName,
  onSelect,
  onCancel,
}: FreeRunRouteSelectorProps) {
  const [phase, setPhase] = useState<Phase>('searching');
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RouteGenerationDiagnostics | null>(null);

  // Track whether each gate has fired. We only flip into 'cards' when BOTH
  // the radar minimum-show timer AND the generator have completed.
  const [radarDone, setRadarDone] = useState(false);
  const [generationDone, setGenerationDone] = useState(false);

  // City-resolution gate. The generator may NOT fire until either:
  //   (a) cityName flips from `undefined` to a string (the resolver won),
  //   (b) CITY_RESOLUTION_TIMEOUT_MS elapsed (the resolver gave up — we
  //       proceed with cityName=undefined and let the generator fall back
  //       to random waypoints, which is still better than no routes).
  const [cityTimedOut, setCityTimedOut] = useState(false);
  const cityReady = cityName !== undefined || cityTimedOut;

  // Start the timeout exactly once on mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCityTimedOut(true);
    }, CITY_RESOLUTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // Generator effect — gated on cityReady. Re-runs only when cityReady
  // transitions from false → true; the cancellation flag is the sole
  // dedup mechanism so we stay safe under React Strict Mode's dev-only
  // double-mount.
  //
  // History: an earlier version used a `generationStartedRef` to "make sure
  // the generator runs at most once". That broke Strict Mode entirely:
  //   1. First mount sets ref=true, starts work, immediately cancelled.
  //   2. Second mount sees ref=true, early-returns.
  //   3. First mount's async work eventually finishes — but its `cancelled`
  //      flag is true so it skips `setRoutes` / `setGenerationDone`.
  //   → Generator's console logs say "3 routes ready" but the component's
  //     state never updates, the radar never transitions, the UI hangs.
  // The cost of dropping the ref is one wasted Mapbox call per dev-mode
  // mount; the second mount's results are the ones the user sees, and the
  // first mount's cancelled work writes nothing.
  useEffect(() => {
    if (!cityReady) return;

    let cancelled = false;
    (async () => {
      try {
        const parks = await fetchRealParks();
        const result = await generateDynamicRoutes({
          userLocation: userPosition,
          targetDistance: targetKm,
          activity,
          routeGenerationIndex: Date.now(), // unique per invocation
          preferences: { includeStrength: false },
          parks,
          cityName, // captured at firing time, not at mount
        });
        if (cancelled) return;
        setRoutes(result.slice(0, 3));
        setDiagnostics(getLastGenerationDiagnostics());
      } catch (err) {
        if (cancelled) return;
        setGenerationError((err as Error).message ?? 'יצירת המסלולים נכשלה');
        setRoutes([]);
        setDiagnostics(getLastGenerationDiagnostics());
      } finally {
        if (!cancelled) {
          // Loud confirmation log so the developer can verify the state
          // setter actually fires. Critical when debugging "the radar is
          // still spinning even though the generator finished" — if this
          // line doesn't appear in the console, generationDone never
          // flipped and the cards-screen gate stays closed.
          console.log('[FreeRunRouteSelector] setGenerationDone(true) firing now.');
          setGenerationDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // cityName is intentionally read at the moment the gate opens; we don't
    // want to re-fire the generator if it changes after the first valid call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityReady]);

  // Coalesce the two gates into the phase transition. We also force the
  // transition the moment generation completes if the radar's been on
  // screen for at least its minimum show time — defensive against any
  // RadarAnimation re-mount that might delay or drop its onComplete.
  useEffect(() => {
    if (radarDone && generationDone && phase === 'searching') {
      setPhase('cards');
    }
  }, [radarDone, generationDone, phase]);

  // ── Hard safety net ────────────────────────────────────────────────────────
  // If generation finishes but the radar's onComplete somehow never fires
  // (e.g. a parent re-render storm clearing its setTimeout), force the
  // transition after the radar's natural duration plus a small buffer. This
  // guarantees the user is NEVER left staring at the searching overlay
  // when valid routes are sitting in state, ready to render.
  useEffect(() => {
    if (!generationDone) return;
    if (radarDone) return;
    // Must match the `routes` preset inside RadarAnimation
    // (TIMINGS.routes.coldTimeoutMs = 1800 ms). The safety buffer gives
    // the natural onComplete a 300 ms head-start before we force the
    // transition, so under normal conditions the safety NEVER fires.
    const RADAR_MIN_MS = 1800;
    const SAFETY_BUFFER_MS = 300;
    const t = setTimeout(() => {
      setRadarDone(true);
    }, RADAR_MIN_MS + SAFETY_BUFFER_MS);
    return () => clearTimeout(t);
  }, [generationDone, radarDone]);

  // Stable onComplete ref for RadarAnimation. RadarAnimation's effect lists
  // `onComplete` in its deps, so a fresh function on every render would
  // cancel and re-arm its setTimeout each time — which is exactly what was
  // happening before fix #1, leaving the radar timer stuck forever.
  const handleRadarComplete = useCallback(() => {
    setRadarDone(true);
  }, []);

  return (
    <div className="fixed inset-0 z-[110] pointer-events-auto" dir="rtl">
      <AnimatePresence mode="wait">
        {phase === 'searching' ? (
          <RadarAnimation
            key="radar"
            tab="live"
            isCached={false}
            onComplete={handleRadarComplete}
            // Routes mode runs the snappier 1.8 s tempo — runner is
            // ready to GO; we don't make them wait for a "thorough scan"
            // theatre. Cold dismiss matches RADAR_MIN_MS below.
            mode="routes"
            text={
              cityName
                ? `מחפש מסלולים ב${cityName}...`
                : 'מחפש מסלולים קרובים...'
            }
          />
        ) : (
          <CardsScreen
            key="cards"
            routes={routes ?? []}
            activity={activity}
            targetKm={targetKm}
            error={generationError}
            diagnostics={diagnostics}
            onSelect={onSelect}
            onCancel={onCancel}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Cards screen ──────────────────────────────────────────────────────────────

function CardsScreen({
  routes,
  activity,
  targetKm,
  error,
  diagnostics,
  onSelect,
  onCancel,
}: {
  routes: Route[];
  activity: ActivityType;
  targetKm: number;
  error: string | null;
  diagnostics: RouteGenerationDiagnostics | null;
  onSelect: (route: Route) => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-label="בחירת מסלול"
    >
      {/* Tap scrim to back-out. We don't put close-on-scrim on the actual
          card sheet because the user might miss-tap while reading; the
          explicit back arrow is the canonical exit. */}
      <button
        type="button"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
        aria-label="סגור בחירת מסלול"
      />

      {/* Bottom sheet with the cards */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative mt-auto bg-white rounded-t-3xl shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="rounded-full bg-gray-300" style={{ width: 36, height: 4 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:scale-90 transition-transform"
              aria-label="חזור"
            >
              <ArrowRight size={14} className="text-gray-600" />
            </button>
            <div>
              <h2 className="text-base font-black text-gray-900">בחר מסלול</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {routes.length > 0
                  ? `${routes.length} מסלולים קרובים אליך`
                  : 'אין מסלולים זמינים כרגע'}
              </p>
            </div>
          </div>
        </div>

        {/* Dev-only data-source banner. Visible only in development —
            stripped from production builds by the NODE_ENV check below.
            Surfaces *why* the generator chose its waypoint source so the
            developer can act: re-run the OSM importer, fix the city name,
            etc. Not localised because it's a dev tool. */}
        {process.env.NODE_ENV === 'development' && diagnostics && (
          <DevDiagnosticBanner diagnostics={diagnostics} />
        )}

        {/* Cards or empty state */}
        <div className="px-5 pb-2 max-h-[60vh] overflow-y-auto">
          {routes.length === 0 ? (
            <EmptyState targetKm={targetKm} error={error} onCancel={onCancel} />
          ) : (
            <div className="space-y-3 pt-2">
              {routes.map((route) => (
                <RouteCard
                  key={route.id}
                  route={route}
                  activity={activity}
                  onSelect={() => onSelect(route)}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────

function RouteCard({
  route,
  activity,
  onSelect,
}: {
  route: Route;
  activity: ActivityType;
  onSelect: () => void;
}) {
  const stars = scoreToStars(route.score);
  const highlight = useMemo(() => routeHighlight(route), [route]);
  const displayName = route.name?.trim() || 'סיבוב מעגלי';
  const distanceText = `${route.distance.toFixed(1)} ק״מ`;
  const durationText = `~${route.duration} דק׳`;
  const activityEmoji = activity === 'cycling' ? '🚴' : activity === 'running' ? '🏃' : '🚶';

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-start rounded-2xl border border-gray-200 bg-white p-4 shadow-sm active:scale-[0.99] transition-transform"
    >
      {/* Title row */}
      <div className="flex items-center gap-2 mb-1">
        <MapIcon size={16} className="text-gray-700 shrink-0" />
        <h3 className="text-[15px] font-black text-gray-900 truncate">{displayName}</h3>
      </div>

      {/* Distance + time */}
      <p className="text-[13px] font-bold text-gray-600">
        <span dir="ltr" className="font-mono">{distanceText}</span>
        <span className="mx-2 text-gray-300">•</span>
        <span dir="ltr" className="font-mono">{durationText}</span>
      </p>

      {/* Score + highlight */}
      <div className="flex items-center gap-2 mt-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3].map((i) => (
            <Star
              key={i}
              size={12}
              fill={i <= stars ? ACCENT : 'transparent'}
              className={i <= stars ? '' : 'text-gray-300'}
              style={i <= stars ? { color: ACCENT } : undefined}
            />
          ))}
        </div>
        <span className="text-[12px] text-gray-600">{highlight}</span>
      </div>

      {/* CTA */}
      <div
        className="mt-3 w-full text-center py-2.5 rounded-xl text-white text-[13px] font-black"
        style={{ backgroundColor: ACCENT }}
      >
        {activityEmoji} בחר מסלול
      </div>
    </button>
  );
}

// ── Dev-only diagnostic banner ────────────────────────────────────────────────
// Shown only in development to explain WHICH waypoint source the generator
// used and why. Particularly useful when the empty-state appears: was the
// collection empty, was the city name wrong, or did the segments exist but
// fall outside the search radius? Each branch has different remediation.

function DevDiagnosticBanner({
  diagnostics,
}: {
  diagnostics: RouteGenerationDiagnostics;
}) {
  const { source, cityNameUsed, cityNameRaw, segmentsFetched, segmentsInRadius, collectionSampleCityName } = diagnostics;

  // Happy path — green, terse.
  if (source === 'street_segments') {
    return (
      <div
        className="mx-5 mb-2 px-3 py-2 rounded-lg text-[11px] leading-snug border"
        style={{ backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', color: '#065F46' }}
        dir="ltr"
      >
        ✅ DEV: street_segments hit · city=&quot;{cityNameUsed}&quot; · fetched={segmentsFetched} · inRadius={segmentsInRadius}
      </div>
    );
  }

  // All other branches are warnings — yellow, with actionable copy.
  let title = '⚠️ DEV: random waypoints (street_segments not used)';
  let detail = '';
  switch (source) {
    case 'random_fallback_no_city':
      detail = 'cityName was undefined when the generator fired. Check useUserCityName resolution paths.';
      break;
    case 'random_fallback_empty_collection':
      detail = 'street_segments collection is EMPTY. Run the OSM importer at /admin/segments.';
      break;
    case 'random_fallback_empty_city':
      detail = `No docs match cityName=${JSON.stringify(cityNameUsed)}. Sample existing doc has cityName=${JSON.stringify(collectionSampleCityName)}. Re-import or normalise.`;
      break;
    case 'random_fallback_out_of_radius':
      detail = `Found ${segmentsFetched} docs for ${JSON.stringify(cityNameUsed)} but none within targetDistance/2 km of user. Check user GPS or re-import wider bbox.`;
      break;
    case 'random_fallback_query_error':
      detail = 'Firestore query threw — see preceding warn. Check rules / index / network.';
      break;
  }

  const rawNote = cityNameRaw && cityNameRaw !== cityNameUsed
    ? ` · raw=${JSON.stringify(cityNameRaw)} (${cityNameRaw.length} chars) → clean=${JSON.stringify(cityNameUsed)} (${cityNameUsed?.length ?? 0} chars)`
    : '';

  return (
    <div
      className="mx-5 mb-2 px-3 py-2 rounded-lg text-[11px] leading-snug border"
      style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}
      dir="ltr"
    >
      <div className="font-bold mb-0.5">{title}</div>
      <div>{detail}</div>
      {rawNote && <div className="mt-0.5 opacity-70">{rawNote}</div>}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  targetKm,
  error,
  onCancel,
}: {
  targetKm: number;
  error: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="py-8 text-center space-y-3">
      <p className="text-sm font-bold text-gray-700">
        לא הצלחנו ליצור מסלול {targetKm.toFixed(1)} ק״מ קרוב אליך כרגע.
      </p>
      {error && (
        <p className="text-[11px] text-gray-400 font-mono break-all">
          {error.slice(0, 200)}
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="mx-auto inline-block px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-[13px] font-black active:scale-95 transition-transform"
      >
        חזור להגדרות
      </button>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a generator score (rough range 0–150 in practice) to 1–3 stars.
 * The thresholds are tuned to the score formula in route-generator.service.ts
 * (`combination.score + distance*10`); adjust together if either changes.
 */
function scoreToStars(score: number): number {
  if (score >= 70) return 3;
  if (score >= 40) return 2;
  return 1;
}

/**
 * Pick the most interesting one-line highlight for the card. Order matters:
 * gym > scenic > benches > generic loop. Stays in Hebrew per app convention.
 */
function routeHighlight(route: Route): string {
  const f = route.features;
  if (f?.hasGym) return 'עובר ליד גינת כושר';
  if (f?.scenic) return 'מסלול ירוק ונופי';
  if (f?.hasBenches) return 'יש ספסלים בדרך';
  if (f?.lit) return 'מואר היטב';
  return 'מסלול מעגלי חוזר אליך';
}
