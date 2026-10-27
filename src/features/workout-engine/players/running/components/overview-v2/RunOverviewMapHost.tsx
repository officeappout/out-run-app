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
 * enable_run_drawer_from_me_v1 (board RP-14): everything starts from the
 * runner's location — the search runs on open, the routes are a row of tiles
 * in the drawer (loops from here + a near, fitting official route;
 * run-route-tiles.ts), first tile preselected, "הצעה אחרת" = the generator's
 * next set. No carousel over the map. Off = all of the above unchanged.
 * The runner's edits (level, swapped main set, paces — run-edits.ts) are
 * written to the player's workout just before start.
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
import { applyRunEdits, NO_RUN_EDITS, type RunEdits } from '../../utils/run-overview/run-edits';
import { buildRunJourney } from '../../utils/run-preview/run-journey';
import { estimateRunTotals } from '../../utils/run-preview/run-estimates';
import { inferRunKind, resolveRunCategory, runTypeLabel } from '../../utils/run-preview/run-kind';
import { useRunPaceContext } from './useRunOverviewModel';
import { useRouteSuggestions } from './useRouteSuggestions';
import RunWorkoutOverview from './RunWorkoutOverview';
import RunRouteSuggestCarousel from './RunRouteSuggestCarousel';
import RunRouteTilesRow from './RunRouteTilesRow';
import { buildRouteTiles, defaultTileId } from '../../utils/run-overview/run-route-tiles';
import { useRunDrawerFromMeV1 } from '@/hooks/useRunDrawerFromMeV1';
import type { RunCtaMode } from './RunOverviewCta';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { common } from '@/messages/ns/common';
import { withUnit } from '@/lib/i18n/units';

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
  /** Edits from home's overview link (?variant / ?swap / ?pace). */
  initialEdits?: RunEdits | null;
  /** Back / close (today's "ביטול" → discover). */
  onExit: () => void;
  /** "בחר במפה" — pick a route on the Discover map. */
  onPickOnMap: () => void;
}

