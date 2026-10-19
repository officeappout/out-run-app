'use client';

/**
 * RunOverviewMapHost — the planned run's overview over the map
 * (PlannedPreviewLayer, enable_home_v2; boards M-6a/6b/6c/6f/6i). Replaces
 * the v2 preview card + briefing there.
 *
 *   free      — "התחל אימון" starts from here with free GPS (today's start)
 *   suggest   — "הצע לי מסלול" → up to 3 routes from here (carousel on the
 *               map, first preselected and focused); the drawer shows the
 *               workout on that route; "התחל אימון במסלול" starts the
 *               planned run on it through the existing route-run path
 *               (startActiveWorkoutForRoute keeps the planned workout)
 *   none      — no route near → notice + "בחר במפה" (Discover)
 * The chosen variant is written to the player's workout just before start.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import type { Route } from '@/features/parks/core/types/route.types';
import OverviewTitleBar from '@/features/parks/core/components/hybrid/OverviewTitleBar';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import type RunWorkout from '../../types/run-workout.type';
import type { RouteSuggestion } from '../../lib/route-fit';
import type { RunWeekContext } from '../../utils/run-preview/run-week';
import { applyRunVariant, type RunVariantKey } from '../../utils/run-overview/run-variants';
import { buildRunJourney } from '../../utils/run-preview/run-journey';
import { estimateRunTotals } from '../../utils/run-preview/run-estimates';
import { inferRunKind, resolveRunCategory, runTypeLabel } from '../../utils/run-preview/run-kind';
import { useRunPaceContext } from './useRunOverviewModel';
import { useRouteSuggestions } from './useRouteSuggestions';
import RunWorkoutOverview from './RunWorkoutOverview';
import RunRouteSuggestCarousel from './RunRouteSuggestCarousel';
import type { RunCtaMode } from './RunOverviewCta';

export interface RunOverviewMapLogic {
  currentUserPos: { lat: number; lng: number } | null;
  setFocusedRoute: (route: Route | null) => void;
  startActiveWorkout: () => void;
  startActiveWorkoutForRoute: (route: Route | null) => void;
}

export interface RunOverviewMapHostProps {
  logic: RunOverviewMapLogic;
  workout: RunWorkout;
  templateCategory?: string | null;
  week?: RunWeekContext | null;
  /** Opened from home's "הצע לי מסלול" (?suggest=1). */
  initialSuggest?: boolean;
  initialVariant?: RunVariantKey | null;
  /** Back / close (today's "ביטול" → discover). */
  onExit: () => void;
  /** "בחר במפה" — pick a route on the Discover map. */
  onPickOnMap: () => void;
}

