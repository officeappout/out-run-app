'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { hasAssessedStrengthDomain } from '@/features/user/identity/services/access-control.service';
import { buildStepContext } from '@/features/workout-engine/core/context/build-step-context';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { PRIMARY_CATEGORIES } from '@/features/user/onboarding/services/single-domain-assessment.service';
import BottomJourneyContainer from '@/features/parks/core/components/BottomJourneyContainer';
import NavigationHub from '@/features/parks/core/components/NavigationHub';
import LegPlanStartPreview from '@/features/parks/core/components/LegPlanStartPreview';
import type { CompiledLegPlanRoute } from '@/features/parks/core/services/leg-plan.service';
import HybridOverviewScreen from '@/features/parks/core/components/hybrid/HybridOverviewScreen';
import OverviewTitleBar from '@/features/parks/core/components/hybrid/OverviewTitleBar';
import { logExerciseSwap } from '@/features/workout-engine/adaptation/log-exercise-swap';
import { adaptationStampForPlan, swapStampForEntry } from '@/features/workout-engine/adaptation/exercise-log-stamp';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { useProgramMap } from '@/features/workouts/components/workout-preview-drawer/hooks/useProgramMap';
import type { ExecutionLocation } from '@/features/content/exercises';
import type { ComposedHybridSession, HybridRoutePreview } from '@/features/workout-engine/hybrid/start-hybrid-session';
import { scheduleIdle } from '@/lib/scheduleIdle';
import HybridSlotCarousel, { ENTRY_PHRASES } from '@/features/parks/core/components/hybrid/HybridSlotCarousel';
import { composedWorkoutMin, composedCardStats, cardTotalFor, readRoundTripPref, type RoundTripLegs } from '@/features/workout-engine/hybrid/round-trip';
import ShimmerPhraseButton from '@/components/ui/ShimmerPhraseButton';
import type { HybridStartIntent } from '@/features/workout-engine/hybrid/build-hybrid-input';
import { resolveSlots, presetToIntent, type HybridSlot } from '@/features/workout-engine/hybrid/hybrid-slots';
import type { AerobicKind } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';
import { hybridSessionTitle } from '@/features/workout-engine/hybrid/aerobic-kind';
import { useSuggestionEngineStore } from '@/features/workout-engine/core/store/useSuggestionEngineStore';
import { buildMapUserContext } from '@/features/workout-engine/core/context/build-map-user-context';
import { applyRankedSlotOrder } from '@/features/workout-engine/core/context/apply-ranked-slot-order';
import { HYBRID_SLOT_PREVIEW_ENABLED, MAP_OVERVIEW_CHROME_V1, MAP_REC_ENGINE_RANKING_V1, IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED, IS_STEP_GOAL_SHORT_ROUTE_ENABLED } from '@/config/feature-flags';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useSmartHybridSlots } from '@/features/workout-engine/hybrid/smart-cards/useSmartHybridSlots';
import { isWeatherOnFor } from '@/features/weather/core/weather-access';
import FirstRunTour from '@/features/user/onboarding/components/FirstRunTour';
import TourReplayHost from '@/features/user/onboarding/components/TourReplayHost';
import { FIRST_RUN_COACH, firstRunToursEnabled, isMapTourBlocked } from '@/features/user/onboarding/services/first-run-tour';
import { stepsToTargetKm } from '@/features/parks/core/services/route-request.utils';
import type { Route } from '@/features/parks/core/types/route.types';
import RouteCarousel from '@/features/parks/core/components/RouteCarousel';
import RouteOverviewOverlay from '@/features/parks/core/components/overview/route/RouteOverviewOverlay';
import RouteOverviewWithTodayRun from '@/features/workout-engine/players/running/components/overview-v2/RouteOverviewWithTodayRun';
import { startPlannedRunOnRoute } from '@/features/workout-engine/players/running/components/overview-v2/startPlannedRunOnRoute';
import { playerActivityFor, type RouteActivity } from '@/features/parks/core/components/overview/route/route-overview';
import FloatingSearchBar from '@/features/parks/core/components/FloatingSearchBar';
import MapModeHeader, { MapMode } from '@/features/parks/core/components/MapModeHeader';
import RouteGenerationLoader from '@/features/parks/core/components/RouteGenerationLoader';
import { useMapLogic } from '@/features/parks';
import { ParkPreview } from '@/features/parks/client/components/park-preview';
import { MapLayersControl } from '@/features/parks/core/components/MapLayersControl';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useRouteOverviewHandoff } from '@/features/parks/core/hooks/useRouteOverviewHandoff';
import { useLegPlanStore } from '@/features/parks/core/store/useLegPlanStore';
import { usePendingAddressStore } from '@/features/parks/core/store/usePendingAddressStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { auth } from '@/lib/firebase';
import { usePartnerData } from '@/features/parks/core/hooks/usePartnerData';
import { useUserStore } from '@/features/user';
import { useUserCityName } from '@/features/parks/core/hooks/useUserCityName';
import type { SavedPlaceKind } from '@/features/user/places/store/useSavedPlacesStore';
import { useRecentSearchesStore } from '@/features/parks/core/store/useRecentSearchesStore';
import { SearchDestinationCard, SearchRouteCard, type SearchDestinationPick } from '@/features/parks/core/components/SearchPickCards';
import { findOfficialRouteById } from '@/features/parks/core/hooks/useSearchNavigation';
import type { ActivityType } from '@/features/parks/core/types/route.types';
import {
  PartnerBubbles,
  PartnerOverlay,
  RadarAnimation,
  usePartnerFilters,
  type LiveActivityFilter,
} from '@/features/partners';
import type { DevSimulationState } from '@/features/parks/core/hooks/useDevSimulation';
import { useCommunityEnrichment } from '@/features/parks/core/hooks/useCommunityEnrichment';
import {
  Navigation,
  Plus, X, Zap,
} from 'lucide-react';
// Overlays are code-split + mounted on first open (drop-in replacements, see the module).
import {
  FreeRunDrawer, RouteDetailSheet, ExerciseReplacementModal, ExerciseDetailDrawer, ContributionWizard,
  QuickReportSheet, PlannedActivityComposeSheet, UnifiedPlusDrawer, SetSavedPlaceSheet, useDiscoverOverlayPreload,
} from './DiscoverOverlays';
import { SOCIAL_COMPOSE_UI_ENABLED } from '@/config/feature-flags';
import { useUserLocationSync } from '@/features/parks/core/hooks/useUserLocationSync';
import { motion, AnimatePresence } from 'framer-motion';
import type { ViewportBounds } from '@/features/parks/core/store/useMapStore';
import { consumePendingPlannedRun, type PlannedRunSettings } from '@/lib/planned-run';

type MapLogic = ReturnType<typeof useMapLogic>;

const BRAND_COLOR = '#00E5FF';
const GRAY_COLOR = '#6B7280';