export default function RunOverviewMapHost({
  logic, workout, templateCategory, week, initialSuggest = false, initialEdits = null, onExit, onPickOnMap,
}: RunOverviewMapHostProps) {
  const t = useT(player);
  const tc = useT(common);
  // The materialized workout we started from — the store's workout becomes the
  // edited one we write before start, which must never become the new base.
  const baseRef = useRef(workout);
  const wroteRef = useRef<RunWorkout | null>(null);
  if (workout !== baseRef.current && workout !== wroteRef.current) baseRef.current = workout;
  const base = baseRef.current;

  const [edits, setEdits] = useState<RunEdits>(initialEdits ?? NO_RUN_EDITS);
  const [suggesting, setSuggesting] = useState(false);
  const [chosen, setChosen] = useState<RouteSuggestion | null>(null);
  const [onMap, setOnMap] = useState(false);
  const [snap, setSnap] = useState<{ to: 'peek' | 'half' | 'full'; n: number } | null>(null);

  const pace = useRunPaceContext();
  const active = useMemo(() => applyRunEdits(base, edits, pace.ctx), [base, edits, pace.ctx]);
  const origin = logic.currentUserPos;
  const search = useRouteSuggestions(active, templateCategory, pace.ctx, origin);
  const fromMe = useRunDrawerFromMeV1();
  const [attempt, setAttempt] = useState(0);
  // The position the search ran from — GPS ticks must not reshuffle the tiles.
  const [searchOrigin, setSearchOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const tiles = useMemo(
    () => (fromMe && suggesting ? buildRouteTiles(search.suggestions, searchOrigin) : []),
    [fromMe, suggesting, search.suggestions, searchOrigin],
  );

  const setCarouselRoutes = useMapStore((s) => s.setFreeRunCarouselRoutes);
  const { setFocusedRoute } = logic;

  const choose = (s: RouteSuggestion | null) => {
    setChosen(s);
    setFocusedRoute(s?.route ?? null);
  };

  const startSuggest = (nextAttempt = 0) => {
    setSuggesting(true);
    setOnMap(false);
    if (fromMe) {
      setAttempt(nextAttempt);
      setSearchOrigin(origin);
      search.request({ fromMe: true, attempt: nextAttempt });
    } else {
      search.request();
    }
  };
  const resetSearch = () => {
    setSuggesting(false);
    setOnMap(false);
    choose(null);
    search.reset();
  };
  // From me: "בלי מסלול" only deselects — the tiles stay.
  const clearRoute = () => {
    if (!fromMe) return resetSearch();
    setOnMap(false);
    choose(null);
  };

  // Home's "הצע לי מסלול" lands here with ?suggest=1 — search once.
  const autoSuggested = useRef(false);
  // From me: the search always runs on open.
  useEffect(() => {
    if (!(initialSuggest || fromMe) || autoSuggested.current || !origin) return;
    autoSuggested.current = true;
    startSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSuggest, fromMe, origin]);

  // First suggestion preselected; the map draws all of them (the free-run carousel slot).
  useEffect(() => {
    if (fromMe || !suggesting || search.status !== 'done') return;
    setCarouselRoutes(search.suggestions.length ? search.suggestions.map((s) => s.route) : null);
    if (search.suggestions.length && !chosen) choose(search.suggestions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggesting, search.status, search.suggestions]);
  // From me: the map draws the tiles' routes; the best tile (or the one still chosen) is selected.
  useEffect(() => {
    if (!fromMe || !suggesting || search.status !== 'done') return;
    setCarouselRoutes(tiles.length ? tiles.map((x) => x.suggestion.route) : null);
    const id = defaultTileId(tiles, chosen?.route.id ?? null);
    const next = tiles.find((x) => x.id === id)?.suggestion ?? null;
    if (next !== chosen) choose(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMe, suggesting, search.status, tiles]);
  useEffect(() => () => {
    setCarouselRoutes(null);
  }, [setCarouselRoutes]);

  // A suggestion search started on a different structure (level / swap) is stale.
  // From me: search again for the new structure.
  useEffect(() => {
    if (!suggesting) return;
    resetSearch();
    if (fromMe) startSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits.variant, edits.swap]);

  const commitEdits = () => {
    const rp = useRunningPlayer.getState();
    const w = applyRunEdits(base, edits, pace.ctx);
    if (rp.currentWorkout !== w) {
      wroteRef.current = w;
      rp.setCurrentWorkout(w);
    }
  };
  const startFree = () => {
    commitEdits();
    logic.startActiveWorkout();
  };
  const startOnRoute = () => {
    if (!chosen) return;
    commitEdits();
    setFocusedRoute(chosen.route);
    logic.startActiveWorkoutForRoute(chosen.route);
  };

  const ctaMode: RunCtaMode = !suggesting
    ? 'free'
    : search.status === 'loading' ? 'searching'
    : chosen ? 'route'
    : fromMe && tiles.length > 0 ? 'free'
    : search.status === 'done' ? 'none' : 'searching';

  // enable_hill_finder_v1 — search.hill is only ever set with the flag on (useRouteSuggestions).
  const hill = suggesting ? search.hill : null;
  const hillHint = hill
    ? t(hill.name ? 'run.overview.hill.nearbyNamed' : 'run.overview.hill.nearby', {
      name: hill.name ?? '',
      distance: hill.distanceKm < 1 ? withUnit('m', Math.round((hill.distanceKm * 1000) / 50) * 50, tc) : withUnit('km', hill.distanceKm.toFixed(1), tc),
      grade: String(Math.round(hill.avgGradePct)),
      length: withUnit('m', Math.round(hill.lengthM / 10) * 10, tc),
    })
    : null;

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
      {!fromMe && suggesting && !onMap && search.suggestions.length > 0 && (
        <RunRouteSuggestCarousel
          suggestions={search.suggestions}
          selectedId={chosen?.route.id ?? null}
          onSelect={(s) => choose(s)}
          onBack={clearRoute}
          workoutLabel={typeof mainLabel === 'string' ? mainLabel.replace(/\s*מ׳$/, '') : ''} // i18n-allow-hebrew: regex that strips the unit from the service's label
          minutes={minutes}
          journey={journey}
        />
      )}
      {chosen && onMap && (
        <motion.div className="pointer-events-none absolute inset-x-0 top-0 z-[70]"
          initial={{ y: -160, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25, ease: 'easeInOut' }}>
          <OverviewTitleBar eyebrow={t('run.overview.map.eyebrow')}
            title={t('run.overview.map.title', { type: typeLabel, route: chosen.route.name?.trim() || t('run.overview.map.routeFallback') })}
            onBack={() => setOnMap(false)} />
        </motion.div>
      )}
      <RunWorkoutOverview
        workout={base}
        templateCategory={templateCategory}
        week={week}
        edits={edits}
        onEditsChange={setEdits}
        chosen={chosen ? { route: chosen.route, score: chosen.score } : null}
        origin={origin}
        ctaMode={ctaMode}
        routeLineInHeader={onMap}
        onBack={chosen && !fromMe ? clearRoute : onExit}
        onStart={startFree}
        onSuggest={fromMe && tiles.length > 0 ? undefined : () => startSuggest()}
        onStartOnRoute={startOnRoute}
        onClearRoute={clearRoute}
        onShowOnMap={() => { setOnMap(true); setSnap((p) => ({ to: 'peek', n: (p?.n ?? 0) + 1 })); }}
        onPickOnMap={onPickOnMap}
        hillHint={hillHint}
        snapRequest={snap}
        routeTiles={fromMe && tiles.length > 0 ? (
          <RunRouteTilesRow
            tiles={tiles}
            selectedId={chosen?.route.id ?? null}
            onSelect={(x) => choose(x.suggestion)}
            onAnother={() => startSuggest(attempt + 1)}
          />
        ) : undefined}
      />
    </>
  );
}