export default function RunOverviewMapHost({
  logic, workout, templateCategory, week, initialSuggest = false, initialVariant = null, onExit, onPickOnMap,
}: RunOverviewMapHostProps) {
  // The materialized workout we started from — the store's workout becomes the
  // variant we write before start, which must never become the new base.
  const baseRef = useRef(workout);
  const wroteRef = useRef<RunWorkout | null>(null);
  if (workout !== baseRef.current && workout !== wroteRef.current) baseRef.current = workout;
  const base = baseRef.current;

  const [variant, setVariant] = useState<RunVariantKey>(initialVariant ?? 'planned');
  const [suggesting, setSuggesting] = useState(false);
  const [chosen, setChosen] = useState<RouteSuggestion | null>(null);
  const [onMap, setOnMap] = useState(false);
  const [snap, setSnap] = useState<{ to: 'peek' | 'half' | 'full'; n: number } | null>(null);

  const pace = useRunPaceContext();
  const active = useMemo(() => applyRunVariant(base, variant, pace.ctx), [base, variant, pace.ctx]);
  const origin = logic.currentUserPos;
  const search = useRouteSuggestions(active, templateCategory, pace.ctx, origin);

  const setCarouselRoutes = useMapStore((s) => s.setFreeRunCarouselRoutes);
  const { setFocusedRoute } = logic;

  const choose = (s: RouteSuggestion | null) => {
    setChosen(s);
    setFocusedRoute(s?.route ?? null);
  };

  const startSuggest = () => {
    setSuggesting(true);
    setOnMap(false);
    search.request();
  };
  const clearRoute = () => {
    setSuggesting(false);
    setOnMap(false);
    choose(null);
    search.reset();
  };

  // Home's "הצע לי מסלול" lands here with ?suggest=1 — search once.
  const autoSuggested = useRef(false);
  useEffect(() => {
    if (!initialSuggest || autoSuggested.current || !origin) return;
    autoSuggested.current = true;
    startSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSuggest, origin]);

  // First suggestion preselected; the map draws all of them (the free-run carousel slot).
  useEffect(() => {
    if (!suggesting || search.status !== 'done') return;
    setCarouselRoutes(search.suggestions.length ? search.suggestions.map((s) => s.route) : null);
    if (search.suggestions.length && !chosen) choose(search.suggestions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggesting, search.status, search.suggestions]);
  useEffect(() => () => {
    setCarouselRoutes(null);
  }, [setCarouselRoutes]);

  // A suggestion search started on a different variant is stale.
  useEffect(() => {
    if (suggesting) clearRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const commitVariant = () => {
    const rp = useRunningPlayer.getState();
    const w = applyRunVariant(base, variant, pace.ctx);
    if (rp.currentWorkout !== w) {
      wroteRef.current = w;
      rp.setCurrentWorkout(w);
    }
  };
  const startFree = () => {
    commitVariant();
    logic.startActiveWorkout();
  };
  const startOnRoute = () => {
    if (!chosen) return;
    commitVariant();
    setFocusedRoute(chosen.route);
    logic.startActiveWorkoutForRoute(chosen.route);
  };

  const ctaMode: RunCtaMode = !suggesting
    ? 'free'
    : search.status === 'loading' ? 'searching'
    : chosen ? 'route'
    : search.status === 'done' ? 'none' : 'searching';

  const minutes = useMemo(() => {
    const sec = estimateRunTotals(active.blocks, pace.ctx).seconds;
    return sec ? Math.max(1, Math.round(sec / 60)) : null;
  }, [active, pace.ctx]);
  const journey = useMemo(() => buildRunJourney(active.blocks, pace.ctx), [active, pace.ctx]);
  const mainLabel = journey.find((j) => j.kind === 'repeat')?.label ?? active.title;
  const typeLabel = useMemo(() => {
    const cat = resolveRunCategory(active.category, templateCategory);
    return runTypeLabel(cat, inferRunKind(cat, active.blocks));
  }, [active, templateCategory]);

  return (
    <>
      {suggesting && !onMap && search.suggestions.length > 0 && (
        <RunRouteSuggestCarousel
          suggestions={search.suggestions}
          selectedId={chosen?.route.id ?? null}
          onSelect={(s) => choose(s)}
          onBack={clearRoute}
          workoutLabel={typeof mainLabel === 'string' ? mainLabel.replace(/\s*מ׳$/, '') : ''}
          minutes={minutes}
          journey={journey}
        />
      )}
      {chosen && onMap && (
        <motion.div className="pointer-events-none absolute inset-x-0 top-0 z-[70]"
          initial={{ y: -160, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25, ease: 'easeInOut' }}>
          <OverviewTitleBar eyebrow="מבט על אימון" title={`${typeLabel} על ${chosen.route.name?.trim() || 'המסלול'}`}
            onBack={() => setOnMap(false)} />
        </motion.div>
      )}
      <RunWorkoutOverview
        workout={base}
        templateCategory={templateCategory}
        week={week}
        variant={variant}
        onVariantChange={setVariant}
        chosen={chosen ? { route: chosen.route, score: chosen.score } : null}
        origin={origin}
        ctaMode={ctaMode}
        routeLineInHeader={onMap}
        onBack={chosen ? clearRoute : onExit}
        onStart={startFree}
        onSuggest={startSuggest}
        onStartOnRoute={startOnRoute}
        onClearRoute={clearRoute}
        onShowOnMap={() => { setOnMap(true); setSnap((p) => ({ to: 'peek', n: (p?.n ?? 0) + 1 })); }}
        onPickOnMap={onPickOnMap}
        snapRequest={snap}
      />
    </>
  );
}