// Pre-Phase-1 map "+" — kept byte-identical, rendered only while
// SOCIAL_COMPOSE_UI_ENABLED is false (see feature-flags.ts). 2-button
// fan-out: report + add-location only, no compose/group options.
function ActionSpeedDial({ onAdd, onReport }: { onAdd: () => void; onReport: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative flex flex-col items-center gap-2">
      {isOpen && (
        <>
          <button
            onClick={() => { onReport(); setIsOpen(false); }}
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-amber-500 text-white active:scale-95 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            title="דיווח מהיר"
          >
            <Zap size={16} />
          </button>
          <button
            onClick={() => { onAdd(); setIsOpen(false); }}
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center bg-emerald-500 text-white active:scale-95 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
            title="הוסף מיקום"
          >
            <Plus size={16} />
          </button>
        </>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#00E5FF] text-white active:scale-95 transition-all"
      >
        {isOpen ? <X size={22} /> : <Plus size={22} />}
      </button>
    </div>
  );
}

// PlusFab — a single "+" button that opens UnifiedPlusDrawer. Replaces
// ActionSpeedDial's 4-button fan-out (report/add-location/create-group/
// go-train) per the north-star doc's own model: one unified drawer with
// organized options, not more FAB buttons ("מגירה מאוחדת אחת עם אופציות
// מסודרות" — see .claude/plans/new-chat-investigation-stateful-fern.md).
// Rendered only while SOCIAL_COMPOSE_UI_ENABLED is true.
function PlusFab({ onOpen, v2 = false }: { onOpen: () => void; v2?: boolean }) {
  return (
    <button
      onClick={onOpen}
      aria-label="הוסף"
      // v2: the white floating "+" from home (one filled gradient per screen).
      className={
        v2
          ? 'w-14 h-14 rounded-full flex items-center justify-center bg-white text-[#0284c7] active:scale-95 transition-transform'
          : 'w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#00E5FF] text-white active:scale-95 transition-all'
      }
      style={v2 ? { boxShadow: '0 28px 56px -24px rgba(9,30,50,0.45), 0 0 0 1px rgba(14,27,42,0.08)' } : undefined}
    >
      <Plus size={22} />
    </button>
  );
}

// ── Module-level pre-warm store (survives DiscoverLayer remounts) ─────────────
// Was three per-component useRef Maps → wiped on every remount (incl. the Strict-
// Mode dev mount cycle), so the CTA recomposed from scratch. Module scope keeps a
// settled plan warm for the tab's lifetime. Key = uid | slotId | coarse lat,lng
// (~110m) | activity: a different user / slot / meaningful move / activity misses
// naturally; GPS jitter under ~110m does not. FIFO-capped so a long session can't
// grow the Maps unbounded.
// IS_SHORT_ROUTE_MANUAL_TEST_EMAIL: gates shortRouteMode in the MANUAL
// free-run generator (onRequestRouteGeneration below) to David's own account
// only — testing convenience toward Phase 2 (extending short-route
// generation to every user's manual "give me a short route" flow), while the
// calibration constants (MIN_PATH_POINTS_SHORT etc., route-generator.service.ts)
// are still initial guesses. Same identity anchor
// scripts/_test-daily-goal-dispatch.ts already uses (email → uid via Admin
// SDK); client-side we only have the signed-in user's own auth object, so we
// compare email directly instead of a server-side lookup. Also gated on
// IS_STEP_GOAL_SHORT_ROUTE_ENABLED so both toggles roll back independently.
// Phase 2 (open to everyone) = delete this constant + the email check that
// uses it, once device data calibrates the constants — the generator branch
// itself needs no changes.
const IS_SHORT_ROUTE_MANUAL_TEST_EMAIL = 'office@appout.co.il';

const HYBRID_WARM_CAP = 24;
const hybridPlanCache = new Map<string, ComposedHybridSession>();
const hybridRoutePreviewCache = new Map<string, HybridRoutePreview>();
const hybridTrioInflight = new Map<string, Promise<ComposedHybridSession | null>>();

function capMapInsert<V>(map: Map<string, V>, key: string, val: V): void {
  if (!map.has(key) && map.size >= HYBRID_WARM_CAP) {
    const oldest: string | undefined = map.keys().next().value; // insertion order
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, val);
}

// Step-gap calibration cache staleness (09.08.2026): deriveAerobicTargetKm now boosts the
// 'recommended'/'route_stops' target km by the live step-gap (start-hybrid-session.ts). This
// module-scope cache is warm for the WHOLE TAB LIFETIME (see comment above) with no time
// component at all — without this, a plan composed at 9am with a large gap would be served
// unchanged at 9pm after the gap closed. Coarse-bucketed (6 bands, ~20% wide) into the key
// itself — same "coarse bucket, not exact value" shape the geo rounding above already uses —
// rather than a manual bust, so small step-count noise doesn't churn the cache. full_park /
// aerobic_quick don't read step data at all, so a bucket tick for them just yields an
// identical result under a new key (harmless — the existing FIFO cap self-heals it).
function stepGapBucket(): number {
  const stepContext = buildStepContext(useActivityStore.getState().today);
  if (stepContext.stepGoal <= 0) return 0;
  const deficitRatio = Math.min(1, Math.max(0, stepContext.stepsRemaining / stepContext.stepGoal));
  return Math.round(deficitRatio * 5);
}

function hybridWarmKey(
  slotId: string,
  loc: { lat: number; lng: number } | null,
  activity: string,
): string {
  const uid = useUserStore.getState().profile?.id ?? 'anon';
  const r = (n: number) => Math.round(n * 1000) / 1000; // ~110m bucket
  const geo = loc ? `${r(loc.lat)},${r(loc.lng)}` : 'noloc';
  return `${uid}|${slotId}|${geo}|${activity}|sg${stepGapBucket()}`;
}

interface DiscoverLayerProps {
  logic: MapLogic;
  devSim?: DevSimulationState;
  initialOpenRun?: string | null;
  /** Step-goal push deep-link target (see IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED). */
  targetSteps?: string | null;
  /** Tutorial entry-mechanism fast-follow (06.10.2026) — Welcome drawer's
   *  geo-aware second option. One-shot deep-links, same shape as initialOpenRun. */
  initialOpenHybridSlots?: boolean;
  initialOpenDiscover?: boolean;
  /** Center the camera on the best-available fix (live GPS or fallback dot). */
  onRecenter?: () => void;
  /** First-run map tour (slice 2): this is a plain map arrival (see MapShell). */
  firstRunTourEligible?: boolean;
}

export default function DiscoverLayer({ logic, devSim, initialOpenRun, targetSteps, initialOpenHybridSlots, initialOpenDiscover, onRecenter, firstRunTourEligible = false }: DiscoverLayerProps) {
  const router = useRouter();
  // Warm the code-split overlay chunks once the map is idle (first tap stays instant).
  useDiscoverOverlayPreload();
  const { setMode } = useMapMode();
  // Phase 3 (social-activities plan): opportunistically refresh the
  // userLocations/{uid} geohash index while the map has a GPS fix. Feeds
  // onPlannedActivityCreated's radius push targeting — write-only from here,
  // nothing reads this hook's own state.
  useUserLocationSync();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [plusDrawerOpen, setPlusDrawerOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('idle');
  // Settle-preview-lite for a composed leg-plan run (ג', 08.08) — armed by
  // onStartLegPlanRun below once the route is drawn + the drawer has
  // exited; LegPlanStartPreview confirms (auto or tap) → startActiveWorkout.
  const [legPlanPreview, setLegPlanPreview] = useState<CompiledLegPlanRoute | null>(null);

  // Moved up from its original position further down (was line ~576) — the
  // step-goal deep-link effect below needs it in a dependency array, which
  // TS evaluates synchronously at that point in render, unlike a normal
  // closure-body reference. `devSim`/`logic` are stable props, available
  // from the top of this component, so moving this earlier is safe; every
  // other usage further down in the file is unaffected (still after this
  // declaration either way).
  const userLocation = (devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos) ?? null;

  // ── Viewport-search ("חפש באזור זה") state ───────────────────────────────
  const viewportBounds = useMapStore((s) => s.viewportBounds);
  const viewportSearchActive = useMapStore((s) => s.viewportSearchActive);
  // Splash gate — the single flag every on-map control below reads so nothing
  // pokes through the MapLoadingSkeleton during load. Mirrors AppMap's
  // isVisuallyReady; reveals all controls together the moment the map paints.
  const isMapVisuallyReady = useMapStore((s) => s.isMapVisuallyReady);
  // Baseline bounds — set once viewportBounds first arrives (map loaded).
  // When the user taps "חפש באזור זה" this is reset to the current bounds so
  // the button only reappears after a subsequent pan.
  const refBoundsRef = useRef<ViewportBounds | null>(null);

  // Seed the baseline once (and only once) when map bounds first arrive.
  useEffect(() => {
    if (viewportBounds && !refBoundsRef.current) {
      refBoundsRef.current = viewportBounds;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportBounds !== null]);

  // "חפש באזור זה" is visible when:
  //   • map has loaded (refBoundsRef set)
  //   • not already in viewport-search mode
  //   • idle mode (button hidden in freeRun / commute / partners)
  //   • user has panned > 30% of the viewport width or height from baseline
  const showSearchAreaButton = (() => {
    if (!viewportBounds || !refBoundsRef.current) return false;
    if (viewportSearchActive) return false;
    if (mapMode !== 'idle') return false;
    const ref = refBoundsRef.current;
    const vw = Math.abs(viewportBounds.neLng - viewportBounds.swLng);
    const vh = Math.abs(viewportBounds.neLat - viewportBounds.swLat);
    const refCx = (ref.neLng + ref.swLng) / 2;
    const refCy = (ref.neLat + ref.swLat) / 2;
    const curCx = (viewportBounds.neLng + viewportBounds.swLng) / 2;
    const curCy = (viewportBounds.neLat + viewportBounds.swLat) / 2;
    return Math.abs(curCx - refCx) > vw * 0.3 || Math.abs(curCy - refCy) > vh * 0.3;
  })();

  // ── Free-run flow state machine ────────────────────────────────────────────
  // Once `mapMode === 'freeRun'`, the user passes through two stages:
  //   1. 'config' — FreeRunDrawer (activity chips + goal + start CTAs)
  //   2. 'route'  — floating RouteCarousel (3 generated route cards over the map)
  //                 only entered when the user taps "עם מסלול".
  //
  // Stage transitions:
  //   drawer "התחל חופשי"  → config → idle (workout starts)
  //   drawer "עם מסלול"    → config → route (with carousel-config payload)
  //   route carousel back  → route  → config
  //   route carousel start → route  → idle (workout starts)
  type FreeRunStep = 'config' | 'overview' | 'route' | 'slots';
  const [freeRunStep, setFreeRunStep] = useState<FreeRunStep>('config');
  // Hybrid overview (phase ב) — composed once, shown, then run (no re-compose).
  const [hybridComposed, setHybridComposed] = useState<ComposedHybridSession | null>(null);
  const [hybridComposing, setHybridComposing] = useState(false);
  // Where the overview's back button returns to: 'slots' (came from a slot) or
  // 'config' (came from the build-yourself drawer) — never re-opens the drawer
  // when the user arrived via a slot.
  const [overviewBackStep, setOverviewBackStep] = useState<FreeRunStep>('config');
  // Route-preview chrome (MAP_OVERVIEW_CHROME_V1): the workout name shown in the blue
  // OverviewTitleBar. Captured per entry point — slot title from the slot, or a
  // derived aerobic+כוח label from the build-yourself drawer. Default is the neutral
  // focusedRoute name.
  const [overviewTitle, setOverviewTitle] = useState<string>('אימון משולב');
  // Route-preview chrome active = the hybrid overview drawer is up AND the flag is on.
  // Gates the top chrome (search/pills/layers) off and the blue title bar on. Gated on
  // LOCAL freeRunStep (not the store flag) so the swap happens in the same render pass
  // as the drawer mount — no one-frame flash. False when the flag is off → all sites
  // that read it are byte-identical.
  const overviewChromeActive =
    MAP_OVERVIEW_CHROME_V1 && mapMode === 'freeRun' && freeRunStep === 'overview' && !!hybridComposed;
  // Hybrid station exercise detail (tap) + replacement (swap) — the REAL preview drawers.
  const [hybridDetailEx, setHybridDetailEx] = useState<any | null>(null);
  const [hybridSwap, setHybridSwap] = useState<{ segIndex: number; exIndex: number; exercise: any; level: number } | null>(null);
  const { programMap: hybridProgramMap } = useProgramMap();

  // Carousel-config payload — captured when the user taps "Generate" in the
  // drawer so the floating RouteCarousel knows what targetKm to feed into
  // `generateDynamicRoutes`. Stored in DiscoverLayer (not in the carousel
  // itself) so a back-and-forth via the back chip preserves the previous
  // generation context if the user re-enters route mode quickly.
  const [routeCarouselConfig, setRouteCarouselConfig] = useState<{
    targetKm: number;
    includeStrength: boolean;
    surface: 'road' | 'trail';
    /** Opt-in short-target generation — see RouteCarousel's shortRouteMode
     *  prop. Only the step-goal deep-link effect below sets this; the manual
     *  FreeRunDrawer path leaves it undefined (byte-identical to before). */
    shortRouteMode?: boolean;
  } | null>(null);

  // ── Hybrid slot layer state ("מה עושים היום?") — Phase 1, flag-gated ───────
  // EXPLICIT state machine: `freeRunStep` is the single source of truth and is
  // set ONLY by entry handlers (never by an effect racing the mapMode change):
  //   chip / openRun deep-link → 'config' (drawer)
  //   slot entry button        → 'slots'  (passive carousel — NO compose)
  //   card CTA "צא לדרך"        → compose → 'overview'
  //   back / dismiss           → resetHybridFlow(...)
  // slotActivity drives the resolver + the in-layer activity toggle. The
  // resolver + handlers that need userLocation/userCityName are defined lower.
  const [slotActivity, setSlotActivity] = useState<Extract<AerobicKind, 'walking' | 'running'>>('walking');

  // ── Preview-on-settle (READ-ONLY) ──────────────────────────────────────────
  // When the slot carousel settles on a hybrid card, compose its plan and draw
  // the route on the map — the SAME read-only compose the CTA uses, minus any
  // save/run. Cached per slot so revisiting a card is instant and the CTA can
  // reuse the exact composed object (preview == overview == run).
  // CACHE-KEY: slot.id assumes a FIXED intent per slot (true in Phase 1). When
  // build-your-own / per-slot overrides land, the same slot.id can yield
  // different plans → expand the key to include the config/intent (e.g. a hash).
  // Pre-warm caches now live at MODULE scope (hybridPlanCache /
  // hybridRoutePreviewCache / hybridTrioInflight, top of file) so they survive a
  // DiscoverLayer remount — the component refs were wiped on every remount, so the
  // CTA recomposed from scratch. Keys are built via keyFor() below. The light
  // route-preview cache stays SEPARATE from the full-plan cache on purpose: the CTA
  // reuses the full plan verbatim (needs the bolts trio), so a route-only object
  // must never land in it — else the overview would open without options.
  // Race guard: a stale/late preview compose must not draw after the user has
  // already swiped to another card / left the layer (mirrors hybridFlowIdRef). This
  // stays a per-mount ref — it only guards draws within the live component.
  const hybridPreviewFlowIdRef = useRef(0);
  const [hybridPreviewComposing, setHybridPreviewComposing] = useState(false);

  // Activity toggle (walk↔run) changes the composed route while slot.id stays
  // constant. No manual cache clear is needed anymore: the module-cache key
  // (keyFor) already includes slotActivity, so a new activity misses naturally and
  // the next settle recomposes. We only bump the per-mount draw token so a late
  // compose bound to the OLD activity can't repaint the map.
  // (GPS drift is intentionally NOT invalidated — the key rounds to ~110m, so a
  // preview tolerates small jitter; recomposing on every location tick would thrash.)
  useEffect(() => {
    hybridPreviewFlowIdRef.current += 1;
  }, [slotActivity]);

  // Flow token — bumped on every reset so a stale/late composeHybridPlan (e.g.
  // the user dismissed while it was in flight) can't force the overview after a
  // re-entry. Reset drops the composed plan + focused route + step so the entry
  // button always opens a FRESH slot layer, never a leftover overview.
  const hybridFlowIdRef = useRef(0);
  const resetHybridFlow = useCallback((nextStep: FreeRunStep = 'config', opts?: { keepFocusedRoute?: boolean }) => {
    hybridFlowIdRef.current += 1;
    hybridPreviewFlowIdRef.current += 1; // cancel any in-flight preview compose
    setHybridComposing(false);
    setHybridPreviewComposing(false);
    setHybridComposed(null);
    setFreeRunStep(nextStep);
    // route-lost-after-health-declaration bug (10.08.2026 diagnosis): the caller is
    // STARTING the workout, not leaving the flow — focusedRoute is the live prop
    // AppMap reads (FreeRunLayer.tsx → AppMap's focusedRoute prop, gated on
    // `focusedRoute?.id === 'hybrid-route'`) to draw the active-run route/stations.
    // runHybridPlan only writes Zustand (useRunningPlayer/useHybridRun) — nothing
    // ever re-sets focusedRoute afterward — so nulling it here (as every OTHER
    // resetHybridFlow caller correctly does when actually leaving the flow) left
    // the map with nothing to draw once _doStartActiveWorkout finally fired,
    // especially after a JIT delay (health declaration) made the gap visible.
    if (!opts?.keepFocusedRoute) logic.setFocusedRoute(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic]);

  // Only clears stale route-carousel config on (re-)entering free-run mode.
  // Does NOT touch freeRunStep — the entry handlers own that (explicit SM).
  useEffect(() => {
    if (mapMode === 'freeRun') setRouteCarouselConfig(null);
  }, [mapMode]);

  // v2 (enable_home_v2): a generator card tapped → the ONE overview drawer for that
  // route (board M-5e). Cleared whenever the carousel step is left.
  const [routeOverview, setRouteOverview] = useState<Route | null>(null);
  useEffect(() => {
    if (mapMode !== 'freeRun' || freeRunStep !== 'route') setRouteOverview(null);
  }, [mapMode, freeRunStep]);

  // ── Run-invite deep-link: open FreeRunDrawer pre-configured ───────────────
  // Triggered when the guest arrives via /map?openRun=running|walking after
  // tapping the share link. Also consumes pending_run_invite from localStorage
  // to restore partner session context if Zustand was reset (iOS hard-close).
  //
  // Graceful fallback: if localStorage is malformed or membership expired,
  // the drawer still opens — the user can run alone without partner visibility.
  const openRunConsumedRef = useRef(false);
  // Tutorial entry-mechanism fast-follow (06.10.2026) — one-shot guards for
  // the two new geo-branch deep-links. Effects live further down (after
  // mapFeatureFlags is declared, for the hybrid-slots one) — see
  // "openHybridSlots/openDiscover deep-links" below.
  const openHybridSlotsConsumedRef = useRef(false);
  const openDiscoverConsumedRef = useRef(false);
  // Step-goal push deep-link (/map?openRun=walking&targetSteps=N) — separate ref
  // so this can fire on a LATER effect run than the one-time setup below (it
  // needs userLocation, which may not be ready yet on mount; the setup below
  // doesn't). See IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED in config/feature-flags.ts.
  const openRunRoutePreviewFiredRef = useRef(false);
  // v2 (enable_home_v2): a scheduled run started from its group drawer
  // ("צא לריצה") stashes its saved plannedRun for this one navigation; the
  // drawer is pre-filled with it. Kept for the whole free-run visit (the
  // drawer remounts on address/leg round-trips) and dropped when it ends.
  const [scheduledPlannedRun, setScheduledPlannedRun] = useState<PlannedRunSettings | null>(null);
  const prevMapModeRef = useRef(mapMode);
  useEffect(() => {
    if (prevMapModeRef.current === 'freeRun' && mapMode !== 'freeRun') setScheduledPlannedRun(null);
    prevMapModeRef.current = mapMode;
  }, [mapMode]);
  useEffect(() => {
    if (!initialOpenRun) return;

    // Checked BEFORE the one-time setup below, and independently of it, so a
    // same-tick case (userLocation already resolved on mount) still lands on
    // 'route' rather than being overwritten by the setup's own setFreeRunStep
    // ('config') call further down — jumpedToRoute suppresses that call.
    let jumpedToRoute = false;
    if (
      IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED &&
      initialOpenRun === 'walking' &&
      targetSteps &&
      userLocation &&
      !openRunRoutePreviewFiredRef.current
    ) {
      openRunRoutePreviewFiredRef.current = true;
      const targetKm = stepsToTargetKm(Number(targetSteps));
      setRouteCarouselConfig({
        targetKm,
        includeStrength: false,
        surface: 'road',
        shortRouteMode: IS_STEP_GOAL_SHORT_ROUTE_ENABLED,
      });
      setFreeRunStep('route');
      jumpedToRoute = true;
    }

    if (openRunConsumedRef.current) return;
    openRunConsumedRef.current = true;

    // Read-once (also clears a stale/mismatched stash). Only the v2 start
    // action writes it; the drawer prop below is v2-gated as well.
    setScheduledPlannedRun(consumePendingPlannedRun(initialOpenRun));

    // Pre-select host's activity type (default, not locked — user can change it)
    logic.handleActivityChange(initialOpenRun as ActivityType);
    setMapMode('freeRun');
    if (!jumpedToRoute) {
      setFreeRunStep('config'); // deep-link → the drawer (explicit SM)
    }

    // Consume pending_run_invite — restore partner context after Zustand reset (iOS hard-close).
    // Normal navigation path: Zustand already has groupId + membershipReady=true from the
    // session page; in that case we skip to avoid temporarily resetting membershipReady.
    const raw = typeof window !== 'undefined' ? localStorage.getItem('pending_run_invite') : null;
    if (!raw) return;
    localStorage.removeItem('pending_run_invite');
    try {
      const invite = JSON.parse(raw) as {
        groupId?: string;
        attendanceId?: string;
        activityType?: string;
        source?: string;
        token?: string;
      };
      if (invite.source !== 'run-invite' || !invite.groupId || !invite.attendanceId) return;

      const currentState = useSharedSession.getState();
      if (currentState.groupId === invite.groupId && currentState.membershipReady) {
        // Normal navigation — session context was set by the session page; skip.
        return;
      }

      // iOS hard-close restore: Zustand was reset. Restore session context first.
      useSharedSession.getState().joinViaDeepLink(invite.groupId, invite.attendanceId, [], {}, '');

      if (invite.token) {
        // Re-confirm user_memberships idempotently (joinEngine is set+merge+arrayUnion)
        // before opening the presence gate — prevents PERMISSION-DENIED if the write
        // was missed in the previous session lifecycle.
        (async () => {
          try {
            const idToken = await auth.currentUser?.getIdToken();
            if (idToken) {
              await fetch('/api/join/session-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ token: invite.token, groupId: invite.groupId }),
              });
            }
          } catch {
            // Non-fatal: user_memberships was likely written in the previous session.
          } finally {
            useSharedSession.getState().setMembershipReady();
          }
        })();
      } else {
        // Legacy pending_run_invite (no token field): open gate — membership was written
        // by consumeSessionInvitation before pending_run_invite was created.
        useSharedSession.getState().setMembershipReady();
      }
    } catch {
      // Malformed JSON — FreeRunDrawer is already open, just no partner context
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenRun, targetSteps, userLocation]);

  // ── Commute (A-to-B) flow state ───────────────────────────────────────────
  // `commuteRouteConfig` mirrors `routeCarouselConfig` for the commute
  // branch — it captures the destination + label needed to mount
  // RouteCarousel in commute mode. Stored at the layer level (not in
  // useMapStore) so a back-out gesture can clear it locally without
  // racing against any other consumer.
  const [commuteRouteConfig, setCommuteRouteConfig] = useState<{
    destination: { lat: number; lng: number };
    label?: string;
  } | null>(null);

  // ── Commute transport mode (per-session, NOT persisted) ────────────────
  // Daily commutes are activity-agnostic — someone running for fitness
  // in the morning might walk to work in the afternoon. We deliberately
  // do NOT seed this from `useUserStore.preferences.activity` (the
  // free-run default). Instead the commute always boots in 'walking',
  // which is the safest assumption for a navigation flow, and the user
  // taps the inline picker in RouteCarousel to swap mid-search. State
  // lives at the layer level so an entity-card → commute handoff
  // (Park "Navigate" button) starts on the same default and the user
  // gets a consistent UX regardless of how the commute was entered.
  const [commuteActivity, setCommuteActivity] = useState<ActivityType>('walking');

  // Reset the picker to 'walking' whenever a fresh commute begins, so
  // the previous session's choice doesn't bleed into the next one.
  useEffect(() => {
    if (commuteRouteConfig) setCommuteActivity('walking');
  }, [commuteRouteConfig?.destination.lat, commuteRouteConfig?.destination.lng]);

  // SetSavedPlaceSheet host state — null = closed, kind = open for that slot.
  const [setPlaceSheetKind, setSetPlaceSheetKind] = useState<SavedPlaceKind | null>(null);

  // ── v2 search pick (enable_home_v2 only) ──────────────────────────────
  // After a search pick, v2 shows a card first instead of jumping straight
  // into the A→B route cards (address) / RouteDetailSheet (route). Every
  // action on the card hands off to the existing flow. Always null with the
  // flag off, so the SEARCH_PICK screen below never renders there.
  const [searchPick, setSearchPick] = useState<
    | { kind: 'place'; place: SearchDestinationPick }
    | { kind: 'route'; route: Route }
    | null
  >(null);
  // Read by the empty-map-tap effect below (declared before the handlers).
  const searchPickRef = useRef(searchPick);
  searchPickRef.current = searchPick;
  const closeSearchPickRef = useRef<() => void>(() => {});

  // Mirror the commute destination into useMapStore so AppMap can render
  // the destination pin without prop-drilling. SET-ONLY here — the
  // active session needs the pin to remain visible after the user
  // taps a route (mapMode flips back to 'idle'), and the workout
  // engine owns the canonical clear via `finishWorkout`. Explicit
  // user-cancel paths (back button / setCommuteRouteConfig(null) on
  // exit) clear the pin directly via setCommuteDestination(null) so
  // the back-out feels instant.
  useEffect(() => {
    if (mapMode === 'commute' && commuteRouteConfig) {
      useMapStore.getState().setCommuteDestination({
        coords: [commuteRouteConfig.destination.lng, commuteRouteConfig.destination.lat],
        label: commuteRouteConfig.label,
      });
    }
  }, [mapMode, commuteRouteConfig]);

  // ── Tap-empty-map → exit commute ──────────────────────────────────────
  // Field-test feedback: once a destination was picked, the only way
  // back was the small chevron in the carousel header. Users
  // expected the universal Maps gesture — tap empty map to dismiss.
  // AppMap bumps `mapEmptyTapTick` whenever a click misses every
  // interactive feature; we subscribe here and treat the bump as
  // "user is done, drop the commute". Other modes ignore the signal
  // entirely (handled by the conditional inside the effect).
  //
  // Implementation note: we read the tick reactively (not via
  // getState) so React re-runs the effect on every increment; the
  // effect-internal mode check is the gate.
  const mapEmptyTapTick = useMapStore((s) => s.mapEmptyTapTick);
  const lastEmptyTapTickRef = useRef(mapEmptyTapTick);
  useEffect(() => {
    if (mapEmptyTapTick === lastEmptyTapTickRef.current) return;
    lastEmptyTapTickRef.current = mapEmptyTapTick;
    // v2 search pick card — tap on the map dismisses it (same gesture as commute).
    if (searchPickRef.current) {
      closeSearchPickRef.current();
      return;
    }
    if (mapMode === 'commute') {
      // Same teardown as the carousel's onBack — keeps the two exit
      // paths bit-identical so the user never lands in a half-state.
      logic.setFocusedRoute(null);
      setCommuteRouteConfig(null);
      useMapStore.getState().setCommuteDestination(null);
      setMapMode('idle');
      return;
    }
    // Empty-map tap dismisses the discover route carousel → idle, so the
    // BottomJourneyContainer unmounts and the on-map entry button returns
    // (mirrors the slot-layer dismiss below).
    if (mapMode === 'discover') {
      logic.setFocusedRoute(null);
      setMapMode('idle');
      return;
    }
    // Tapping the map (outside a card) dismisses the hybrid slot layer and
    // resets the flow so re-entry always shows fresh slots (never a stale overview).
    if (mapMode === 'freeRun' && freeRunStep === 'slots') {
      resetHybridFlow();
      setMapMode('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapEmptyTapTick, mapMode, freeRunStep]);

  // Pending-commute consumer. Entity cards (ParkPreview /
  // RouteDetailSheet) write to `useMapStore.pendingCommute` when the
  // user taps their Navigate button; we react here, kick off the
  // commute flow, and consume the slot in one go so it can't re-fire
  // on the next render. Same pattern as pendingPartnerOverlay /
  // pendingDeepLink.
  const pendingCommute = useMapStore((s) => s.pendingCommute);
  useEffect(() => {
    if (!pendingCommute) return;
    const target = useMapStore.getState().consumePendingCommute();
    if (!target) return;
    // Close any open entity card so the new commute carousel owns the
    // bottom of the screen (the carousel and entity card share the
    // mid-bottom area and would visually collide otherwise).
    useMapStore.getState().setSelectedPark(null);
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    setCommuteRouteConfig({
      destination: { lat: target.coords[1], lng: target.coords[0] },
      label: target.label,
    });
    setMapMode('commute');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCommute]);

  // Pending-route-start consumer (real-steps-connect plan, Bug 1 fix, 04.09.2026) — same
  // pattern as the pending-commute consumer immediately above, for RouteDetailSheet's "start
  // workout now" affordance instead of "navigate to". Mirrors the ROUTE_CARD screen state's
  // own inline onStartWorkout handler further below (logic.setFocusedRoute + startActiveWorkout)
  // verbatim — this is the same action, just reachable from a sheet opened with no `logic`
  // object of its own (GlobalDetailOverlay.tsx, mounted outside /map).
  const pendingRouteStart = useMapStore((s) => s.pendingRouteStart);
  useEffect(() => {
    if (!pendingRouteStart) return;
    const route = useMapStore.getState().consumePendingRouteStart();
    if (!route) return;
    useMapStore.getState().setSelectedPark(null);
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(route);
    // Explicit route: startActiveWorkout() would read the PREVIOUS focusedRoute from its render closure.
    logic.startActiveWorkoutForRoute(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRouteStart]);

  // ── Partner Finder state machine ──────────────────────────────────────────
  // Three exclusive screens once mapMode === 'partners':
  //   bubbles → radar (transient) → overlay
  // `pendingTab` carries the user's tap intent across the radar interlude
  // so the overlay knows which tab to open with.
  const [partnerTab, setPartnerTab] = useState<'live' | 'scheduled' | null>(null);
  const [showRadar, setShowRadar] = useState(false);
  const [pendingTab, setPendingTab] = useState<'live' | 'scheduled' | null>(null);

  // ── Partner data — lifted here (single source of truth) so the same
  // listener set powers the bubble counts, the radar's `isCached` signal,
  // AND the overlay cards. PartnerOverlay no longer subscribes itself.
  //
  // `effectiveRadius` = user's requested distance from filters, then auto-
  // bumped to 15km when fewer than 3 results show up. The bump happens via
  // a state set inside the effect below, NOT inside `usePartnerData` itself,
  // so we get exactly one re-subscription cycle when expansion fires.
  const requestedDistanceKm = usePartnerFilters((s) => s.distanceKm);

  // Resolved city for the FreeRunDrawer route flow. Same hook that
  // useRouteGeneration consumes — keeps both code paths in sync. We pass
  // `userLocation` so the hook can fall back to a Mapbox reverse-geocode
  // when the user has neither a city affiliation nor an authorityId on
  // their profile (the most common gap for non-gateway entry points).
  const userCityName = useUserCityName(userLocation);

  // Stable module-cache key for a slot at the CURRENT location + activity. Every
  // get/set/has for a slot's pre-warm goes through this so settle and the CTA agree
  // on one key. Recreated when location/activity change (cheap).
  // enable_hybrid_cards_v2: per-slot suffix (park / route / size) so a situation change never
  // reuses a stale warm plan. Filled right after the slots resolve below; '' when the flag is off
  // → the key is byte-identical to before.
  const slotKeySuffixRef = useRef<(slotId: string) => string>(() => '');
  const keyFor = useCallback(
    (slotId: string) => hybridWarmKey(slotId + slotKeySuffixRef.current(slotId), userLocation, slotActivity),
    [userLocation, slotActivity],
  );

  // route_stops carousel card: the composed session's REAL total, read from the settle-preview
  // compose (module cache is not reactive, so the settle handler mirrors the figure here). Keyed by
  // the same warm key, so a location/activity change can never surface a stale number; null until a
  // real session exists → the card shows no time at all.
  const [routeStopsCardTotal, setRouteStopsCardTotal] =
    useState<{ key: string; workoutMin: number; legs: RoundTripLegs | null; calories?: number; stations?: number } | null>(null);
  const noteRouteStopsTotal = useCallback((slotId: string, composed: ComposedHybridSession) => {
    if (slotId !== 'route_stops') return;
    const workoutMin = composedWorkoutMin(composed.plan);
    // Same compose, same moment as the time: calories + stations come from the SAME plan.totals (no new compute).
    setRouteStopsCardTotal(workoutMin == null ? null : { key: keyFor(slotId), workoutMin, legs: composed.roundTrip ?? null, ...composedCardStats(composed.plan) });
  }, [keyFor]);
  const routeStopsTotal = routeStopsCardTotal && routeStopsCardTotal.key === keyFor('route_stops')
    ? cardTotalFor(routeStopsCardTotal.workoutMin, routeStopsCardTotal.legs, readRoundTripPref(), {
        calories: routeStopsCardTotal.calories,
        stations: routeStopsCardTotal.stations,
      })
    : null;

  const { profile } = useUserStore();
  const myGroupIds = profile?.social?.groupIds ?? [];

  // ── Hybrid-slot map flags (wave 1, 08.09.2026) — admin-panel controlled, replacing the
  // old HYBRID_SLOTS_ENABLED/HYBRID_FULL_PARK_WORKOUT_ENABLED/MAP_ROUTE_STOPS_V1 compile
  // constants. Super admins (this hook's own bypass) always see every card, matching the
  // pre-existing compile-time behaviour of always being `true`.
  const isSuperAdmin = profile?.core?.isSuperAdmin === true;
  const { flags: mapFeatureFlags, rawFlags: mapRawFlags, loading: mapFlagsLoading } = useFeatureFlags(isSuperAdmin);

  // v2: a route opened outside the map (GlobalDetailOverlay) arrives here → the ONE
  // route overview drawer (ROUTE_CARD), selected + focused like a tap on the map.
  useRouteOverviewHandoff(mapFeatureFlags.enableHomeV2, (route) => {
    useMapStore.getState().setSelectedPark(null);
    setSearchPick(null);
    logic.setSelectedRoute(route);
    logic.setFocusedRoute(route);
  });

  // ── openHybridSlots / openDiscover deep-links (tutorial entry-mechanism
  // fast-follow, 06.10.2026) ─────────────────────────────────────────────────
  // Fired once from the Welcome drawer's geo-aware second option
  // (home/page.tsx's WelcomeDrawer mount), via /map?openHybridSlots=1 for the
  // "gardens nearby" branch or /map?openDiscover=1 for "routes nearby (no
  // gardens)". Mirrors the openRun deep-link's one-shot-ref shape above, but
  // simpler: unlike openRun/targetSteps, neither trigger needs to wait on
  // userLocation — the hybrid-slots carousel always renders at least
  // aerobic_quick/recommended regardless of GPS (hybrid-slots.ts gates only
  // full_park/route_stops individually on it), and the discover carousel's
  // own render guard (`mapMode === 'discover' && allDisplayRoutes.length > 0`,
  // below) already waits gracefully for routesToDisplay to populate.
  useEffect(() => {
    if (!initialOpenHybridSlots || openHybridSlotsConsumedRef.current) return;
    // Same gate the manual "מה עושים היום?" shimmer button itself uses — if
    // the flag is off, firing this would land on a mode with nothing to show.
    if (!mapFeatureFlags.enableHybridSlots) return;
    openHybridSlotsConsumedRef.current = true;
    resetHybridFlow('slots');
    setMapMode('freeRun');
  }, [initialOpenHybridSlots, mapFeatureFlags.enableHybridSlots, resetHybridFlow]);

  useEffect(() => {
    if (!initialOpenDiscover || openDiscoverConsumedRef.current) return;
    openDiscoverConsumedRef.current = true;
    // Same effective body as handleMapModeChange('discover') further down —
    // inlined here since that function is defined later in this component
    // and every one of its OTHER mode-specific branches is a no-op for
    // 'discover' (verified against its current body).
    useMapStore.getState().setSelectedPark(null);
    setMapMode('discover');
  }, [initialOpenDiscover]);

  // ── Full-park gate signals (Phase 3.1c) ────────────────────────────────────
  // hasStrengthProgram (fixed 09.08.2026): was `activePrograms.length > 0` — the
  // ENROLLED axis, not the ASSESSED one. A user with a program assigned but no
  // completed strength self-assessment fell through to the real 'אימון מלא בפארק'
  // card (composeFullParkWorkout gates safely underneath, but the card itself was a
  // dead end — see feature-flags.ts's STRENGTH_ASSESSMENT_PROMPT_CARD_V1 comment).
  // Now uses hasAssessedStrengthDomain — the SAME assessed-domain check the home page
  // already computes inline under this exact name (home/page.tsx:593-599, byte-
  // identical logic) and the same one composeFullParkWorkout itself gates on
  // (start-hybrid-session.ts:229/615/1033) — so this signal now agrees with what
  // actually decides whether a real workout can be composed, not just whether a
  // program was assigned.
  const hasStrengthProgram = hasAssessedStrengthDomain(profile as any);
  // hasEquippedPark: resolved async from the CACHED all-parks set (same fetchRealParks
  // the map + composer use — stale-while-revalidate), via the pure nearestEquippedPark
  // (Phase 1.1). READ-ONLY; no new fetch cost beyond the shared cache.
  const [hasEquippedPark, setHasEquippedPark] = useState(false);
  useEffect(() => {
    const loc = userLocation;
    if (!loc) { setHasEquippedPark(false); return; }
    let cancelled = false;
    Promise.all([
      import('@/features/parks/core/services/parks.service'),
      import('@/features/workout-engine/hybrid/park-out-and-back'),
    ]).then(async ([{ fetchRealParks }, { nearestEquippedPark }]) => {
      try {
        const parks = await fetchRealParks();
        if (!cancelled) setHasEquippedPark(nearestEquippedPark(loc, parks as any) != null);
      } catch { if (!cancelled) setHasEquippedPark(false); }
    });
    return () => { cancelled = true; };
  }, [userLocation]);

  // ── Hybrid slot resolver + handlers (need userLocation/userCityName) ───────
  // nearbyParkCount stays optimistic (A3 surfaces at the overview via fallbackHint);
  // the full-park card has its OWN hard gate (hasEquippedPark + hasStrengthProgram).
  // UNCHANGED — the rec-engine ranking below never modifies this call or its output.
  const baseSlots = useMemo<HybridSlot[]>(
    () => resolveSlots({
      hasGps: !!userLocation, nearbyParkCount: 1, aerobicKind: slotActivity,
      hasEquippedPark, hasStrengthProgram,
      enableHybridSlots: mapFeatureFlags.enableHybridSlots,
      enableFullParkWorkout: mapFeatureFlags.enableFullParkWorkout,
      enableRouteStops: mapFeatureFlags.enableRouteStops,
      enableRecommendedHybrid: mapFeatureFlags.enableRecommendedHybrid,
    }),
    [
      userLocation, slotActivity, hasEquippedPark, hasStrengthProgram,
      mapFeatureFlags.enableHybridSlots, mapFeatureFlags.enableFullParkWorkout, mapFeatureFlags.enableRouteStops,
      mapFeatureFlags.enableRecommendedHybrid,
    ],
  );

  // ── Situation-aware cards (enable_hybrid_cards_v2) ──────────────────────────
  // Flag on: the carousel is ranked from the user's situation (smart-cards/) and the rec-engine
  // badge flip below is skipped. Flag off: smartHybrid.slots is null and nothing is read.
  const hybridCardsV2 = mapFeatureFlags.enableHybridCardsV2;
  const smartHybrid = useSmartHybridSlots({
    enabled: hybridCardsV2,
    env: {
      hasGps: !!userLocation, nearbyParkCount: 1, aerobicKind: slotActivity,
      hasEquippedPark, hasStrengthProgram,
      enableHybridSlots: mapFeatureFlags.enableHybridSlots,
      enableFullParkWorkout: mapFeatureFlags.enableFullParkWorkout,
      enableRouteStops: mapFeatureFlags.enableRouteStops,
      enableRecommendedHybrid: mapFeatureFlags.enableRecommendedHybrid,
    },
    userLocation,
    profile,
    hasStrengthProgram,
    weatherOn: isWeatherOnFor(mapRawFlags, isSuperAdmin),
    // Budget light mode — the live value (the compose reads the same live flag).
    budgetLight: mapRawFlags.enableBudgetLightMode === true,
  });
  slotKeySuffixRef.current = smartHybrid.keySuffix;

  // ── Rec-engine ranking (additive, plan §"סבב 9") ────────────────────────────
  // MAP_REC_ENGINE_RANKING_V1, added 08.08.2026: this wiring originally shipped without a
  // flag (an oversight — every other piece of this build-out is flag-gated). Retrofitted
  // before real users arrive. Same dependency list as baseSlots above either way — no new
  // re-computation cadence invented. useSuggestionEngineStore dedupes internally
  // (contextKey), so a StrictMode double-fire or overlapping deps changes are safe.
  useEffect(() => {
    if (!MAP_REC_ENGINE_RANKING_V1) return;
    if (!userLocation || !profile) return;
    useSuggestionEngineStore.getState().setContext(
      buildMapUserContext({ profile, userLocation, slotActivity }),
    );
  }, [userLocation, slotActivity, hasEquippedPark, hasStrengthProgram, profile]);

  const rankedSuggestions = useSuggestionEngineStore((s) =>
    MAP_REC_ENGINE_RANKING_V1 && s.status === 'ready' ? s.suggestions : null,
  );

  // Explicit apply — see apply-ranked-slot-order.ts. Falls back to baseSlots UNCHANGED
  // whenever ranking isn't ready/failed/matched nothing (byte-identical to today).
  const slots = useMemo(
    () => smartHybrid.slots ?? applyRankedSlotOrder(baseSlots, rankedSuggestions),
    [smartHybrid.slots, baseSlots, rankedSuggestions],
  );

  // Draw a composed hybrid loop on the LIVE map (READ-ONLY — no save, no run).
  // id MUST be 'hybrid-route': MapShell draws a standalone composed loop ONLY
  // for that id (else just the station marker shows, polyline missing — see
  // MapShell.tsx:350). Used by the settle-preview and the CTA cache-reuse; the
  // overview's own inline draw (composeAndShowOverview) is left byte-identical.
  const drawComposedRoute = useCallback((composed: ComposedHybridSession) => {
    logic.setFocusedRoute({
      id: 'hybrid-route', name: 'אימון משולב', path: composed.routePath,
      distance: composed.plan.totals.distanceKm,
      // Every resolved stop gets its own marker now (Part 5) — `stations` falls back to
      // the single legacy `station` so a caller that hasn't been re-composed still draws one pin.
      stationMarkers: composed.stations ?? (composed.station ? [composed.station] : []),
    } as unknown as Route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic]);

  // Draw a LIGHT route-only preview (full-park settle-preview) — same map shape as
  // drawComposedRoute, but sourced from the route+station+distance preview instead
  // of a fully composed plan (which would require the heavy home-workout trio).
  const drawRoutePreview = useCallback((preview: HybridRoutePreview) => {
    logic.setFocusedRoute({
      id: 'hybrid-route', name: 'אימון משולב', path: preview.routePath,
      distance: preview.distanceKm,
      stationMarkers: preview.stations ?? (preview.station ? [preview.station] : []),
    } as unknown as Route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logic]);

  // Compose a hybrid plan → show the overview. Shared by the drawer's
  // "התחל משולב" and the recommended slot: composes ONCE, then runs the SAME
  // object (no re-compose). fallbackStep = where to return if no route builds.
  const composeAndShowOverview = useCallback((intent: HybridStartIntent, fallbackStep: FreeRunStep = 'config', existingCompose?: Promise<ComposedHybridSession | null>) => {
    // eslint-disable-next-line no-console
    console.log('[compose-trigger]', existingCompose ? 'await-inflight-compose' : 'composeAndShowOverview', 'from=', fallbackStep, 'kind=', intent.aerobicKind);
    const flowId = ++hybridFlowIdRef.current; // this compose owns the flow
    setHybridComposing(true);
    // AWAIT an already-running compose (settle-preview / background prewarm) when
    // one is handed in — never start a duplicate composeHybridPlan. Otherwise
    // start a fresh compose. `startRun` wires the real run at RUN time; it is
    // never baked into the returned session, so awaiting a read-only prewarm
    // (startRun: no-op) is byte-identical to the cache-hit path.
    const composeP: Promise<ComposedHybridSession | null> = existingCompose
      ?? import('@/features/workout-engine/hybrid/start-hybrid-session').then(({ composeHybridPlan }) =>
        composeHybridPlan(intent, {
          userPosition: userLocation,
          cityName: userCityName,
          startRun: logic.startActiveWorkout,
        }));
    composeP.then((composed) => {
      // Dismissed / superseded while composing → drop this result silently.
      if (hybridFlowIdRef.current !== flowId) return;
      setHybridComposing(false);
      if (!composed) { setFreeRunStep(fallbackStep); return; }
      // Show the generated route on the LIVE map behind the peekable overview;
      // carry the station location so MapShell drops a marker on it.
      logic.setFocusedRoute({
        id: 'hybrid-route', name: 'אימון משולב', path: composed.routePath,
        distance: composed.plan.totals.distanceKm,
        stationMarkers: composed.stations ?? (composed.station ? [composed.station] : []),
      } as unknown as Route);
      console.log(
        `[hybrid:diag] route drawn → setFocusedRoute pts=${composed.routePath.length}` +
        ` station=${composed.station ? `${composed.station.lat.toFixed(5)},${composed.station.lng.toFixed(5)}` : 'none(A3)'}`,
      );
      setOverviewBackStep(fallbackStep);
      setHybridComposed(composed);
      setFreeRunStep('overview');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, userCityName, logic]);

  // Compose a slot's FULL trio, de-duped by cache key: if a compose is already
  // in-flight for this key, return THAT promise instead of starting a second one.
  // Caches the result in hybridPlanCache (module scope) on success and clears the
  // in-flight entry when it settles. Read-only (startRun no-op) — both the settle
  // preview and the eager settle warm fill the SAME cache the CTA reuses.
  const composeTrioDeduped = useCallback((intent: HybridStartIntent, slotId: string): Promise<ComposedHybridSession | null> => {
    const key = keyFor(slotId);
    const existing = hybridTrioInflight.get(key);
    if (existing) return existing;
    const p = import('@/features/workout-engine/hybrid/start-hybrid-session').then(({ composeHybridPlan }) =>
      composeHybridPlan(intent, { userPosition: userLocation, cityName: userCityName, startRun: () => {} }));
    hybridTrioInflight.set(key, p);
    p.then((composed) => { if (composed) capMapInsert(hybridPlanCache, key, composed); })
      .catch(() => { /* callers treat as null */ })
      .finally(() => { if (hybridTrioInflight.get(key) === p) hybridTrioInflight.delete(key); });
    return p;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, userCityName, keyFor]);

  // PERF (13.10.2026): compose route_stops in the background once the slots carousel is up AND the
  // main thread is idle — not on the CTA tap, not 300ms after settle, and not on raw mount — so its
  // ~1.3s runs while the user is still looking at the map without competing with first paint. The
  // compose itself starts with warm / parks / published routes / exercises / equipment, so those are
  // warmed by the same call. Runs once per (user, location bucket, activity, step-gap) key: the effect
  // depends on the key STRING (not the GPS object), and it bails when the module cache already holds
  // the plan or a compose for that key is in flight — so it never duplicates the settle-preview
  // compose (which awaits the same in-flight promise via composeTrioDeduped) or the CTA's. The
  // result is also mirrored into the card's total so the pill can appear before the user settles.
  const routeStopsSlot = useMemo(
    () => slots.find((s) => s.kind === 'hybrid' && s.id === 'route_stops') ?? null,
    [slots],
  );
  const carouselUp = mapFeatureFlags.enableHybridSlots && mapMode === 'freeRun' && freeRunStep === 'slots';
  // "Focused suggestions" (MAP_OVERVIEW_CHROME_V1): while the slot-suggestion carousel is up, the top
  // chrome (mode pills, search bar, layers control, "+" FAB, AppHeader) is HIDDEN — not removed — and the
  // OverviewTitleBar ("הצעות מסלולים") takes its place; its → is BACK to the full map, which restores
  // everything. Derived from the same state as the carousel (no new state machine). Flag off → false.
  const suggestionsFocused = MAP_OVERVIEW_CHROME_V1 && carouselUp;
  // (curatedFocused / chromeFocused / topChromeFolded are derived below, once allDisplayRoutes exists.)
  const routeStopsKey = keyFor('route_stops');
  useEffect(() => {
    if (!HYBRID_SLOT_PREVIEW_ENABLED || !carouselUp || !routeStopsSlot || routeStopsSlot.kind !== 'hybrid' || !userLocation) return;
    // Deferred to browser IDLE (requestIdleCallback, ≤3s ceiling; ~600ms timer on iOS WKWebView which
    // has no rIC) so the compose yields to the map's first paint + GPS init instead of competing with
    // them. A GPS fix is required above (userLocation) — no fix, no compose. The guards are re-checked
    // when the idle callback actually fires, since the settle-preview / CTA may have started or finished
    // the same compose in the meantime. Cleanup cancels a pending run if the key/carousel changes first.
    return scheduleIdle(() => {
      const cached = hybridPlanCache.get(routeStopsKey);
      if (cached) { noteRouteStopsTotal('route_stops', cached); return; }
      if (hybridTrioInflight.has(routeStopsKey)) return; // someone else (settle-preview) is already composing it
      composeTrioDeduped(presetToIntent(routeStopsSlot.preset, routeStopsSlot.timeBudgetMin), 'route_stops')
        .then((composed) => { if (composed) noteRouteStopsTotal('route_stops', composed); })
        .catch(() => { /* a failed warm compose is silent; the settle/CTA path retries on demand */ });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselUp, routeStopsSlot, routeStopsKey]);

  // READ-ONLY preview: when the carousel SETTLES on a hybrid card, compose its
  // plan (cached per slot.id) and draw the route on the map — the SAME compose
  // the CTA runs, minus ANY save/run. This path NEVER calls runHybridPlan /
  // finishHybrid / saveWorkout — it only composeHybridPlan()s + draws. A
  // non-hybrid (aerobic_quick) card has no guided route → clear the map.
  const handleSettleSlot = useCallback((slot: HybridSlot) => {
    if (!HYBRID_SLOT_PREVIEW_ENABLED) return;
    // Every settle invalidates any in-flight preview compose (fast-swipe guard).
    const flowId = ++hybridPreviewFlowIdRef.current;
    if (slot.kind !== 'hybrid') {
      setHybridPreviewComposing(false);
      logic.setFocusedRoute(null);
      return;
    }
    // full_park_workout: draw the ROUTE ONLY on settle. Its full compose builds a
    // 3-workout home trio (generateHomeWorkoutTrio) that the map never needs to
    // draw — so the settle-preview runs only the fast half (route + station) via
    // composeFullParkRoutePreview, and the heavy trio is deferred to the CTA
    // (handleSelectSlot → overview). Uses the SEPARATE light cache so it never
    // poisons the full-compose cache the CTA reuses.
    if (slot.preset.mode === 'full_park_workout') {
      const intent = presetToIntent(slot.preset, slot.timeBudgetMin);
      // Route drawn → warm the FULL trio EAGERLY (was requestIdleCallback, which
      // starved under render churn so the trio wasn't ready at tap-time).
      // composeTrioDeduped is deduped + caches into hybridPlanCache, so an early
      // "צא לדרך" awaits THIS promise. The dynamic import() yields before any heavy
      // work, so the route paint above is not blocked.
      const warmTrio = () => composeTrioDeduped(intent, slot.id).then((composed) => {
        if (hybridPreviewFlowIdRef.current !== flowId || !composed) return;
        // eslint-disable-next-line no-console
        console.log('[compose-trigger]', 'prewarm-ready', slot.id);
      });
      const cachedRoute = hybridRoutePreviewCache.get(keyFor(slot.id));
      if (cachedRoute) {
        setHybridPreviewComposing(false);
        drawRoutePreview(cachedRoute);
        warmTrio();
        return;
      }
      setHybridPreviewComposing(true);
      import('@/features/workout-engine/hybrid/start-hybrid-session').then(async ({ composeFullParkRoutePreview }) => {
        const preview = await composeFullParkRoutePreview(intent, {
          userPosition: userLocation,
          cityName: userCityName,
          startRun: () => {}, // preview NEVER starts a session (read-only)
        });
        // Superseded (user swiped away / left the layer) → drop silently, no draw.
        if (hybridPreviewFlowIdRef.current !== flowId) return;
        setHybridPreviewComposing(false);
        if (!preview) return; // no equipped park / no position → leave map as-is
        capMapInsert(hybridRoutePreviewCache, keyFor(slot.id), preview);
        drawRoutePreview(preview);
        warmTrio();
      });
      return;
    }

    // Regular hybrid (walk+strength budget-split): full compose on settle — now
    // fast (maxRoutes:1, single loop, no 1.5s chain) — cached for CTA reuse.
    const cached = hybridPlanCache.get(keyFor(slot.id));
    if (cached) {
      setHybridPreviewComposing(false);
      drawComposedRoute(cached);
      noteRouteStopsTotal(slot.id, cached);
      return;
    }
    setHybridPreviewComposing(true);
    // Register the compose as in-flight (composeTrioDeduped) so an early "צא לדרך"
    // tap AWAITS it rather than starting a duplicate; it also caches on success.
    composeTrioDeduped(presetToIntent(slot.preset, slot.timeBudgetMin), slot.id).then((composed) => {
      // Superseded (user swiped away / left the layer) → drop silently, no draw.
      if (hybridPreviewFlowIdRef.current !== flowId) return;
      setHybridPreviewComposing(false);
      if (!composed) return; // compose failed → leave the map as-is (never crash)
      drawComposedRoute(composed);
      noteRouteStopsTotal(slot.id, composed);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, userCityName, logic, drawComposedRoute, drawRoutePreview, composeTrioDeduped, keyFor, noteRouteStopsTotal]);

  // Slot selection: hybrid → compose→overview; aerobic_quick → start now (skip overview).
  const handleSelectSlot = useCallback((slot: HybridSlot) => {
    // eslint-disable-next-line no-console
    console.log('[compose-trigger]', 'handleSelectSlot', slot.kind, slot.id);
    // assessment_prompt (STRENGTH_ASSESSMENT_PROMPT_CARD_V1): no compose at all — close the
    // carousel and hand off straight to the mini assessment. Domain fallback ('push') mirrors
    // the SAME default the overview's onAssessmentLink already uses above (:1532) — this slot
    // has no specific assessmentDomains to point to either (the user has no program at all).
    if (slot.kind === 'assessment_prompt') {
      resetHybridFlow();
      setMapMode('idle');
      // Return-point fix (David, 24.09.2026): explicit returnTo instead of
      // the default window.location.pathname fallback — no specific route
      // is in play here (resetHybridFlow already cleared it), so plain
      // '/map' (matching the idle mode we just set) is the correct target.
      startMiniDomainAssessment(router, 'push', '/map');
      return;
    }
    if (slot.kind === 'hybrid') {
      // Route-preview title bar (MAP_OVERVIEW_CHROME_V1): show the slot's own name
      // (e.g. "ריצה + כוח" / "אימון מלא בפארק"). Harmless no-op when the flag is off.
      setOverviewTitle(slot.title);
      // CTA cache-reuse (ADDITIVE): if the settle-preview already composed this
      // slot, reuse that EXACT object → no re-compose, and overview/run show
      // precisely the previewed route (the generator randomises, so a second
      // compose would differ). Cancel any in-flight preview REDRAW so a late
      // result can't repaint the map. The no-cache path awaits the de-duped
      // compose (composeTrioDeduped) rather than starting a fresh one.
      hybridPreviewFlowIdRef.current += 1;
      const cached = hybridPlanCache.get(keyFor(slot.id));
      if (cached) {
        setHybridPreviewComposing(false);
        drawComposedRoute(cached);
        setOverviewBackStep('slots');
        setHybridComposed(cached);
        setFreeRunStep('overview');
        return;
      }
      // Not cached yet → AWAIT the DE-DUPED compose. composeTrioDeduped returns
      // the settle-preview / prewarm compose if one is already in-flight, else it
      // starts one and REGISTERS it — so this covers both races: (a) tapping while
      // a prewarm runs, and (b) tapping in the idle gap before prewarm starts (the
      // CTA's own compose is now registered, so the later prewarm reuses it instead
      // of composing a second time). This is the fix for the double [compose-trigger].
      const trio = composeTrioDeduped(presetToIntent(slot.preset, slot.timeBudgetMin), slot.id);
      composeAndShowOverview(presetToIntent(slot.preset, slot.timeBudgetMin), 'slots', trio);
      return;
    }
    // Aerobic quick-start — the session mode is read synchronously from
    // useRunningPlayer.activityType in _doStartActiveWorkout, so set it on the
    // store BEFORE start. Clear any guided route, then launch immediately.
    useRunningPlayer.getState().setActivityType(slot.aerobicKind);
    logic.setFocusedRoute(null);
    // health-declaration-covered-by-card bug: startActiveWorkout below may open
    // JITSetupModal (z-[90]) — dismiss the still-mounted HybridSlotCarousel
    // (z-[100]) FIRST, same pattern as the carousel's own working close button
    // (onClose={() => { resetHybridFlow(); setMapMode('idle'); }} above).
    resetHybridFlow();
    setMapMode('idle');
    logic.startActiveWorkout();
  }, [composeAndShowOverview, composeTrioDeduped, drawComposedRoute, logic, keyFor, resetHybridFlow, router]);

  const [effectiveRadius, setEffectiveRadius] = useState(requestedDistanceKm);

  // Reset the effective radius whenever the user explicitly changes the
  // filter — otherwise an earlier auto-bump would stick around forever.
  useEffect(() => {
    setEffectiveRadius(requestedDistanceKm);
  }, [requestedDistanceKm]);

  const { live, scheduled, isLoading } = usePartnerData(userLocation, effectiveRadius, myGroupIds);

  useEffect(() => {
    const total = live.length + scheduled.length;
    const next = total < 3 && effectiveRadius < 15 ? 15 : effectiveRadius;
    if (next !== effectiveRadius) setEffectiveRadius(next);
  }, [live, scheduled, effectiveRadius]);

  // Reset partner sub-state whenever the user leaves the partners mode.
  useEffect(() => {
    if (mapMode !== 'partners') {
      setPartnerTab(null);
      setShowRadar(false);
      setPendingTab(null);
    }
  }, [mapMode]);

  const handleBubbleSelect = (tab: 'live' | 'scheduled') => {
    setPendingTab(tab);
    setShowRadar(true);
  };

  const handleRadarComplete = () => {
    setShowRadar(false);
    setPartnerTab(pendingTab);
    setPendingTab(null);
  };

  const handlePartnerOverlayClose = () => {
    setPartnerTab(null);
    setShowRadar(false);
    setPendingTab(null);
    setMapMode('idle');
  };

  // ── Continuous filter sync ──
  // Mirror `usePartnerFilters.liveActivity` → `useMapStore.partnerActivityFilter`
  // on every change so that map markers AND the heatmap re-filter in
  // real-time as the user taps pills inside PartnerOverlay or
  // PartnerFilterSheet. The previous mount-only `onFiltersChange` bridge
  // synced just once when the overlay opened, so subsequent pill taps
  // updated the partner-finder list but left the map in a stale state.
  // This effect subscribes to the store via React, so every `setLiveActivity`
  // call (from `PartnerFilterBar`, smart defaults, or anywhere else) reaches
  // the map store within the next render commit.
  const liveActivityFilter = usePartnerFilters((s) => s.liveActivity);
  useEffect(() => {
    useMapStore.getState().setPartnerActivityFilter(liveActivityFilter);
  }, [liveActivityFilter]);

  // Retained as a stable no-op identity so the existing `onFiltersChange`
  // prop signature on PartnerOverlay continues to compile. The continuous
  // sync above is now the source of truth — this callback is intentionally
  // empty and can be removed once the prop is dropped.
  const handlePartnerFiltersChange = useCallback((_filter: LiveActivityFilter) => {
    // no-op — see continuous sync effect above
  }, []);

  // ── ONE-TIME RESET — fires only on first session mount, not on every React
  // remount, so back-navigation and deep-link state are preserved across renders.
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    logic.setNavigationVariants({ recommended: null, scenic: null, facilityRich: null });
    logic.setNavState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cross-screen handoff — entry-points outside /map (e.g. WorkoutPreviewDrawer)
  // can request the partner overlay opens directly by setting an intent on
  // useMapStore right before navigating here. Consumed exactly once on mount.
  // We jump straight past the radar/bubbles transient — the user already
  // expressed clear intent on the previous screen.
  useEffect(() => {
    const intent = useMapStore.getState().consumePendingPartnerOverlay();
    if (!intent) return;
    setMapMode('partners');
    setPartnerTab(intent.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── BODY OVERFLOW LOCK — prevent scroll-through when searching ──
  useEffect(() => {
    if (logic.navState === 'searching') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [logic.navState]);

  // ── Bridge into commute mode ──────────────────────────────────────────
  // Funnel any "go to this destination" intent through a single helper so
  // the three entry points stay consistent:
  //   1. Generic Mapbox address picked from search.
  //   2. Saved Home/Work shortcut tapped (synthesised as a 'mapbox' source).
  //   3. (Phase 2) Park/Route entity card "Navigate" buttons.
  //
  // Always: clear the route selection slot, idle the search overlay,
  // capture the destination, flip mapMode='commute' so RouteCarousel
  // mounts. The carousel itself drives the rest.
  const startCommute = useCallback(
    (target: { coords: [number, number]; label?: string }) => {
      const [lng, lat] = target.coords;
      logic.setSelectedRoute(null);
      logic.setFocusedRoute(null);
      setCommuteRouteConfig({ destination: { lat, lng }, label: target.label });
      setMapMode('commute');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ── v2 search pick card helpers (enable_home_v2) ──────────────────────
  const searchV2 = mapFeatureFlags.enableHomeV2;

  const closeSearchPick = useCallback(() => {
    const pick = searchPickRef.current;
    if (!pick) return;
    if (pick.kind === 'place') useMapStore.getState().setCommuteDestination(null);
    else logic.setFocusedRoute(null);
    setSearchPick(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  closeSearchPickRef.current = closeSearchPick;

  /** Show the destination card for an address / street / place pick. */
  const openPlacePick = (addr: { text: string; coords: [number, number]; placeType?: SearchDestinationPick['placeType'] }) => {
    const [lng, lat] = addr.coords;
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    setSearchPick({ kind: 'place', place: { text: addr.text, coords: addr.coords, placeType: addr.placeType } });
    // Same pin the commute flow shows (DestinationMarker), and a flat camera
    // move that frames the user + the place (or just the place).
    useMapStore.getState().setCommuteDestination({ coords: addr.coords, label: addr.text });
    const me = logic.currentUserPos;
    if (me && Number.isFinite(me.lat) && Number.isFinite(me.lng)) {
      useMapStore.getState().setTurnFlyToTarget({
        kind: 'fitBounds',
        bounds: [
          [Math.min(me.lng, lng), Math.min(me.lat, lat)],
          [Math.max(me.lng, lng), Math.max(me.lat, lat)],
        ],
        bearing: 0,
        pitch: 0,
        maxZoom: 16,
      });
    } else {
      useMapStore.getState().setTurnFlyToTarget({ kind: 'flyTo', center: addr.coords, bearing: 0, zoom: 15, pitch: 0 });
    }
  };

  /** Show the v2 route card; the route is focused (drawn + framed) like today's pick. */
  const openRoutePick = (route: Route) => {
    useMapStore.getState().setCommuteDestination(null);
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(route);
    setSearchPick({ kind: 'route', route });
  };

  const handleAddressSelect = async (addr: any) => {
    // v2: an official-route pick opens the v2 route card (route focused on
    // the map) instead of RouteDetailSheet — the card's "פרטי המסלול" still
    // opens that sheet. Same search teardown logic.handleAddressSelect does.
    if (searchV2 && addr?._source === 'route' && addr?._id) {
      logic.setSearchQuery('');
      logic.setSuggestions([]);
      // setNavState('idle') also clears selected/focused route — call it first.
      logic.setNavState('idle');
      const route = await findOfficialRouteById(addr._id).catch(() => null);
      if (route) openRoutePick(route);
      if (Array.isArray(addr?.coords) && addr?.text) {
        useRecentSearchesStore.getState().pushRecent({
          text: addr.text,
          coords: addr.coords as [number, number],
          source: 'route',
          id: addr._id,
        });
      }
      return;
    }

    // Run the legacy hook first — it handles park / route / mapbox
    // suggestion sources (clears search, opens entity cards, etc.).
    await logic.handleAddressSelect(addr);

    // ── Recent-searches sync ──────────────────────────────────────
    // Persist EVERY successful pick (park / route / mapbox) so the
    // search overlay's "חיפושים אחרונים" list reflects the user's real
    // history. The store dedups + caps internally so repeated taps on
    // the same entry are safe. Saved-place picks route through the
    // NavigationHub's own Quick Actions grid and are not double-listed
    // here to keep the recents list uncluttered.
    if (addr?._source !== 'savedPlace' && Array.isArray(addr?.coords) && addr?.text) {
      const sourceForRecent: 'park' | 'route' | 'mapbox' =
        addr._source === 'park' || addr._source === 'route' ? addr._source : 'mapbox';
      useRecentSearchesStore.getState().pushRecent({
        text: addr.text,
        coords: addr.coords as [number, number],
        source: sourceForRecent,
        // v2 keeps the park / route id so the recent can reopen its card.
        ...(searchV2 && sourceForRecent !== 'mapbox' && addr._id ? { id: addr._id as string } : {}),
      });
    }

    // Generic-address & savedPlace suggestions are the commute trigger.
    // Park / route hits open their entity card via logic.handleAddressSelect
    // and we MUST NOT re-fire commute on top of that. `recent` is also
    // a commute trigger (replayed generic addresses).
    const isCommuteTrigger =
      addr?._source === 'mapbox' ||
      addr?._source === 'savedPlace' ||
      !addr?._source;
    if (isCommuteTrigger && Array.isArray(addr?.coords)) {
      // Leg-plan composition (ג' Phase 1, 08.08) intercepts here — same
      // trigger set as commute, different destination. LegPlanSheet sets
      // isComposing=true just before exiting to NavigationHub, so this is
      // the one place that needs to know "who asked for this pick".
      // NOTE: a park/route pick while composing is NOT added as a leg —
      // it opens that entity's own card instead (logic.handleAddressSelect
      // above already did that), same pre-existing limitation
      // onRequestAddressDestination has today. Not solved here.
      const legPlan = useLegPlanStore.getState();
      const pendingAddr = usePendingAddressStore.getState();
      if (legPlan.isComposing) {
        const [lng, lat] = addr.coords as [number, number];
        legPlan.addLeg({ lat, lng }, addr.text);
        // Return to the free-run drawer — FreeRunDrawer's lazy legPlanOpen
        // init reads isComposing and reopens LegPlanSheet automatically,
        // showing the newly-added stop. freeRunStep is untouched local
        // DiscoverLayer state, so it's still 'config' from before the exit.
        setMapMode('freeRun');
      } else if (pendingAddr.isComposing) {
        // Address-destination pick (09.08 revision, David's 2nd-round UX
        // fix) — no longer commutes immediately. onRequestAddressDestination
        // below arms isComposing before opening search, exactly mirroring
        // the leg-plan branch above, but stashes into the SEPARATE
        // usePendingAddressStore instead of adding a leg (the two flows are
        // deliberately not merged yet — David explicitly deferred that).
        const [lng, lat] = addr.coords as [number, number];
        pendingAddr.setPending({ lat, lng, label: addr.text });
        // Return to the free-run drawer — FreeRunDrawer's lazy goalSheetOpen
        // init reads isComposing and reopens GoalSheet automatically,
        // showing the pending address with confirm/cancel actions.
        setMapMode('freeRun');
      } else if (searchV2) {
        // v2: the destination card first (navigate / run / walk / save).
        openPlacePick({ text: addr.text, coords: addr.coords as [number, number], placeType: addr.placeType });
      } else {
        // Plain top-search-bar / other entry points untouched by either
        // flow above — still commutes immediately, exactly as before.
        startCommute({ coords: addr.coords as [number, number], label: addr.text });
      }
    }
  };

  // NavigationHub props — only the search-overlay slice is needed now.
  // The legacy navigation-variant props (navigationVariants / selectedVariant
  // / etc.) were dropped from the required prop set when NavigationHub's
  // 'navigating' branch was removed. They're left out here on purpose.
  const navHubProps = {
    navState: logic.navState,
    onStateChange: logic.setNavState,
    searchQuery: logic.searchQuery,
    onSearchChange: logic.setSearchQuery,
    suggestions: logic.suggestions,
    onAddressSelect: handleAddressSelect,
    isSearching: logic.isSearching,
    inputRef: logic.searchInputRef,
    onSetSavedPlace: (kind: SavedPlaceKind) => setSetPlaceSheetKind(kind),
    userPos: logic.currentUserPos ?? null,
  } as const;

  // ── Community enrichment — reactive via onSnapshot ──
  const rawDisplayRoutes = logic.routesToDisplay || [];
  const routeIds = useMemo(() => rawDisplayRoutes.map((r) => r.id), [rawDisplayRoutes]);
  const { enrichRoutes } = useCommunityEnrichment(routeIds, rawDisplayRoutes);
  const allDisplayRoutes = useMemo(() => enrichRoutes(rawDisplayRoutes), [enrichRoutes, rawDisplayRoutes]);
  const hasNearbyRoutes = allDisplayRoutes.length > 0;
  // Curated "גלה מסלולים" focused state — SAME mechanism as the hybrid focused suggestions above (one
  // `chromeFocused` flag drives: top chrome folded, "+" FAB hidden, MapShell AppHeader folded via the store
  // flag, the "הצעות מסלולים" back title bar). Derived, not a new state machine: discover mode with the
  // carousel up (routes loaded) and a focused route. Back = handleMapModeChange('idle') (the existing
  // mode-chip dismiss), which restores everything.
  const curatedFocused = MAP_OVERVIEW_CHROME_V1 && mapMode === 'discover' && allDisplayRoutes.length > 0 && !!logic.focusedRoute;
  const chromeFocused = suggestionsFocused || curatedFocused;
  const topChromeFolded = overviewChromeActive || chromeFocused;
  const setIsSuggestionsFocused = useMapStore((s) => s.setIsSuggestionsFocused);
  useEffect(() => {
    setIsSuggestionsFocused(chromeFocused);
    return () => setIsSuggestionsFocused(false);
  }, [chromeFocused, setIsSuggestionsFocused]);
  // Route-marker-click crash fix (12.10.2026): BottomJourneyContainer's own
  // echo-guard effect depends on `routes` by reference — if anything
  // upstream (enrichRoutes/enrichmentMap, a Firestore listener re-firing,
  // etc.) ever hands back a NEW array identity for the SAME route ids, that
  // effect re-runs on every such parent render, not only on a genuine
  // focusedRouteId change. Re-keying on the route-id signature here
  // guarantees BottomJourneyContainer sees a referentially stable `routes`
  // array whenever the actual route SET hasn't changed, regardless of how
  // many intermediate hooks recompute their own output. Trade-off, accepted
  // deliberately: if a route's own CONTENT changes (e.g. enrichRoutes
  // attaching a new linkedSessions value) without the id list itself
  // changing, the carousel keeps the previous object until the id list next
  // changes — acceptable staleness for a live-session-count field, not
  // worth reintroducing the reference churn this exists to eliminate.
  const carouselRoutesKey = allDisplayRoutes.map((r) => r.id).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableCarouselRoutes = useMemo(() => allDisplayRoutes, [carouselRoutesKey]);

  // ── Initial discover fit + auto-focus ──
  // The first time the user lands in discover mode with routes loaded we
  // want the camera to fit ALL routes (not just the first one). The actual
  // fit-all is owned by `useCameraController` (it sees `mapMode === 'discover'`
  // and runs once); this layer is only responsible for picking the focused
  // route AFTER the initial fit completes so the carousel has an active card.
  //
  // The ref guards against re-firing the auto-focus on remounts/route refreshes
  // within the same discover session, and is reset on leaving discover so
  // re-entry behaves like a fresh session.
  const initialDiscoverFitRef = useRef(false);

  useEffect(() => {
    if (mapMode !== 'discover') {
      initialDiscoverFitRef.current = false;
    }
  }, [mapMode]);

  useEffect(() => {
    if (
      mapMode === 'discover' &&
      allDisplayRoutes.length > 0 &&
      !logic.focusedRoute &&
      !initialDiscoverFitRef.current
    ) {
      initialDiscoverFitRef.current = true;
      // The camera controller pre-marks this id as already-fitted (via its
      // hasDoneInitialDiscoverFit pass) so this setFocusedRoute call does NOT
      // trigger a second fitBounds on top of the fit-all.
      logic.setFocusedRoute(allDisplayRoutes[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode, allDisplayRoutes.length]);

  // ── Handle mode changes ──
  const handleMapModeChange = (mode: MapMode) => {
    // Any mode chip dismisses a selected park — otherwise selectedPark keeps the
    // Screen SM pinned to PARK_CARD and the chip's surface never appears.
    useMapStore.getState().setSelectedPark(null);
    setMapMode(mode);
    // Entering free-run via the mode chip → the drawer (explicit SM; the slot
    // entry button sets 'slots' itself).
    if (mode === 'freeRun') setFreeRunStep('config');
    if (mode !== 'discover') {
      logic.setFocusedRoute(null);
      logic.setSelectedRoute(null);
      // Clear viewport search so proximity filter resumes in any non-discover mode.
      useMapStore.getState().setViewportSearchActive(false);
    }
    // Skip PartnerBubbles entirely — go straight to radar on every entry.
    if (mode === 'partners') {
      setPendingTab('live');
      setShowRadar(true);
    }
  };

  // Tap "חפש באזור זה" → activate viewport search and switch to discover mode.
  const handleSearchArea = useCallback(() => {
    useMapStore.getState().setViewportSearchActive(true);
    // Suppress the auto-fit-all camera animation that fires on first discover
    // entry — the user already positioned the map where they want to search.
    initialDiscoverFitRef.current = true;
    // Reset baseline so button reappears only after the next pan.
    if (viewportBounds) refBoundsRef.current = viewportBounds;
    setMapMode('discover');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportBounds]);

  // ── THE LAW: SINGLE SCREEN STATE ──
  const selectedPark = useMapStore((s) => s.selectedPark);
  const mapGlobalSheet = useMapStore((s) => s.globalSheet);
  type Screen = 'SEARCH' | 'NAV' | 'ROUTE_CARD' | 'PARK_CARD' | 'SEARCH_PICK' | 'COMMUTE' | 'DISCOVERY';
  const screen: Screen = (() => {
    if (logic.navState === 'searching') return 'SEARCH';
    // 'navigating' is now a no-op (NavigationHub returns null on this
    // state). Kept in the union for backwards compat — falls through.
    if (logic.navState === 'navigating') return 'NAV';
    if (logic.selectedRoute) {
      // A route card tap can arrive while a drawer mode (FreeRun /
      // Partners / Commute) is open. Clear the local drawer mode so its
      // overlay doesn't linger behind the sheet.
      if (mapMode !== 'idle' && mapMode !== 'discover') setMapMode('idle');
      return 'ROUTE_CARD';
    }
    // selectedPark is its own exclusive screen (mirrors ROUTE_CARD) so a park
    // card can NEVER co-exist with the entry button / slot carousel / free-run
    // surfaces (all under DISCOVERY). Selecting a park replaces them; closing it
    // (ParkPreview's × → setSelectedPark(null)) returns to DISCOVERY → the entry
    // button reappears. General fix — intentionally applies with the hybrid flag
    // OFF too (the park↔free-run mixing predates the flag).
    if (selectedPark) {
      if (mapMode !== 'idle' && mapMode !== 'discover') setMapMode('idle');
      return 'PARK_CARD';
    }
    // v2 search pick card — only over the plain map (any drawer mode wins
    // and the effect below drops the stale pick).
    if (searchPick && mapMode === 'idle') return 'SEARCH_PICK';
    if (mapMode === 'commute' && commuteRouteConfig) return 'COMMUTE';
    return 'DISCOVERY';
  })();

  // A park / route card or any drawer mode replaces the v2 pick card — drop
  // it so it never resurfaces stale when that surface closes.
  useEffect(() => {
    if (!searchPick) return;
    if (selectedPark || logic.selectedRoute || mapMode !== 'idle') {
      if (searchPick.kind === 'place' && mapMode !== 'commute') useMapStore.getState().setCommuteDestination(null);
      setSearchPick(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPark, logic.selectedRoute, mapMode]);

  // ── Shared top bar: glassmorphic search + saved-places quick row + mode pills ──
  function renderTopBar() {
    // Keep the search bar (z-[70]) + mode chips out of the loading splash —
    // they sit ABOVE the z-[50] skeleton, so without this they poke through.
    if (!isMapVisuallyReady) return null;
    // UX polish (14.08.2026): collapse the top bar once free-run's generated
    // routes are on screen (RouteCarousel, freeRunStep === 'route'), giving
    // the map + route cards more room. Expands again the moment the user
    // returns to input (freeRunStep leaves 'route' — editing, dismissing, a
    // new search). Scoped to free-run only: commute deliberately keeps its
    // top bar visible (see the COMMUTE case's own comment — "so the user can
    // change their destination at any time"), and ambient discover-mode
    // nearby routes (hasNearbyRoutes) aren't part of this input→generate
    // flow, so they're untouched. Same slide+fade shape as OverviewTitleBar's
    // existing chrome-swap above, for visual consistency.
    const topBarCollapsed = mapMode === 'freeRun' && freeRunStep === 'route';
    return (
      <AnimatePresence>
        {!topBarCollapsed && (
          <motion.div
            key="top-bar"
            initial={{ y: -160, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -160, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="absolute left-0 right-0 z-[70] px-4 pointer-events-none"
            style={{ top: 'calc(52px + env(safe-area-inset-top, 0px))', paddingTop: '0.75rem' }}
          >
            <div className="max-w-md mx-auto w-full space-y-2">
              {/* Premium glass search bar — focus opens NavigationHub overlay.
                  Home / Work saved-place shortcuts are surfaced inside the
                  NavigationHub full-screen overlay (Quick Actions grid) so
                  the map canvas stays uncluttered. */}
              <div data-coach={FIRST_RUN_COACH.mapSearch}>
                <FloatingSearchBar
                  inputRef={logic.searchInputRef}
                  searchQuery={logic.searchQuery}
                  onSearchChange={logic.setSearchQuery}
                  onFocus={() => logic.setNavState('searching')}
                />
              </div>

              {/* Mode header pills — also hidden in commute mode so the
                  top surface stays focused on the active navigation flow. */}
              {mapMode !== 'commute' && screen !== 'SEARCH_PICK' && (
                <div className="pointer-events-auto">
                  <MapModeHeader
                    activeMode={mapMode}
                    onModeChange={handleMapModeChange}
                    hasNearbyRoutes={hasNearbyRoutes}
                    partnerCount={live.length}
                  />
                </div>
              )}

              {/* "חפש באזור זה" pill — appears after panning > 30% viewport from
                  the baseline position. Tapping activates viewport-search mode.
                  15.08.2026: moved below the mode-pills row (was between the
                  search bar and the pills) — David wants it positioned like
                  Google Maps' "search this area", under the top controls, not
                  above them. */}
              <AnimatePresence>
                {showSearchAreaButton && (
                  <motion.div
                    key="search-area-btn"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="flex justify-center pointer-events-auto"
                  >
                    <button
                      onClick={handleSearchArea}
                      className="bg-white text-gray-800 text-sm font-semibold px-5 py-2 rounded-full shadow-md ring-1 ring-black/10 active:scale-95 transition-all"
                      dir="rtl"
                    >
                      חפש באזור זה
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── SWITCH STATEMENT — only ONE branch renders, everything else is unmounted ──
  // ── v2 (enable_home_v2): plain route → the ONE overview drawer ─────────────
  // Same start / navigate paths as RouteDetailSheet below; the chosen activity sets
  // the player's session mode first (walk / run / ride — v2 has a cycling mode).
  const startRouteAs = (r: Route, act: RouteActivity) => {
    useRunningPlayer.getState().setActivityType(playerActivityFor(act));
    logic.setFocusedRoute(r);
    logic.startActiveWorkoutForRoute(r);
  };
  const navigateToRouteStart = (r: Route) => {
    const startPoint = Array.isArray(r.path) && r.path.length > 0 ? r.path[0] : null;
    if (!startPoint) return;
    logic.setSelectedRoute(null);
    logic.setFocusedRoute(null);
    startCommute({ coords: [startPoint[0], startPoint[1]], label: r.name });
  };
  function renderRouteOverviewCard(route: Route) {
    const userPos = devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos ?? null;
    const close = () => { logic.setSelectedRoute(null); logic.setFocusedRoute(null); };
    return (
      // Board M-6j: the same drawer + "יש לך היום … · לאימון הזה כאן" when today's run fits this route.
      <RouteOverviewWithTodayRun
        key={route.id}
        route={route}
        initialActivity={logic.preferences.activity}
        userLocation={userPos}
        cityName={userCityName}
        onBack={close}
        onStart={(r, act) => { close(); startRouteAs(r, act); }}
        onStartWorkoutOnRoute={(r, workout, at) => {
          close();
          startPlannedRunOnRoute({
            route: r, workout, week: at.week, day: at.day,
            setFocusedRoute: logic.setFocusedRoute, startActiveWorkoutForRoute: logic.startActiveWorkoutForRoute,
          });
        }}
        onNavigate={navigateToRouteStart}
        renderFullDetails={(back) => (
          <RouteDetailSheet
            isOpen
            route={route}
            userLocation={userPos}
            onClose={back}
            onStartWorkout={(r) => { logic.setFocusedRoute(r); logic.startActiveWorkoutForRoute(r); }}
            onNavigate={navigateToRouteStart}
            devSim={devSim}
          />
        )}
      />
    );
  }

  function renderScreen(): React.ReactNode {
    switch (screen) {
      case 'SEARCH':
        return <NavigationHub {...navHubProps} />;

      case 'NAV':
        return <NavigationHub {...navHubProps} />;

      case 'ROUTE_CARD': {
        const enrichedSelected = enrichRoutes([logic.selectedRoute!])[0];
        if (mapFeatureFlags.enableHomeV2) return renderRouteOverviewCard(enrichedSelected);
        return (
          <>
            {/* route-preview: the top chrome must never show while the hybrid overview
                drawer is up, in ANY screen state (MAP_OVERVIEW_CHROME_V1). */}
            {!topChromeFolded && renderTopBar()}

            <RouteDetailSheet
              isOpen
              route={enrichedSelected}
              userLocation={devSim?.effectiveLocation(logic.currentUserPos) ?? logic.currentUserPos ?? null}
              onClose={() => { logic.setSelectedRoute(null); logic.setFocusedRoute(null); }}
              onStartWorkout={(r) => {
                logic.setFocusedRoute(r);
                logic.startActiveWorkoutForRoute(r);
              }}
              onNavigate={(r) => {
                // "Navigate to" on an entity card funnels into the
                // commute flow instead of re-opening the legacy
                // 3-variant drawer. We use the route's first path coord
                // as the destination — that's where the user wants to
                // arrive (the trailhead). The route card itself is
                // dismissed so the commute carousel can take the bottom.
                const startPoint = Array.isArray(r.path) && r.path.length > 0
                  ? r.path[0]
                  : null;
                if (!startPoint) return;
                logic.setSelectedRoute(null);
                logic.setFocusedRoute(null);
                startCommute({
                  coords: [startPoint[0], startPoint[1]],
                  label: r.name,
                });
              }}
              devSim={devSim}
            />
          </>
        );
      }

      case 'PARK_CARD':
        // Park card as an exclusive bottom surface — no entry button, no slot
        // carousel, no free-run drawer behind it. Top bar stays so the user can
        // still search / change mode. ParkPreview self-gates on selectedPark.
        return (
          <>
            {/* route-preview: the top chrome must never show while the hybrid overview
                drawer is up, in ANY screen state (MAP_OVERVIEW_CHROME_V1). */}
            {!topChromeFolded && renderTopBar()}
            <ParkPreview userLocation={logic.currentUserPos ?? null} />
          </>
        );

      case 'SEARCH_PICK': {
        // v2 only (searchPick is never set with enable_home_v2 off).
        if (!searchPick) return null;
        return (
          <>
            {!topChromeFolded && renderTopBar()}
            {searchPick.kind === 'place' ? (
              <SearchDestinationCard
                key={`${searchPick.place.coords[0]},${searchPick.place.coords[1]}`}
                place={searchPick.place}
                userPos={logic.currentUserPos ?? null}
                onClose={closeSearchPick}
                onNavigate={() => {
                  // Today's A→B route cards (commute RouteCarousel).
                  const { coords, text } = searchPick.place;
                  setSearchPick(null);
                  startCommute({ coords, label: text });
                }}
                onStartActivity={(activity) => {
                  // The free-run drawer with this place as its destination —
                  // the same pending-address path its own "יעד: כתובת" option
                  // uses; GoalSheet reopens with "התחל לכתובת הזו".
                  const { coords, text } = searchPick.place;
                  setSearchPick(null);
                  useMapStore.getState().setCommuteDestination(null);
                  logic.handleActivityChange(activity);
                  const pending = usePendingAddressStore.getState();
                  pending.startComposing();
                  pending.setPending({ lat: coords[1], lng: coords[0], label: text });
                  handleMapModeChange('freeRun');
                }}
                onOpenRoute={openRoutePick}
              />
            ) : (
              <SearchRouteCard
                key={searchPick.route.id}
                route={searchPick.route}
                userPos={logic.currentUserPos ?? null}
                onClose={closeSearchPick}
                onStartRoute={() => {
                  // Same as RouteDetailSheet's onStartWorkout.
                  const r = searchPick.route;
                  setSearchPick(null);
                  logic.setFocusedRoute(r);
                  logic.startActiveWorkoutForRoute(r);
                }}
                onNavigateToStart={() => {
                  // Same as RouteDetailSheet's onNavigate (trailhead commute).
                  const r = searchPick.route;
                  const startPoint = Array.isArray(r.path) && r.path.length > 0 ? r.path[0] : null;
                  if (!startPoint) return;
                  setSearchPick(null);
                  startCommute({ coords: [startPoint[0], startPoint[1]], label: r.name });
                }}
                onDetails={() => {
                  // The full RouteDetailSheet (ROUTE_CARD screen).
                  const r = searchPick.route;
                  setSearchPick(null);
                  logic.setSelectedRoute(r);
                  logic.setFocusedRoute(r);
                }}
              />
            )}
          </>
        );
      }

      case 'COMMUTE': {
        // The unified RouteCarousel mounted in commute mode. Top bar
        // stays visible (just the floating search) so the user can
        // change their destination at any time.
        if (!userLocation || !commuteRouteConfig) return null;
        return (
          <>
            {/* route-preview: the top chrome must never show while the hybrid overview
                drawer is up, in ANY screen state (MAP_OVERVIEW_CHROME_V1). */}
            {!topChromeFolded && renderTopBar()}

            <RouteCarousel
              userPosition={userLocation}
              // ── Commute activity is per-session, NOT inherited ──
              // We deliberately ignore `logic.preferences.activity`
              // here — see the `commuteActivity` jsdoc above for why.
              // The user picks via the inline picker chip group; the
              // value re-triggers route generation through the
              // RouteCarousel reset effect.
              activity={commuteActivity}
              onActivityChange={setCommuteActivity}
              mode="commute"
              destination={commuteRouteConfig.destination}
              destinationLabel={commuteRouteConfig.label}
              focusedRouteId={logic.focusedRoute?.id ?? null}
              onFocusChange={(route) => logic.setFocusedRoute(route)}
              onBack={() => {
                // Drop the commute flow and clear the destination pin.
                // The map returns to its default discover surface.
                // setCommuteDestination(null) is called explicitly here
                // because the mirror effect is set-only — see its
                // jsdoc above for why.
                logic.setFocusedRoute(null);
                setCommuteRouteConfig(null);
                useMapStore.getState().setCommuteDestination(null);
                setMapMode('idle');
              }}
              onSelect={(route) => {
                // Stage the commute intent on useRunningPlayer BEFORE
                // startActiveWorkout fires. The pre-flight chain
                // (clearRunningData → initializeRunningData) does not
                // touch sessionMode / commuteContext, so the staged
                // values survive into the active session and the HUD
                // boots in commute flavour on first paint (no flash
                // from the workout HUD to the commute HUD). See
                // useRunningPlayer.SessionMode jsdoc for the contract.
                useRunningPlayer.getState().setCommuteContext({
                  destination: commuteRouteConfig.destination,
                  label: commuteRouteConfig.label,
                });
                // Mirror the commute-picker activity into the user
                // preferences right before starting so downstream
                // running-player logic (UI accents, calorie formula)
                // operates with the activity the user actually chose
                // for this commute, not the stale "last free-run"
                // activity. This is a write-only mirror; it stays
                // local to this session start and isn't persisted.
                logic.handleActivityChange(commuteActivity);
                // Also mirror into the running player itself so the unified
                // session mode + the saved doc file a walking commute as
                // walking (cycling falls back to 'running' — no pipeline yet).
                useRunningPlayer.getState().setActivityType(
                  commuteActivity === 'walking' ? 'walking' : 'running',
                );
                logic.setFocusedRoute(route);
                setMapMode('idle');
                setCommuteRouteConfig(null);
                logic.startActiveWorkoutForRoute(route);
              }}
            />
          </>
        );
      }

      case 'DISCOVERY':
        return (
          <>
            {/* Top bar (search + mode pills) is unmounted while the partner
                overlay is open — same pattern as SEARCH / NAV cases above,
                which simply don't render `renderTopBar()`. Keeps the map
                surface clean so the partner overlay owns the top of the
                screen. */}
            {partnerTab === null && !topChromeFolded && renderTopBar()}

            {/* Layers button — top-right, below header (search bar 48px + gap 8px + mode pills 48px + 12px margin = 116px).
                Hidden while the partner overlay is open so the layers icon
                doesn't visually attach itself to the partners pill area —
                the overlay owns the top-right slot in that mode.
                15.08.2026: back to a static offset — the "חפש באזור זה" pill
                now renders BELOW the mode-pills row (renderTopBar()), not
                between the search bar and the pills, so the mode-pills row's
                own position no longer shifts when the pill shows/hides; this
                button's "below the 2-row header" anchor is correct again
                without needing to react to showSearchAreaButton (the 14.08
                fix that made it reactive is reverted along with that reorder). */}
            {partnerTab === null && isMapVisuallyReady && !topChromeFolded && (
              <div
                className="absolute right-4 z-[50] pointer-events-none"
                style={{ top: 'calc(52px + env(safe-area-inset-top, 0px) + 116px)' }}
                data-coach={FIRST_RUN_COACH.mapLayers}
              >
                <MapLayersControl liveCount={live.length} />
              </div>
            )}

            {/* HUD — z-[40]. Bottom offset accounts for carousel height + safe-area.
                Splash-gated so the FAB (+) and recenter button reveal with the
                rest, rather than sitting hidden behind the skeleton during load. */}
            {isMapVisuallyReady && (
            <div
              className="absolute right-4 z-[40] flex flex-col gap-3"
              // v2: lower, nearer the bottom like home's "+" (owner's review).
              style={{ bottom: mapFeatureFlags.enableHomeV2 ? 'calc(max(270px, env(safe-area-inset-bottom, 0px) + 240px))' : 'calc(max(340px, env(safe-area-inset-bottom, 0px) + 310px))' }}
            >
              {chromeFocused ? null : SOCIAL_COMPOSE_UI_ENABLED ? (
                <PlusFab onOpen={() => setPlusDrawerOpen(true)} v2={mapFeatureFlags.enableHomeV2} />
              ) : (
                <ActionSpeedDial
                  onAdd={() => setWizardOpen(true)}
                  onReport={() => setReportOpen(true)}
                />
              )}
              <button
                onClick={() => {
                  // Also exits viewport-search mode and resets the pan baseline
                  // so the button only reappears after the next deliberate pan.
                  useMapStore.getState().setViewportSearchActive(false);
                  if (viewportBounds) refBoundsRef.current = viewportBounds;
                  logic.handleLocationClick(); // GPS refresh + permission prompt when no fix
                  onRecenter?.();                // center the camera on the best-available fix
                }}
                className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center bg-white pointer-events-auto active:scale-95 transition-all"
              >
                <Navigation size={20} fill={logic.isFollowing ? BRAND_COLOR : 'none'} color={logic.isFollowing ? BRAND_COLOR : GRAY_COLOR} />
              </button>
            </div>
            )}

            {/* ── Bottom content: single premium carousel for ALL route types ── */}
            {mapMode === 'discover' && allDisplayRoutes.length > 0 && (
              <BottomJourneyContainer
                routes={stableCarouselRoutes}
                onRouteFocus={(r) => {
                  logic.setFocusedRoute(r);
                }}
                focusedRouteId={logic.focusedRoute?.id || null}
                loadingRouteIds={logic.loadingRouteIds}
                onShowDetails={() => logic.setShowDetailsDrawer(true)}
                // Start the card's OWN route: the CTA calls onRouteFocus(route) then this in the same tick,
                // and startActiveWorkout() would still see the previously focused route (stale closure).
                onStartWorkout={(r) => { logic.setFocusedRoute(r); logic.startActiveWorkoutForRoute(r); }}
                onShowRouteDetail={(r) => {
                  logic.setSelectedRoute(r);
                  logic.setFocusedRoute(r);
                }}
                userPosition={userLocation}
                durationActivity={slotActivity}
              />
            )}

            {/* ── On-map hybrid entry ("מה עושים היום?") — idle only, flag-gated.
                Opens the slot layer (resetHybridFlow('slots') — passive, no compose). */}
            {mapFeatureFlags.enableHybridSlots && mapMode === 'idle' && isMapVisuallyReady && (
              <div
                className="absolute left-0 right-0 z-[100] pointer-events-none"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
              >
                <ShimmerPhraseButton
                  messages={ENTRY_PHRASES}
                  onTap={() => {
                    // Passive entry: open the slot carousel only. resetHybridFlow
                    // sets freeRunStep='slots' explicitly (no effect race, no
                    // 'config' flash) and clears any prior composed plan. NO
                    // compose here — that happens only on a card's "צא לדרך" CTA.
                    // eslint-disable-next-line no-console
                    console.log('[compose-trigger]', 'entry-open (passive, no compose)');
                    resetHybridFlow('slots');
                    setMapMode('freeRun');
                  }}
                  className="px-6 pointer-events-auto"
                />
              </div>
            )}

            {/* ── Free-run flow — two stages, mutually exclusive ─────────
                Stage 1: FreeRunDrawer (activity chips + goal + start CTAs).
                Stage 2: RouteCarousel (floating route cards over the map) —
                         only entered when the user taps "עם מסלול".
                Both guarded by `mapMode === 'freeRun'`. */}
            {mapMode === 'freeRun' && freeRunStep === 'config' && (
              <FreeRunDrawer
                currentActivity={logic.preferences.activity}
                onActivityChange={(activity) => logic.handleActivityChange(activity)}
                onStartWorkout={logic.startActiveWorkout}
                onClose={() => {
                  // Explicit "I'm done with Free Run" — distinct from the
                  // onRequestAddLeg / onRequestAddressDestination round-trips
                  // below (which exit via their own callbacks, never this
                  // one), so this can safely discard an in-progress leg plan
                  // or pending address without racing either flow.
                  useLegPlanStore.getState().reset();
                  usePendingAddressStore.getState().clear();
                  setMapMode('idle');
                }}
                userPosition={userLocation}
                cityName={userCityName}
                // enable_hybrid_cards_v2: "תחנות כוח" only when an equipped park is within reach.
                enableHybridSlots={mapFeatureFlags.enableHybridSlots && (!hybridCardsV2 || smartHybrid.drawerParkId != null)}
                initialPlannedRun={mapFeatureFlags.enableHomeV2 ? scheduledPlannedRun : null}
                onRequestRouteGeneration={({ targetKm, includeStrength, surface }) => {
                  // Phase "1.5" — manual free-run generator, David-only testing
                  // convenience toward Phase 2 (see IS_SHORT_ROUTE_MANUAL_TEST_EMAIL
                  // above). Lets short-route generation be exercised at any target
                  // size directly in the generator, not just via the step-goal
                  // deep-link. Same shortRouteMode field, same generator branch —
                  // no parallel path. Phase 2 (open to everyone) = deleting the
                  // email check below once device data calibrates the constants.
                  const shortRouteMode =
                    IS_STEP_GOAL_SHORT_ROUTE_ENABLED &&
                    auth.currentUser?.email === IS_SHORT_ROUTE_MANUAL_TEST_EMAIL;
                  setRouteCarouselConfig({ targetKm, includeStrength, surface, shortRouteMode });
                  setFreeRunStep('route');
                }}
                onStartHybrid={mapFeatureFlags.enableHybridSlots ? (intent) => {
                  // Route-preview title bar (MAP_OVERVIEW_CHROME_V1): the drawer has no
                  // slot title, so derive an aerobic+כוח label. No-op when flag is off.
                  setOverviewTitle(hybridSessionTitle(intent.aerobicKind));
                  // enable_hybrid_cards_v2: the same smart walk-through-the-park composition.
                  composeAndShowOverview(hybridCardsV2 ? smartHybrid.toDrawerIntent(intent) : intent, 'config');
                } : undefined}
                onRequestAddressDestination={() => {
                  // Exit the free-run drawer (mapMode gate) and hand off straight to
                  // the SAME NavigationHub search flow the top search bar already
                  // uses — `screen` picks SEARCH the moment navState flips, so no
                  // mapMode juggling beyond leaving 'freeRun' is needed.
                  //
                  // startComposing() (09.08 revision) arms usePendingAddressStore
                  // BEFORE the exit, mirroring exactly how LegPlanSheet's
                  // handleAddStop arms useLegPlanStore before its own exit —
                  // handleAddressSelect below reads this flag to know the pick
                  // should come back here for review, not commute immediately.
                  usePendingAddressStore.getState().startComposing();
                  setMapMode('idle');
                  logic.setNavState('searching');
                }}
                onConfirmAddressDestination={(pending) => {
                  // The only thing that actually calls startCommute now
                  // (09.08) — the user has seen the picked address back in
                  // GoalSheet and explicitly tapped "🏁 התחל לכתובת הזו".
                  usePendingAddressStore.getState().clear();
                  startCommute({ coords: [pending.lng, pending.lat], label: pending.label });
                }}
                onRequestAddLeg={() => {
                  // Identical drawer-exit mechanics to onRequestAddressDestination
                  // above — the difference is entirely in handleAddressSelect
                  // below, which checks useLegPlanStore.isComposing (set by
                  // LegPlanSheet just before this fires) to route the pick back
                  // into the leg plan instead of starting a commute.
                  setMapMode('idle');
                  logic.setNavState('searching');
                }}
                onStartLegPlanRun={(compiled) => {
                  // Stage the running player exactly like the commute
                  // RouteCarousel's onSelect does, minus the carousel step
                  // itself (skipped per David's decision #4 — the user
                  // already picked exactly what they want, leg by leg).
                  //
                  // sessionMode is left at its default 'workout' (David,
                  // 08.08): a composed leg-plan is a deliberate multi-stop
                  // session, not daily-life A-to-B navigation, so it earns
                  // full running XP — NOT the slimmer commute rate
                  // onRequestAddressDestination's single-address trips get.
                  // clearCommuteContext() is called explicitly (not just
                  // relied on as the default) so any commute flow the user
                  // backed out of earlier can't leak sessionMode='commute'
                  // into this run.
                  useRunningPlayer.getState().clearCommuteContext();
                  useRunningPlayer.getState().setActivityType(
                    compiled.route.activityType === 'walking' ? 'walking' : 'running',
                  );
                  logic.handleActivityChange(
                    compiled.route.activityType === 'cycling' ? 'cycling' :
                    compiled.route.activityType === 'walking' ? 'walking' : 'running',
                  );
                  logic.setFocusedRoute(compiled.route);
                  useLegPlanStore.getState().reset();
                  setMapMode('idle');
                  // Settle-preview-lite (David, 08.08): don't jump straight
                  // into the active-workout HUD — the map is now visible
                  // with the compiled route already drawn (setFocusedRoute
                  // above), so arm a short auto-confirm card instead of
                  // calling startActiveWorkout() immediately. No carousel,
                  // no compose/cache/flow-id — compileLegPlan already ran
                  // inside LegPlanSheet before this handler ever fired.
                  setLegPlanPreview(compiled);
                }}
              />
            )}

            {/* ── Hybrid slot layer (Phase 1) — "מה עושים היום?" floating carousel.
                Shares the z-[100] free-run overlay tier with HybridOverviewScreen
                (mutually exclusive freeRunStep). Flag-gated → byte-identical when off. */}
            {mapFeatureFlags.enableHybridSlots && mapMode === 'freeRun' && freeRunStep === 'slots' && (
              <HybridSlotCarousel
                slots={slots}
                loading={hybridComposing}
                aerobicKind={slotActivity}
                onActivityChange={setSlotActivity}
                focused={suggestionsFocused}
                // G1.1 (flag enable_carousel_swipe_hint, fail-closed): only once the flags have
                // loaded, so the hint/width never switch mid-view.
                swipeHint={!mapFlagsLoading && mapFeatureFlags.enableCarouselSwipeHint}
                onSelectSlot={handleSelectSlot}
                onSettleSlot={handleSettleSlot}
                computingPreview={hybridPreviewComposing}
                routeStopsTotal={routeStopsTotal}
                onBuildYourself={() => resetHybridFlow('config')}
                // Focused state: the title bar's → is the back control — no second, floating close button.
                onClose={suggestionsFocused ? undefined : () => { resetHybridFlow(); setMapMode('idle'); }}
              />
            )}

            {/* Hybrid overview (phase ב) — bottom sheet over the map; route shown behind. */}
            {mapMode === 'freeRun' && freeRunStep === 'overview' && hybridComposed && (
              <HybridOverviewScreen
                composed={hybridComposed}
                cityName={userCityName}
                onExerciseTap={(we) => setHybridDetailEx(we)}
                onSwapExercise={(segIndex, exIndex, we) =>
                  setHybridSwap({ segIndex, exIndex, exercise: we?.exercise, level: we?.programLevel ?? we?.exercise?.level ?? 1 })
                }
                onBack={() => { setFreeRunStep(overviewBackStep); logic.setFocusedRoute(null); }}
                // needs-assessment link follow-up: only present when the composed
                // session actually carries assessmentDomains (the needsAssessment
                // fallbackHint, never a real rest day) — HybridOverviewScreen renders
                // the banner as a real link exactly when this prop is non-undefined.
                // Domain resolution mirrors WorkoutBuilderSheet's own unlockDomain
                // fallback (`unlockDomain ?? 'push'`) — full-park's gate doesn't track
                // a single specific domain either, so 'push' is the same, already-
                // accepted default when nothing more specific resolves.
                // Domain-assessment gate (David, 23-24.09.2026): now also called PER
                // SEGMENT from a locked station card (HybridJourneyAxis), passing that
                // segment's own assessmentDomains — falls back to the session-level
                // ones (unchanged) when called with none, so the existing session banner
                // above (and every other pre-existing caller) stays byte-identical.
                onAssessmentLink={(passedDomains?: string[]) => {
                  const domains = passedDomains?.length ? passedDomains : (hybridComposed?.assessmentDomains ?? []);
                  const domain = domains.find((d) => (PRIMARY_CATEGORIES as readonly string[]).includes(d)) ?? 'push';
                  // Return-point fix (David, 24.09.2026): explicit returnTo carrying
                  // the focused route's id, instead of the default
                  // window.location.pathname fallback — this is the exact
                  // route-stops-drawer case the field report was about. Cheap
                  // version, per instruction: does NOT reconstruct hybridComposed
                  // (the composed workout) — just enough for the map to know
                  // which route to re-show. FLAGGED, not yet built: for a hybrid
                  // session specifically, logic.focusedRoute.id is the synthetic
                  // 'hybrid-route' placeholder (confirmed via this file's own
                  // AppMap wiring), not a re-fetchable official_routes doc id —
                  // landing on /map?focusRouteId=hybrid-route does not by itself
                  // re-focus anything yet; no existing mount-time "fetch+focus a
                  // route from a URL id" mechanism exists in this file today
                  // (every setFocusedRoute call site already holds the full Route
                  // object in hand). Confirmed with David before writing that
                  // piece — see PR description.
                  const routeId = logic.focusedRoute?.id;
                  const mapReturnTo = routeId ? `/map?focusRouteId=${encodeURIComponent(routeId)}` : '/map';
                  startMiniDomainAssessment(router, domain, mapReturnTo);
                }}
                onStart={() => {
                  const c = hybridComposed;
                  // health-declaration-covered-by-card bug: runHybridPlan below calls
                  // logic.startActiveWorkout, which may open JITSetupModal (z-[90]) —
                  // dismiss the still-mounted HybridOverviewScreen (z-[100]) FIRST, same
                  // pattern as HybridSlotCarousel's own working close button. `c` is
                  // captured above BEFORE the reset, so resetHybridFlow() nulling
                  // hybridComposed doesn't lose the plan we're about to run.
                  //
                  // route-lost-after-health-declaration bug (10.08.2026 diagnosis):
                  // keepFocusedRoute — this is a START, not a leave. focusedRoute is the
                  // LIVE prop AppMap draws the active-run route/stations from (gated on
                  // focusedRoute?.id === 'hybrid-route'); runHybridPlan only writes
                  // Zustand (useRunningPlayer/useHybridRun), never re-sets focusedRoute,
                  // so nulling it here left the map with nothing to draw once
                  // _doStartActiveWorkout finally fired post-JIT.
                  resetHybridFlow('config', { keepFocusedRoute: true });
                  setMapMode('idle');
                  import('@/features/workout-engine/hybrid/start-hybrid-session').then(({ runHybridPlan }) => {
                    runHybridPlan(c, logic.startActiveWorkout);
                  });
                }}
              />
            )}

            {/* Route-preview title bar — replaces the folded top chrome while the
                overview drawer is up (MAP_OVERVIEW_CHROME_V1). Same back closure as
                the drawer's onBack. Slides down on open, up on close. The outer flag
                guard keeps the tree byte-identical when the feature is off. */}
            {MAP_OVERVIEW_CHROME_V1 && (
              <AnimatePresence>
                {chromeFocused && isMapVisuallyReady && (
                  <motion.div
                    key="suggestions-title-bar"
                    className="absolute inset-x-0 top-0 z-[70] pointer-events-none"
                    initial={{ y: -160, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -160, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                  >
                    <OverviewTitleBar
                      title="הצעות מסלולים"
                      eyebrow={null}
                      // Hybrid: the closure the carousel's own close button used (reset + idle). Curated: the
                      // existing mode-chip dismiss (clears focus/selection, → idle). Both restore all chrome.
                      onBack={() => {
                        if (suggestionsFocused) { resetHybridFlow(); setMapMode('idle'); }
                        else handleMapModeChange('idle');
                      }}
                    />
                  </motion.div>
                )}
                {overviewChromeActive && (
                  <motion.div
                    key="overview-title-bar"
                    className="absolute inset-x-0 top-0 z-[70] pointer-events-none"
                    initial={{ y: -160, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -160, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                  >
                    <OverviewTitleBar
                      title={overviewTitle}
                      onBack={() => { setFreeRunStep(overviewBackStep); logic.setFocusedRoute(null); }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            )}

            {/* Real preview detail drawer (tap) — same component the workout preview uses. */}
            {mapMode === 'freeRun' && freeRunStep === 'overview' && (
              <ExerciseDetailDrawer
                detailExercise={hybridDetailEx}
                programMap={hybridProgramMap}
                onDismiss={() => setHybridDetailEx(null)}
              />
            )}

            {/* Real replacement modal (swap) — choose an alternative → mutate the plan. */}
            {mapMode === 'freeRun' && freeRunStep === 'overview' && hybridSwap && profile && (
              <ExerciseReplacementModal
                isOpen
                onClose={() => setHybridSwap(null)}
                currentExercise={hybridSwap.exercise}
                currentLevel={hybridSwap.level}
                location={'park' as ExecutionLocation}
                park={null}
                userProfile={profile as any}
                onReplace={(newExercise, executionMethod, levelComparison, meta) => {
                  // Stability: mutate hybridComposed at [segIndex][exIndex], keeping the
                  // prescription (sets/reps/rest). runHybridPlan runs the swapped plan.
                  const { segIndex, exIndex } = hybridSwap;
                  // Soft-adaptation Phase 0: record the swap (data only, fire-and-forget).
                  {
                    const seg: any = hybridComposed?.plan.segments[segIndex];
                    const slot: any = seg?.kind === 'strength' ? seg.content?.exercises?.[exIndex] : null;
                    const stamp = slot ? adaptationStampForPlan(slot) : {};
                    logExerciseSwap({
                      fromExerciseId: hybridSwap.exercise?.id ?? slot?.exercise?.id ?? '',
                      fromName: getLocalizedText(hybridSwap.exercise?.name ?? slot?.exercise?.name, 'he'),
                      toExerciseId: newExercise.id,
                      toName: getLocalizedText(newExercise.name, 'he'),
                      domain: stamp.domain,
                      fromLevel: stamp.exerciseLevel ?? hybridSwap.level,
                      toLevel: meta?.toLevel,
                      userDomainLevel: stamp.userDomainLevel,
                      direction: levelComparison,
                      tab: meta?.tab,
                      reason: meta?.reason,
                      source: 'hybrid_overview',
                      flow: 'hybrid',
                      userInitiated: true,
                      location: 'park',
                      parkId: seg?.parkId,
                      segmentRole: slot?.exerciseRole,
                    });
                  }
                  setHybridComposed((prev) => {
                    if (!prev) return prev;
                    const seg: any = prev.plan.segments[segIndex];
                    if (!seg || seg.kind !== 'strength' || !seg.content) return prev;
                    const exercises: any[] = [...(seg.content.exercises ?? [])];
                    const current = exercises[exIndex];
                    if (!current) return prev;
                    exercises[exIndex] = {
                      ...current,
                      exercise: newExercise,
                      method: executionMethod,
                      wasSwapped: true,
                      // Phase 0 (data only): original slot exercise + levels for the strength log.
                      ...swapStampForEntry(current, newExercise.id, meta?.toLevel),
                    };
                    const newSeg = { ...seg, content: { ...seg.content, exercises } };
                    const segments = prev.plan.segments.map((s, i) => (i === segIndex ? newSeg : s));
                    return { ...prev, plan: { ...prev.plan, segments } };
                  });
                  setHybridSwap(null);
                }}
              />
            )}

            {mapMode === 'freeRun' && hybridComposing && (
              <div className="absolute inset-0 z-[101] flex items-center justify-center bg-black/20 pointer-events-auto">
                <div className="bg-white rounded-2xl px-5 py-3 text-[14px] font-black text-gray-800 shadow-xl">מכין אימון משולב…</div>
              </div>
            )}

            {mapMode === 'freeRun' &&
              freeRunStep === 'route' &&
              userLocation &&
              routeCarouselConfig && (
                <RouteCarousel
                  userPosition={userLocation}
                  activity={logic.preferences.activity}
                  targetKm={routeCarouselConfig.targetKm}
                  includeStrength={routeCarouselConfig.includeStrength}
                  surface={routeCarouselConfig.surface}
                  shortRouteMode={routeCarouselConfig.shortRouteMode}
                  cityName={userCityName}
                  // Bidirectional sync: when the user taps a route line on
                  // the map, the parent's focusedRoute updates and the
                  // carousel scrolls to the matching card. The carousel
                  // filters self-emitted ids via its own ref so this
                  // doesn't create an echo loop with onFocusChange below.
                  focusedRouteId={logic.focusedRoute?.id ?? null}
                  onFocusChange={(route) => {
                    // Sync the centered card to `focusedRoute` so the
                    // camera fitBounds-debounce in useCameraController
                    // reframes the map. Debounced inside the carousel so
                    // a fast multi-card flick fires this exactly once at
                    // the destination — not N times during the swipe.
                    logic.setFocusedRoute(route);
                  }}
                  onBack={() => {
                    // Drop the carousel and return to the config drawer.
                    // Clearing `focusedRoute` keeps the map in its
                    // pre-route state so the user doesn't see a stray
                    // highlight on the empty map.
                    logic.setFocusedRoute(null);
                    setFreeRunStep('config');
                  }}
                  onSelect={(route) => {
                    // Pin the chosen route as the focus so the active-workout
                    // overlay opens with it pre-selected, then exit free-run
                    // mode and kick off the same start path as discover.
                    logic.setFocusedRoute(route);
                    setMapMode('idle');
                    logic.startActiveWorkoutForRoute(route);
                  }}
                  // v2: the cards are the overview drawer's compact header; a tap opens it.
                  onOpenRoute={mapFeatureFlags.enableHomeV2 ? (route) => { logic.setFocusedRoute(route); setRouteOverview(route); } : undefined}
                />
              )}

            {/* v2 (enable_home_v2): the ONE overview drawer for a generator route (board M-5e → 5a). */}
            {mapFeatureFlags.enableHomeV2 && mapMode === 'freeRun' && freeRunStep === 'route' && routeOverview && (
              <RouteOverviewOverlay
                key={routeOverview.id}
                route={routeOverview}
                initialActivity={logic.preferences.activity}
                userLocation={userLocation}
                cityName={userCityName}
                onBack={() => setRouteOverview(null)}
                onStart={(r, act) => {
                  // Same start path as the carousel's onSelect, with the chosen activity.
                  setRouteOverview(null);
                  useRunningPlayer.getState().setActivityType(playerActivityFor(act));
                  logic.setFocusedRoute(r);
                  setMapMode('idle');
                  logic.startActiveWorkoutForRoute(r);
                }}
              />
            )}

            {/* ── Partner Finder flow ─────────────────────────────────
                State machine: radar (transient) → overlay.
                PartnerBubbles is kept but no longer rendered — the mode
                button tap goes straight to radar with default tab='live'.
                AnimatePresence honours per-component exit animations. */}
            <AnimatePresence>
              {mapMode === 'partners' && showRadar && pendingTab && (
                <RadarAnimation
                  key="partner-radar"
                  tab={pendingTab}
                  isCached={!isLoading}
                  onComplete={handleRadarComplete}
                  // Partner search uses the slower 3 s tempo — feels
                  // like a more thorough scan for the right people.
                  mode="partners"
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {mapMode === 'partners' && partnerTab !== null && (
                <PartnerOverlay
                  key="partner-overlay"
                  initialTab={partnerTab}
                  userLocation={userLocation}
                  live={live}
                  scheduled={scheduled}
                  isLoading={isLoading}
                  onClose={handlePartnerOverlayClose}
                  onFiltersChange={handlePartnerFiltersChange}
                />
              )}
            </AnimatePresence>
          </>
        );
    }
  }

  // First-run map tour (slice 2) — idle discovery screen only: never during a workout/run,
  // never on a deep-linked arrival, never over a sheet / drawer / non-idle map mode.
  const mapTourActive =
    firstRunTourEligible && !mapFlagsLoading && firstRunToursEnabled(mapFeatureFlags) &&
    isMapVisuallyReady &&
    !isMapTourBlocked({
      workoutActive: logic.isWorkoutActive,
      openedByDeepLink: !firstRunTourEligible,
      surfaceOpen:
        screen !== 'DISCOVERY' || mapMode !== 'idle' || partnerTab !== null || topChromeFolded ||
        plusDrawerOpen || wizardOpen || reportOpen || composeOpen || setPlaceSheetKind !== null ||
        !!legPlanPreview || logic.showDetailsDrawer || !!mapGlobalSheet || logic.isGenerating,
    });

  return (
    <>
      {renderScreen()}

      <FirstRunTour tour="map" active={mapTourActive} uid={profile?.id} gender={profile?.core?.gender} delayMs={900} />
      {/* Tour replay (Kelly round 4): only when "תראה לי" asked for it — inert otherwise. */}
      <TourReplayHost tour="map" ready={isMapVisuallyReady} gender={profile?.core?.gender} delayMs={900} />

      {/* ═══ Global overlays — always available, never conflict ═══ */}
      {logic.isGenerating && <RouteGenerationLoader />}

      <AnimatePresence>
        {legPlanPreview && (
          <LegPlanStartPreview
            key="leg-plan-start-preview"
            compiled={legPlanPreview}
            onConfirm={() => {
              setLegPlanPreview(null);
              logic.startActiveWorkout();
            }}
          />
        )}
      </AnimatePresence>

      <ContributionWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialLocation={logic.currentUserPos}
      />
      <QuickReportSheet
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        userLocation={logic.currentUserPos ?? null}
      />
      <PlannedActivityComposeSheet
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
      />
      <UnifiedPlusDrawer
        isOpen={plusDrawerOpen}
        onClose={() => setPlusDrawerOpen(false)}
        onGoTrain={() => setComposeOpen(true)}
        onCreateGroup={() => router.push('/community?openCreate=true')}
        onAddLocation={() => setWizardOpen(true)}
        onReport={() => setReportOpen(true)}
      />

      {/* Saved-places editor — opened from the Quick Row tap-to-set
          flow OR from the NavigationHub overlay's smart Home/Work
          tile when the slot is empty. Self-closes on save / cancel. */}
      <SetSavedPlaceSheet
        openKind={setPlaceSheetKind}
        onClose={() => setSetPlaceSheetKind(null)}
      />
    </>
  );
}
