'use client';

/**
 * MapShell — Map entry point + thin orchestrator.
 *
 * This file owns the full map boot sequence (previously split across
 * FullMapView.tsx and MapShell.tsx):
 *
 *   1. Location Gate (overlay, NOT a tree gate — map warms up in background)
 *   2. MapModeProvider context
 *   3. Base AppMap (dynamically imported so Mapbox is its own chunk)
 *   4. Layer Router (switch on mode)
 *   5. Global overlays (JIT modal, referral toast, ParticleBackground)
 *   6. Mode-sync effects
 *
 * The gate renders as a high z-[80] fixed overlay so the Mapbox canvas
 * initialises and downloads tiles concurrently. By the time the user
 * completes their anchor selection the map is already warm.
 */

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamicImport from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import { useMapLogic } from '@/features/parks';
import type { Route } from '@/features/parks/core/types/route.types';
import { useUserStore } from '@/features/user';
import { syncLocationToFirestore } from '@/lib/firestore.service';
import { getOnboardingPref, getOnboardingPrefAsync } from '@/lib/onboardingPrefs';
import { useIsForeground } from '@/lib/appForeground'; // [A2-SPIKE] temporary diagnostic import
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import ParticleBackground from '@/components/ParticleBackground';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { useFlyoverEntrance } from '@/features/safecity/hooks/useFlyoverEntrance';
import { usePresenceLayer } from '@/features/safecity/hooks/usePresenceLayer';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useActiveWorkoutHeartbeat } from '@/features/heatmap/hooks/useActiveWorkoutHeartbeat';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MapPurpose } from '@/features/user/onboarding/components/steps/UnifiedLocation/location-types';

import { useMapMode, MapModeProvider } from '@/features/parks/core/context/MapModeContext';
import { useDevSimulation } from '@/features/parks/core/hooks/useDevSimulation';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useLegPlanStore } from '@/features/parks/core/store/useLegPlanStore';
import { useDemoPresence } from '@/features/parks/core/hooks/useDemoPresence';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { useGroupPresenceListener } from '@/features/workout-engine/shared/hooks/useGroupPresenceListener';
import ParticipantStrip from '@/features/workout-engine/shared/components/ParticipantStrip';
import MilestoneFeed from '@/features/workout-engine/shared/components/MilestoneFeed';
import SessionLobbyOverlay from '@/features/workout-engine/shared/components/SessionLobbyOverlay';
import { useRouteDeviationOrchestrator } from '@/features/parks/core/hooks/useRouteDeviationOrchestrator';
import DiscoverLayer from './layers/DiscoverLayer';
import BuilderLayer from './layers/BuilderLayer';
import NavigateLayer from './layers/NavigateLayer';
import FreeRunLayer from './layers/FreeRunLayer';
import PlannedPreviewLayer from './layers/PlannedPreviewLayer';
import ActiveWorkoutLayer from './layers/ActiveWorkoutLayer';
import SummaryLayer from './layers/SummaryLayer';
import TurnCarousel from '@/features/parks/core/components/TurnCarousel';
import { useHybridRun } from '@/features/workout-engine/hybrid/useHybridRun';
import { computeRouteTurns } from '@/features/parks/core/services/geoUtils';
import SessionControlBar from '@/features/parks/core/components/SessionControlBar';
import UserProfileSheet, { type ProfileUser } from '@/features/parks/client/components/UserProfileSheet';
import AppHeader from '@/components/ui/AppHeader';
import { MAP_OVERVIEW_CHROME_V1 } from '@/config/feature-flags';

const UnifiedLocationStep = lazy(
  () => import('@/features/user/onboarding/components/steps/UnifiedLocationStep'),
);

const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#f3f4f6]" />,
  ssr: false,
});

// Round 7 mobile map fix (18.08.2026): how old a durably-cached last_gps_at
// fix may be and still count as an "accurate" seed for the map center /
// location marker. Long enough to comfortably cover a brief backgrounding
// or in-app tab-switch back to /map (the common re-entry case this round
// targets); short enough that a genuine relocation since the fix was taken
// (closed the app at home, opened it later somewhere else) doesn't falsely
// seed — and briefly show the "you" marker at — a stale position. Named,
// tunable — not a magic number.
const GPS_SEED_STALENESS_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ── Outer entry-point props (forwarded from page.tsx) ────────────────────────
export interface MapShellProps {
  initialWorkoutId?: string | null;
  initialContext?: string | null;
  /** If set, flyTo this coordinate on map-ready (community navigation) */
  spotFocus?: { lat: number; lng: number } | null;
}

// ── Inner orchestrator (requires MapModeProvider in tree) ─────────────────────
interface MapShellInnerProps {
  spotFocus?: { lat: number; lng: number } | null;
  initialOpenRun?: string | null;
  /** Step-goal push deep-link target (see IS_STEP_GOAL_ROUTE_PREVIEW_ENABLED). */
  targetSteps?: string | null;
  isDemoMode?: boolean;
}

function MapShellInner({ spotFocus, initialOpenRun, targetSteps, isDemoMode = false }: MapShellInnerProps) {
  const { mode, setMode, activityType: contextActivity } = useMapMode();
  const logic = useMapLogic(mode, contextActivity);

  // [A2-SPIKE] TEMPORARY diagnostic — logs every `mode` change (MapModeContext
  // state, NOT a remount) so it's distinguishable from the outer MapShell
  // MOUNTED/UNMOUNTED log above. Expect this to fire on mode transitions
  // (e.g. discovery → free_run on "start run") WITHOUT an outer UNMOUNTED
  // log anywhere near it — that combination proves mode changes alone never
  // tear down useGPS/useMapLogic.
  useEffect(() => {
    console.log('[A2-SPIKE][MapShell] MapShellInner mode changed', { mode });
  }, [mode]);

  // [A2-SPIKE] TEMPORARY diagnostic — passive only, does NOT alter behavior
  // (no pause/resume logic attached; this is the eventual real fix, not this
  // spike). Purely correlates real OS-level backgrounding (screen lock, app
  // switch) against the mount/mode/interval logs above so scenario (a) can
  // be told apart from scenario (b) in the console timeline.
  //
  // [A2-SPIKE] Two signals, deliberately both logged: a raw `visibilitychange`
  // listener (below) AND the codebase's own dual-signal `useIsForeground()`
  // (appForeground.ts, unions visibilitychange + Capacitor's native
  // App.appStateChange — its own header comment states a single signal isn't
  // fully trusted on native WKWebView). If the two ever disagree on-device,
  // that mismatch is itself diagnostic signal — log both, don't pick one.
  const isForegroundSpike = useIsForeground();
  useEffect(() => {
    console.log('[A2-SPIKE][MapShell] useIsForeground() changed', { isForegroundSpike });
  }, [isForegroundSpike]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => {
      console.log('[A2-SPIKE][MapShell] document.visibilityState changed', {
        visibilityState: document.visibilityState,
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const routeZones = useRunningPlayer((s) => s.routeZones);
  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);
  const guidedRouteTurns = useRunningPlayer((s) => s.guidedRouteTurns);
  const runMode = useRunningPlayer((s) => s.runMode);
  // Free-run leg-plan stop markers (ג' Phase 3, 08.08) — read directly off
  // useLegPlanStore rather than smuggled through focusedRoute (the pattern
  // hybridStations below uses via `as unknown as Route`); the plan store
  // already empties on run-start/clear-all/drawer-close, so this naturally
  // shows nothing once composing ends.
  const legPlanLegs = useLegPlanStore((s) => s.legs);
  const legPlanStops = useMemo(
    () => legPlanLegs
      .filter((l) => l.kind === 'to_point')
      .map((l) => ({ id: l.id, lat: l.destination.lat, lng: l.destination.lng, label: l.label })),
    [legPlanLegs],
  );
  // Read the authoritative session status so the turn-carousel guard
  // below can hide the card as soon as the workout transitions to
  // 'finished' — regardless of whether the `mode` enum has been
  // updated to 'summary'. The pure free-run flow mounts
  // FreeRunSummary off of `sessionStatus === 'finished'` without
  // ever routing through `logic.showSummary`, so relying on `mode`
  // alone leaves the carousel visible on the summary / expanded-map
  // overlay.
  const sessionStatus = useSessionStore((s) => s.status);
  const devSim = useDevSimulation();
  const effectivePos = devSim.effectiveLocation(logic.currentUserPos);

  // Recenter ("center on me"): bump a signal AppMap watches → it eases to the
  // best-available fix (live GPS or fallback dot). The layers ALSO call
  // handleLocationClick, which prompts for permission when there is no fix — so a
  // tap is never a silent no-op, even with GPS off / denied.
  const [recenterSignal, setRecenterSignal] = useState(0);
  const handleRecenter = useCallback(() => setRecenterSignal((n) => n + 1), []);
  const storyBarHeight = useMapStore((s) => s.storyBarHeight);
  const navCardHeight = useMapStore((s) => s.navCardHeight);
  const isLapsOpen = useMapStore((s) => s.isLapsOpen);
  // Route-preview chrome (MAP_OVERVIEW_CHROME_V1): true while the hybrid overview
  // drawer is up → fold the AppHeader nav-bar (DiscoverLayer folds the rest).
  const isOverviewActive = useMapStore((s) => s.isOverviewActive);

  // Presence heartbeat ONLY — disabled in demo mode so no writes reach Firestore.
  // heartbeatOnly=true skips this hook's onSnapshot marker listener + 60s heatmap
  // poll (their results are discarded here — the map's pins come from
  // useGroupPresenceListener/usePartnerData below), removing pure wasted load.
  usePresenceLayer(effectivePos ?? null, !isDemoMode, /* heartbeatOnly */ true);

  const flyover = useFlyoverEntrance(effectivePos ?? null);
  const sharedSession = useSharedSession();
  const { partnerPositions: groupPartnerPositions, totalDistanceKm, milestones } =
    useGroupPresenceListener();
  // When a group session is active, filter partner pins to group members only.
  // Otherwise fall through to discovery-mode positions from useGroupPresenceListener.
  const livePartnerPositions = groupPartnerPositions;
  const partnerActivityFilter = useMapStore((s) => s.partnerActivityFilter);
  const liveUsersVisible = useMapStore((s) => s.liveUsersVisible);

  // Demo mode — 40 deterministic fake pins, client-side only, zero Firestore I/O
  const demoPartners = useDemoPresence();
  const effectivePartners = isDemoMode ? demoPartners : livePartnerPositions;
  // Tel Aviv center (Rabin Square) — AppMap opens at zoom 14 when initialCenter is set,
  // which falls in the dots tier (13–15). Override the profile anchor in demo mode.
  const demoCenter = isDemoMode ? { lat: 32.0806, lng: 34.7806 } : null;
  const [mapProfileUser, setMapProfileUser] = useState<ProfileUser | null>(null);

  // Sync effective position to route generation in the layout phase so the
  // update lands before the browser paints — avoids the one-frame lag that
  // occurred when this ran during render (setState-in-render anti-pattern).
  const prevEffectiveRef = useRef(effectivePos);
  useLayoutEffect(() => {
    if (effectivePos !== prevEffectiveRef.current) {
      prevEffectiveRef.current = effectivePos;
      logic.setEffectiveUserPos(effectivePos);
    }
  });

  // When simulation toggles:
  //  1. Tell useGPS to kill/restart its own watcher
  //  2. Tell useRunningPlayer to kill/restart its GPS watcher and update status
  //     (this is what silences the "TIMEOUT" errors and "מחפש GPS" badge)
  useEffect(() => {
    logic.setSimulationActive(devSim.isMockEnabled);
    useRunningPlayer.getState().setSimulationActive(devSim.isMockEnabled);
  }, [devSim.isMockEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pipe simulated positions into the workout recording pipeline.
  // mockLocation updates every 100 ms; injectSimPosition applies a 5 m threshold
  // so addCoord / updateDistance / updateRunData only fire when enough distance has passed.
  useEffect(() => {
    if (!devSim.isMockEnabled || !devSim.mockLocation || !logic.isWorkoutActive) return;
    console.log('[SimInject] 📍 mockLocation →', devSim.mockLocation, '| workout active:', logic.isWorkoutActive);
    logic.injectSimPosition(devSim.mockLocation);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devSim.mockLocation]);
  const { profile, refreshProfile } = useUserStore();
  const { celebrate } = useGoalCelebration();

  // Resolve the initial map center. Mobile map default->jump fix, round 4
  // (18.08.2026, root-cause investigation): rounds 1-3 fixed WHAT the initial
  // flyTo targets (seeded center, distance-aware duration, preserved zoom)
  // but not WHEN it becomes visible — AppMap's loading skeleton used to wait
  // up to LOCATION_READY_TIMEOUT_MS (3s) for a real GPS fix before revealing,
  // and real-world cold-GPS latency regularly exceeds that budget, so the
  // skeleton force-revealed at the seeded center with no marker, then the
  // (now-fixed, usually near-instant) flyTo + marker pop-in played out in
  // full view anyway — reading as a "reload." `hasAccurateLocationSeed`
  // tells AppMap when it's safe to skip that wait entirely: true only for
  // the last_gps_lat/lng tier (the user's own last real fix, written durably
  // on every accepted fix by useGPS.ts — see GPS_DURABLE_WRITE_MIN_INTERVAL_MS
  // there), since that seed is accurate enough that the later flyTo is a
  // guaranteed no-op (usually <300m, useCameraController's instant-threshold).
  // The anchor-based fallback tiers below stay coarse/unreliable, so a
  // genuinely first-ever launch (no GPS history yet) still gets the brief
  // GPS wait — the one real flyTo there stays hidden behind the skeleton.
  //
  // Round 7 (18.08.2026): a SEPARATE, independent `isSeedFresh` signal for
  // the location marker's own trust bar — deliberately NOT folded into
  // hasAccurateLocationSeed above, which the camera (via initialCenter /
  // AppMap's skeleton-reveal timing) also consumes and which must stay
  // age-agnostic (round 6, 428f161a: the camera intentionally seeds from
  // last_gps of ANY age — a stale seed is still a fine place to START the
  // dive from, since the dive+retarget mechanism corrects it regardless).
  // Marker trust is a different bar: showing the user's own avatar at a
  // location is a factual claim, not just an animation starting point, so
  // it additionally requires the seed to be recent — GPS_SEED_STALENESS_
  // THRESHOLD_MS against last_gps_at. Unknown age (last_gps_at missing, a
  // value durably written before this field existed) is never trusted.
  // initialMapCenter/hasAccurateLocationSeed's own tier logic is otherwise
  // untouched from round 6 — same tiers, same age-agnostic last_gps check.
  let isSeedFresh = false;
  const { initialMapCenter, hasAccurateLocationSeed } = (() => {
    const lastGpsLat = getOnboardingPref('last_gps_lat');
    const lastGpsLng = getOnboardingPref('last_gps_lng');
    if (lastGpsLat && lastGpsLng) {
      const lastGpsAt = getOnboardingPref('last_gps_at');
      const ageMs = lastGpsAt ? Date.now() - parseFloat(lastGpsAt) : Infinity;
      isSeedFresh = ageMs <= GPS_SEED_STALENESS_THRESHOLD_MS;
      return {
        initialMapCenter: { lat: parseFloat(lastGpsLat), lng: parseFloat(lastGpsLng) },
        hasAccurateLocationSeed: true,
      };
    }
    if (profile?.core?.anchorLat && profile?.core?.anchorLng) {
      return {
        initialMapCenter: { lat: profile.core.anchorLat, lng: profile.core.anchorLng },
        hasAccurateLocationSeed: false,
      };
    }
    if (typeof window !== 'undefined') {
      const lat = sessionStorage.getItem('selected_anchor_lat');
      const lng = sessionStorage.getItem('selected_anchor_lng');
      if (lat && lng) {
        return {
          initialMapCenter: { lat: parseFloat(lat), lng: parseFloat(lng) },
          hasAccurateLocationSeed: false,
        };
      }
    }
    const cachedLat = getOnboardingPref('map_anchor_lat');
    const cachedLng = getOnboardingPref('map_anchor_lng');
    if (cachedLat && cachedLng) {
      return {
        initialMapCenter: { lat: parseFloat(cachedLat), lng: parseFloat(cachedLng) },
        hasAccurateLocationSeed: false,
      };
    }
    return { initialMapCenter: null, hasAccurateLocationSeed: false };
  })();

  // Auto-rerouting on deviation. Subscribes to `useRunningPlayer.offRouteEventToken`
  // and, on each new event, swaps `focusedRoute` for a freshly computed route
  // sized to the user's remaining distance (with a direct-line fallback for
  // sub-500m remainders). Hook has no UI of its own — see its top-of-file
  // doc-block for the full state machine. Mounted here, alongside the other
  // workout-lifecycle side effects, so it lives for the entire map session.
  useRouteDeviationOrchestrator({
    focusedRoute: logic.focusedRoute,
    setFocusedRoute: logic.setFocusedRoute,
    currentUserPos: effectivePos ?? null,
    isWorkoutActive: logic.isWorkoutActive,
  });

  // Heatmap heartbeat — strict intent: follows the user's selected activity.
  // routeId is forwarded only while a workout is active so the active_workouts
  // doc carries the curated route binding (consumed by the admin heatmap).
  useActiveWorkoutHeartbeat({
    workoutType:
      contextActivity === 'walking' ? 'walking'
        : contextActivity === 'cycling' ? 'cycling'
        : 'running',
    enabled: logic.isWorkoutActive,
    overrideLocation: effectivePos ?? undefined,
    routeId: logic.isWorkoutActive ? logic.focusedRoute?.id : undefined,
  });

  // ══════ MODE SYNC EFFECTS ══════

  // DEBUG — remove after routing confirmed
  useEffect(() => {
    console.log('[MapShell] mode=', mode, 'isWorkoutActive=', logic.isWorkoutActive, 'runMode=', runMode);
  }, [mode, logic.isWorkoutActive, runMode]);

  // When internal workout state becomes active, sync mode.
  // Uses runMode from useRunningPlayer (set by _doStartActiveWorkout BEFORE
  // setIsWorkoutActive) — NOT logic.workoutMode, which is a local discover/free
  // flag that DiscoverLayer never updates before calling startActiveWorkout().
  useEffect(() => {
    if (logic.isWorkoutActive && !logic.showSummary) {
      if (mode === 'planned_preview' || mode === 'discover' || mode === 'builder' || mode === 'navigate') {
        // DEBUG — remove after routing confirmed
        console.log('[MapShell] mode sync: mode=', mode, 'runMode=', runMode, 'isWorkoutActive=', logic.isWorkoutActive);
        if (runMode === 'free') {
          setMode('free_run');
        } else {
          setMode('active');
        }
      }
    }
  }, [logic.isWorkoutActive, logic.showSummary, runMode, mode, setMode]);

  // When summary should show
  useEffect(() => {
    if ((logic.showSummary || logic.showDopamine) && mode !== 'summary') {
      setMode('summary');
    }
  }, [logic.showSummary, logic.showDopamine, mode, setMode]);

  // Bridge: when the session finishes while in a running mode, signal showSummary
  // so the effect above can transition mode → 'summary' and mount SummaryLayer.
  // FreeRunLayer has no built-in finished→summary path; without this effect the
  // screen freezes on the live drawer and the summary never appears.
  useEffect(() => {
    if (sessionStatus === 'finished' && (mode === 'free_run' || mode === 'active')) {
      logic.setShowSummary(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, mode]);

  // Sync workoutMode when mode changes (discover ↔ free_run)
  useEffect(() => {
    if (mode === 'free_run' && logic.workoutMode !== 'free') {
      logic.setWorkoutMode('free');
    } else if (mode === 'discover' && logic.workoutMode !== 'discover') {
      logic.setWorkoutMode('discover');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ══════ GLOBAL: Referral toast ══════
  const [referralToast, setReferralToast] = useState<string | null>(null);
  const prevReferralCount = useRef<number | null>(null);

  useEffect(() => {
    const uid = profile?.id;
    if (!uid) return;
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      const newCount: number = data.core?.referralCount ?? 0;
      const prev = prevReferralCount.current;
      if (prev !== null && newCount > prev) {
        setReferralToast(`שותף חדש הצטרף לנבחרת! עכשיו אווטיר ב-Out 🤘`);
        setTimeout(() => setReferralToast(null), 4000);
        if (newCount >= 1 && prev < 1) {
          celebrate('referral_unlock', 300);
          refreshProfile();
        }
      }
      prevReferralCount.current = newCount;
    });
    return () => unsub();
  }, [profile?.id, celebrate, refreshProfile]);

  // ══════ Determine AppMap props based on mode ══════
  const isActiveMode = mode === 'active' || mode === 'free_run';
  const showLivePath = isActiveMode && logic.isWorkoutActive;
  // B2: while a hybrid STATION is live, StrengthRunner owns the screen (z-[120],
  // trapped in the draggable transform's stacking context), so the walking chrome
  // below — which renders at the map root — would paint on top of it. Gate it off
  // during 'station'. Global store read; false for non-hybrid runs AND hybrid
  // aerobic legs, so those paths stay byte-identical (chrome still shows there).
  const hybridStationLive = useHybridRun((s) => s.phase === 'station');

  // True when TurnCarousel is mounted — ParticipantStrip must yield navCardHeight
  // to TurnCarousel in that case (both write to the same store field).
  const isTurnCarouselVisible =
    mode !== 'summary' &&
    sessionStatus !== 'finished' &&
    (logic.isNavigationMode || (isActiveMode && !!logic.focusedRoute)) &&
    !!effectivePos &&
    !!logic.focusedRoute?.path;

  // Memoise navigationTurns so AppMap's `turnArrowGeoJSON` memo can stay
  // stable across MapShell re-renders. computeRouteTurns() builds a new
  // array on every call — without this memo every GPS sample / parent
  // re-render produced a fresh `navigationTurns` reference, which the
  // child's <Source data> diff treated as new data and re-uploaded the
  // entire turn-arrow GeoJSON to the GPU. Combined with React's normal
  // 60 Hz cadence that's a buffer overflow waiting to happen.
  const navigationTurns = useMemo(() => {
    const path = logic.focusedRoute?.path;
    if (!path) return null;
    if (guidedRouteTurns && guidedRouteTurns.length > 0) return guidedRouteTurns;
    return computeRouteTurns(path);
  }, [logic.focusedRoute?.path, guidedRouteTurns]);

  // ── Free-run carousel routes — overrides the discover/idle pipeline ──
  // Set by RouteCarousel as soon as `generateDynamicRoutes` resolves so the
  // user sees ALL swipeable route polylines on the map (not just the
  // focused one) and the camera can fitBounds on the active card. Cleared
  // on RouteCarousel unmount, at which point we fall back to the standard
  // mode-driven `routesToDisplay` source below.
  const freeRunCarouselRoutes = useMapStore((s) => s.freeRunCarouselRoutes);

  // Memoised so the `routes` prop passed to <AppMap> keeps a stable
  // identity across unrelated MapShell re-renders. The previous IIFE
  // returned a brand-new array on every render — including the 1 Hz
  // GPS-driven re-renders during active workouts. That fresh reference
  // hit useCameraController's main effect dep array, which then queued
  // and reset a debounced easeTo on every tick. Net effect on iOS was
  // continuous GPU command allocation and visible camera jitter; on
  // memory-constrained WKWebView it accelerated the OOM kill. With
  // useMemo, the array only changes when the underlying inputs actually
  // change (route focus, nav state, free-run carousel population, etc.).
  const mapRoutes = useMemo<Route[]>(() => {
    if (showLivePath) return logic.focusedRoute ? [logic.focusedRoute] : [];
    if (logic.navState === 'navigating') {
      const { recommended, scenic, facilityRich } = logic.navigationVariants;
      const navRoutes = [recommended, scenic, facilityRich]
        .filter((r): r is Route => r !== null)
        .map(r => ({ ...r, isFocused: r.id === logic.focusedRoute?.id }));
      if (navRoutes.length > 0) return navRoutes;
    }
    // Hybrid pre-run overview: the composed loop is a standalone focusedRoute that is
    // NOT in the discover carousel or free-run carousel — draw JUST it (else only its
    // station marker shows and the polyline is missing). Placed above the carousels so
    // a lingering carousel array can't suppress it.
    if (logic.focusedRoute?.id === 'hybrid-route') return [logic.focusedRoute];
    // Free-run carousel takes precedence over discover-mode routes so the
    // user can preview all 3 generated options on the map without us having
    // to mutate the global `allRoutes` pipeline (which would leak into the
    // discover carousel after they exit free-run).
    if (freeRunCarouselRoutes && freeRunCarouselRoutes.length > 0) {
      return freeRunCarouselRoutes.map((r) => ({
        ...r,
        isFocused: r.id === logic.focusedRoute?.id,
      }));
    }
    // Gate: only show route lines when a route is focused (user is in discover mode).
    // This keeps the map clean in idle state.
    if (!logic.focusedRoute) return [];
    return logic.routesToDisplay || [];
  }, [
    showLivePath,
    logic.focusedRoute,
    logic.navState,
    logic.navigationVariants,
    freeRunCarouselRoutes,
    logic.routesToDisplay,
  ]);

  return (
    <main className="relative h-[100dvh] w-full bg-[#f3f4f6] overflow-hidden font-sans" style={{ height: '100dvh' }}>
      {/* ══════ BRAND HEADER ══════
           Suppressed during active workouts: the story bar + TurnCarousel
           already occupy the top chrome, and the header's z-[75] layer
           would compound the overlap with the turn cards and GPS pill.
           In all other modes (discover, navigate, etc.) it floats above
           the Mapbox canvas identically to the Home and Feed pages. */}
      {MAP_OVERVIEW_CHROME_V1 ? (
        // Route-preview: fold the nav-bar up while the hybrid overview drawer is up
        // (DiscoverLayer shows the thin blue OverviewTitleBar in its place). The
        // wrapper is a positioned, 0-height containing block so the header's own
        // absolute bar slides on a fixed px transform (a %-translate on a 0-height
        // wrapper would be a no-op). AnimatePresence initial={false} → no intro on
        // first map load; slide only on open/close.
        <AnimatePresence initial={false}>
          {!isActiveMode && !isOverviewActive && (
            <motion.div
              key="app-header-overlay"
              className="absolute inset-x-0 top-0 z-[75] pointer-events-none"
              initial={{ y: -160, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -160, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              <AppHeader asOverlay />
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        !isActiveMode && <AppHeader asOverlay />
      )}
      {/* Background particles (hidden during active workouts) */}
      {!isActiveMode && (
        <div className="absolute inset-0 z-[-1] pointer-events-none">
          <ParticleBackground />
        </div>
      )}

      {/* ══════ BASE MAP ══════
           Suppressed in free_run mode — FreeRunLayer owns AppMap there
           (it lives inside the draggable motion.div so map + UI drag together).
           Keeping two Mapbox instances alive simultaneously causes GPU/memory issues. */}
      {mode !== 'free_run' && (
      <div className="absolute inset-0 z-0">
        <AppMap
          routes={mapRoutes}
          currentLocation={effectivePos}
          initialCenter={demoCenter ?? initialMapCenter}
          hasAccurateLocationSeed={!demoCenter && hasAccurateLocationSeed}
          isSeedFresh={!demoCenter && isSeedFresh}
          focusedRoute={logic.focusedRoute}
          userBearing={devSim.isMockEnabled && devSim.isSimulating ? devSim.simulatedBearing : logic.userBearing}
          livePath={showLivePath ? logic.livePath : undefined}
          livePathZones={showLivePath ? routeZones : undefined}
          isActiveWorkout={logic.isWorkoutActive}
          isNavigationMode={logic.isNavigationMode}
          onRouteSelect={(route) => {
            // Tap on empty map area: close the detail sheet if open, but keep
            // any focused route highlighted (so the user can still see the
            // carousel context they were exploring).
            if (route === null || route === undefined) {
              if (logic.selectedRoute) logic.setSelectedRoute(null);
              return;
            }

            if (logic.navState === 'navigating' && route.id?.startsWith('nav-')) {
              logic.handleVariantSelect(route.id);
              return;
            }

            // Two-step interaction:
            //   1st tap on a NEW route  → focus only (carousel scrolls,
            //                              camera fits, no sheet)
            //   2nd tap on the FOCUSED route → open the RouteDetailSheet
            if (logic.focusedRoute?.id === route.id) {
              logic.setSelectedRoute(route);
            } else {
              logic.setFocusedRoute(route);
            }
          }}
          selectedRoute={logic.selectedRoute}
          destinationMarker={spotFocus ?? undefined}
          hybridStations={(logic.focusedRoute as any)?.stationMarkers ?? null}
          legPlanStops={legPlanStops.length > 0 ? legPlanStops : null}
          onMapRef={flyover.handleMapRef}
          skipInitialZoom={flyover.flyoverActive || !!spotFocus}
          isAutoFollowEnabled={isMapFollowEnabled}
          onUserPanDetected={() => setMapFollowEnabled(false)}
          onLongPress={devSim.isMockEnabled ? devSim.setMockLocation : undefined}
          simulationActive={devSim.isMockEnabled && devSim.isSimulating}
          speedKmH={devSim.isMockEnabled && devSim.isSimulating ? devSim.simulatedSpeedKmH : undefined}
          partnerPositions={effectivePartners}
          partnerActivityFilter={partnerActivityFilter}
          liveUsersVisible={isDemoMode ? true : liveUsersVisible}
          userPersonaId={profile?.personaId}
          onPartnerClick={(p) => setMapProfileUser({ uid: p.uid, name: p.name, personaId: undefined, lemurStage: p.lemurStage })}
          mapMode={mode}
          activityType={contextActivity}
          navigationTurns={navigationTurns}
          recenterSignal={recenterSignal}
        />
      </div>
      )} {/* end mode !== 'free_run' */}

      {/* ══════ TURN-BY-TURN CAROUSEL ══════
           Single rendering path for every navigation case — guided routes,
           park nav, free-run-with-route. The carousel handles its own
           swipe + smart-zoom (flyTo to the swiped turn, see TurnCarousel).
           When the running player has pre-computed turns (guided routes from
           `my_routes`) we use them directly; otherwise compute turns from
           the route geometry on-the-fly. The single-line NavigationHUD has
           been retired — the carousel reads as a single card when only one
           turn is left, so the HUD's compact form is preserved.

           Visibility guard has two mutually-redundant hurdles:
             • `mode !== 'summary'` — covers flows that route through
               `logic.showSummary` and flip the mode enum.
             • `sessionStatus !== 'finished'` — covers the pure
               free-run flow (FreeRun/index.tsx) that mounts its
               summary screen straight off `useSessionStore.status`
               without touching the mode enum at all.
           Either signal turning off is enough to hide the carousel.
           Without the status check the turn card ships at z-30 and
           visibly bleeds through on top of FreeRunSummary (z-20 base,
           z-50 expanded-map overlay) for any workout that finished
           while a focused route was still attached. */}
      {mode !== 'summary' &&
        sessionStatus !== 'finished' &&
        !hybridStationLive &&
        (logic.isNavigationMode || (isActiveMode && logic.focusedRoute)) &&
        effectivePos && logic.focusedRoute?.path && (
          <TurnCarousel
            // Prefer the store's pre-computed list (set in
            // useWorkoutSession._doStartActiveWorkout for guided routes).
            // Fall back to inline computation for nav-mode walks that don't
            // hydrate the store.
            turns={
              guidedRouteTurns && guidedRouteTurns.length > 0
                ? guidedRouteTurns
                : computeRouteTurns(logic.focusedRoute.path)
            }
            routePath={logic.focusedRoute.path}
            currentLocation={effectivePos}
          />
        )
      }

      {/* ══════ PARTICIPANT STRIP ══════
           Shows during an active group session when TurnCarousel is NOT mounted
           (they share navCardHeight — only one can own it at a time).
           Guard is mode-based, never navCardHeight-value-based (avoids mount loop). */}
      {sharedSession.phase === 'active' && !isTurnCarouselVisible && (
        <ParticipantStrip
          partnerPositions={groupPartnerPositions}
          totalDistanceKm={totalDistanceKm}
        />
      )}

      {/* ══════ RECENTER BUTTON ══════
           Shown when user manually panned the map during an active workout.
           Tapping re-enables auto-follow, which triggers the nav camera effect
           to snap back (because isAutoFollowEnabled is in the effect's dep array). */}
      <AnimatePresence>
        {isActiveMode && !isMapFollowEnabled && !isLapsOpen && !hybridStationLive && (
          <motion.button
            key="recenter"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setMapFollowEnabled(true)}
            className="absolute z-40 pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-sm"
            dir="rtl"
            style={{
              // Bug 1 fix: anchor BELOW the nav card (storyBarHeight + navCardHeight + gap).
              // When navCardHeight=0 (no nav card / HIDDEN / BUBBLE) this simplifies to
              // storyBarHeight + 16 — same as before but consistent.
              top: storyBarHeight > 0
                ? `calc(env(safe-area-inset-top, 0px) + ${storyBarHeight + navCardHeight + 16}px)`
                : `calc(env(safe-area-inset-top, 0px) + ${navCardHeight + 16}px + 4rem)`,
              right: '1rem',
              background: 'rgba(5, 8, 18, 0.82)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              // Brand cyan token (`out-cyan` in tailwind.config.ts = #00ADEF).
              // rgba() variants kept inline because Tailwind tokens can't be
              // resolved inside style strings without a JIT class.
              border: '1px solid rgba(0,173,239,0.4)',
              color: '#00ADEF',
              boxShadow: '0 4px 20px rgba(0,173,239,0.2), 0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <LocateFixed size={16} />
            מרכז אותי
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══════ LAYER ROUTER ══════ */}
      {mode === 'discover' && <DiscoverLayer logic={logic} flyoverComplete={flyover.flyoverComplete} devSim={devSim} initialOpenRun={initialOpenRun} targetSteps={targetSteps} onRecenter={handleRecenter} />}
      {mode === 'builder' && <BuilderLayer logic={logic} />}
      {mode === 'navigate' && <NavigateLayer logic={logic} />}
      {mode === 'free_run' && <FreeRunLayer logic={logic} effectivePos={effectivePos} onRecenter={handleRecenter} />}
      {mode === 'planned_preview' && <PlannedPreviewLayer logic={logic} />}
      {mode === 'active' && <ActiveWorkoutLayer logic={logic} />}
      {mode === 'summary' && <SummaryLayer logic={logic} />}

      {/* ══════ SESSION LOBBY ══════
           Group session waiting room — shown when phase === 'lobby'.
           Host gets share link + Start button; members see roster.
           Transitions to active → shows 3s countdown → "התחל ריצה" CTA.
           z-[60] — above all map content, unmounts when phase leaves 'lobby'/'active-transition'. */}
      {(sharedSession.phase === 'lobby' || sharedSession.phase === 'active') &&
        sharedSession.groupId &&
        mode !== 'free_run' &&
        mode !== 'active' && (
          <SessionLobbyOverlay
            onStartFreeRun={() => {
              useRunningPlayer.getState().setIsGroupRun(true);
              logic.setWorkoutMode('free');
              logic.startActiveWorkout();
              setMode('free_run');
            }}
            ephemeralActivityType={
              logic.preferences.activity === 'walking' ? 'walking' : 'running'
            }
          />
        )}

      {/* ══════ MILESTONE FEED ══════
           Social toasts during group sessions: "מיכל · 3 ק"מ", "יחד עברתם 5 ק"מ".
           z-[55] — above WorkoutControlCluster (z-[54]), fades in from left. */}
      {sharedSession.phase === 'active' && <MilestoneFeed milestones={milestones} />}

      {/* ══════ SESSION CONTROLS (Play/Pause, Stop, Lap) — z-40, above workout layers ══════
           Suppressed for ALL running modes because each one now owns its own controls:
             • `plan`      → PlannedRunActive: LongPressPauseButton + cyan SkipForward FAB.
             • `free`      → FreeRunActive: WorkoutControlCluster (Lap / Pause / Stop) ported
                              from the structured-workout language. Long-press confirms
                              destructive actions; Lap stays single-tap.
             • `my_routes` → GuidedRouteView wraps FreeRun, so the same cluster applies.
           This guard stays as an explicit allow-list rather than removing the mount entirely
           so that any future non-running active mode (e.g. a calisthenics player) still
           inherits the global bar by default. */}
      {isActiveMode &&
        runMode !== 'plan' &&
        runMode !== 'free' &&
        runMode !== 'my_routes' && <SessionControlBar />}

      {/* ══════ GLOBAL OVERLAYS ══════ */}
      <JITSetupModal
        isOpen={logic.jitState.isModalOpen}
        requirements={logic.jitState.requirements}
        onComplete={logic.jitState.onComplete}
        onDismiss={logic.dismissJIT}
        onCancel={logic.cancelJIT}
      />

      <AnimatePresence>
        {referralToast && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="fixed bottom-24 left-4 right-4 z-[95] mx-auto max-w-sm"
          >
            <div className="bg-gray-900/95 backdrop-blur-md rounded-2xl px-5 py-3.5 shadow-2xl flex items-center gap-3" dir="rtl">
              <span className="text-xl">🤘</span>
              <p className="text-[13px] font-bold text-white leading-snug">{referralToast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ══════ USER PROFILE SHEET (map partner click) ══════ */}
      <UserProfileSheet
        isOpen={!!mapProfileUser}
        onClose={() => setMapProfileUser(null)}
        user={mapProfileUser}
      />
    </main>
  );
}

// ── Map entry point ───────────────────────────────────────────────────────────
// Owns the full boot sequence: location gate (as a warm overlay, not a tree
// gate), MapModeProvider context, then MapShellInner.
//
// KEY ARCHITECTURE CHANGE vs the previous FullMapView pattern:
//   Before: needsLocationGate returned <UnifiedLocationStep> INSTEAD of the
//           map tree, meaning Mapbox never mounted until the gate cleared.
//   Now:    MapShellInner (and therefore AppMap) always mounts immediately
//           so Mapbox downloads its style + tiles while the gate is visible.
//           The gate is a z-[80] fixed overlay — the user still can't interact
//           with the map, but by the time they complete the anchor step the
//           canvas is already warm and the map appears instantly.
export default function MapShell({ initialWorkoutId, initialContext, spotFocus }: MapShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapPurpose = (initialContext ?? searchParams.get('context') ?? 'general') as MapPurpose;
  const initialOpenRun = searchParams.get('openRun'); // 'running' | 'walking' | null
  const targetSteps = searchParams.get('targetSteps'); // step-goal push deep-link target, or null
  const isDemoMode = searchParams.get('demo') === '1';

  const fromExplorer = searchParams.get('fromExplorer') === 'true';

  // [A2-SPIKE] TEMPORARY diagnostic — this is the true outer root: mounted
  // once per /map page.tsx → next/dynamic(MapShellEntry) entry. Distinct
  // from the mode-change log inside MapShellInner below — mode changes are
  // just MapModeContext state and do NOT unmount this component. If THIS
  // logs UNMOUNTED then re-MOUNTED while a run is active, that's a full
  // route-level remount (in-app tab navigation away and back); if it never
  // logs UNMOUNTED during the whole scenario, MapShell stayed mounted the
  // entire time and the bug is not about unmounting.
  useEffect(() => {
    console.log('[A2-SPIKE][MapShell] outer MapShell MOUNTED');
    return () => {
      console.log('[A2-SPIKE][MapShell] outer MapShell UNMOUNTED');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = useUserStore((s) => s.profile);
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const refreshProfile = useUserStore((s) => s.refreshProfile);

  const [manuallyCleared, setManuallyCleared] = useState(false);
  const mapPrefRestoreAttempted = useRef(false);

  const needsLocationGate = useMemo(() => {
    if (isDemoMode) return false;   // booth demo: skip all gates
    if (fromExplorer) return false;
    if (manuallyCleared) return false;
    if (!hasHydrated) return false;
    if (!profile) return false;
    if (profile.core?.authorityId) return false;
    if (profile.onboardingPath === 'MAP_ONLY') return false;
    return true;
  }, [isDemoMode, fromExplorer, manuallyCleared, hasHydrated, profile]);

  // Universal identity gate: the map requires a name before rendering.
  // Without a name, the presence heartbeat silently skips and the user is
  // invisible — redirect to complete the identity step instead.
  // MAP_ONLY users (anonymous explore path + run-invite guests) are intentionally
  // nameless — they bypass this gate.
  // Demo mode (?demo=1) also bypasses — it never writes presence and needs no profile.
  useEffect(() => {
    if (isDemoMode) return;
    if (!hasHydrated) return;
    if (profile && !profile.core?.name && profile.onboardingPath !== 'MAP_ONLY') {
      router.replace('/onboarding-new/profile');
    }
  }, [isDemoMode, hasHydrated, profile, router]);

  // fromExplorer bypass: clean URL and sync location to Firestore
  useEffect(() => {
    if (!fromExplorer) return;
    router.replace('/map');
    if (typeof window === 'undefined') return;
    const authorityId = sessionStorage.getItem('selected_authority_id');
    const neighborhoodId = sessionStorage.getItem('selected_neighborhood_id');
    const lat = sessionStorage.getItem('selected_anchor_lat');
    const lng = sessionStorage.getItem('selected_anchor_lng');
    sessionStorage.removeItem('selected_anchor_lat');
    sessionStorage.removeItem('selected_anchor_lng');
    sessionStorage.removeItem('selected_authority_id');
    sessionStorage.removeItem('selected_neighborhood_id');
    const hasData = authorityId || lat || lng;
    if (hasData) {
      syncLocationToFirestore({
        authorityId: authorityId || undefined,
        neighborhoodId: neighborhoodId || undefined,
        anchorLat: lat ? parseFloat(lat) : undefined,
        anchorLng: lng ? parseFloat(lng) : undefined,
      }).then(() => refreshProfile());
    }
  }, [fromExplorer, router, refreshProfile]);

  // Fix 2b — restore a durably-saved map location instead of re-showing the
  // gate. Applies to non-MAP_ONLY profiles that lost core.authorityId (e.g. a
  // Firestore write interrupted by a hard-close). Promotes the saved answer to
  // Firestore + refreshes, then clears the gate — mirrors the fromExplorer path
  // but sourced from the durable pref layer (survives hard-close). Runs at most
  // once per mount; if nothing is saved, the gate shows normally.
  useEffect(() => {
    if (mapPrefRestoreAttempted.current) return;
    if (isDemoMode || fromExplorer) return;
    if (!hasHydrated || !profile) return;
    if (profile.core?.authorityId) return;
    if (profile.onboardingPath === 'MAP_ONLY') return;
    mapPrefRestoreAttempted.current = true;
    let cancelled = false;
    (async () => {
      const authId = await getOnboardingPrefAsync('map_authority_id');
      const neighborhoodId = await getOnboardingPrefAsync('map_neighborhood_id');
      const lat = await getOnboardingPrefAsync('map_anchor_lat');
      const lng = await getOnboardingPrefAsync('map_anchor_lng');
      if (cancelled || (!authId && !lat)) return;
      await syncLocationToFirestore({
        authorityId: authId || undefined,
        neighborhoodId: neighborhoodId || undefined,
        anchorLat: lat ? parseFloat(lat) : undefined,
        anchorLng: lng ? parseFloat(lng) : undefined,
      });
      if (cancelled) return;
      await refreshProfile();
      setManuallyCleared(true);
    })();
    return () => { cancelled = true; };
  }, [isDemoMode, fromExplorer, hasHydrated, profile, refreshProfile]);

  // ── Staggered gate mount (perf) ──────────────────────────────────────────
  // UnifiedLocationStep(mode="bridge") mounts its OWN full Mapbox GL instance
  // the moment it renders. AppMap above (inside MapShellInner) already starts
  // its own cold-boot unconditionally, from the first render — so showing the
  // gate at the exact same React commit as `needsLocationGate` flipping true
  // means two WebGL cold-boots (init, ~150-layer style sweep, tile fetch)
  // compete for CPU/GPU/network at the same instant, on the exact "open the
  // map" action the heat complaint is about. See
  // .claude/knowledge/onboarding-map-location-perf-audit.md finding #5.
  //
  // This delays ONLY the gate overlay's own appearance, by a short, one-way
  // stagger (never un-shows an already-shown gate) — it touches nothing in
  // the non-gated path (the vast majority of map opens): `needsLocationGate`
  // stays false for those users and this state never turns true regardless.
  // During the gap the user sees whatever AppMap is currently showing: on a
  // cold JS cache (first visit), that's its light-gray dynamic-import
  // `loading` fallback (`bg-[#f3f4f6]` below) for the whole gap — seamless.
  // On a WARM cache (return visit, JS chunk already parsed), AppMap mounts
  // immediately and Mapbox's own cold-boot (WebGL init, style sweep, tiles)
  // races the 400ms timer — if it finishes first, bare map tiles could be
  // briefly visible/tappable before the gate covers them. Not a security or
  // data-integrity issue (park data is public read; any write still needs
  // authorityId per Firestore rules) — purely a "did the map flash through"
  // UX question. Device test must cover BOTH cache states, not just first-visit.
  //
  // Deliberate tradeoff, NOT a reversal of the original "warms up behind the
  // gate" design (file docstring above): AppMap keeps warming from t=0
  // either way, only the gate's OWN Mapbox instance starts slightly later.
  // NEEDS DEVICE VERIFICATION before this ships — see above.
  const [gateVisible, setGateVisible] = useState(false);
  useEffect(() => {
    if (gateVisible) return;
    if (!needsLocationGate) return;
    const id = setTimeout(() => setGateVisible(true), 400);
    return () => clearTimeout(id);
  }, [needsLocationGate, gateVisible]);

  const handleLocationGateComplete = async () => {
    if (typeof window !== 'undefined') {
      const authorityId = sessionStorage.getItem('selected_authority_id');
      const neighborhoodId = sessionStorage.getItem('selected_neighborhood_id');
      const lat = sessionStorage.getItem('selected_anchor_lat');
      const lng = sessionStorage.getItem('selected_anchor_lng');
      sessionStorage.removeItem('selected_anchor_lat');
      sessionStorage.removeItem('selected_anchor_lng');
      sessionStorage.removeItem('selected_authority_id');
      sessionStorage.removeItem('selected_neighborhood_id');
      const hasData = authorityId || lat || lng;
      if (hasData) {
        await syncLocationToFirestore({
          authorityId: authorityId || undefined,
          neighborhoodId: neighborhoodId || undefined,
          anchorLat: lat ? parseFloat(lat) : undefined,
          anchorLng: lng ? parseFloat(lng) : undefined,
        });
        refreshProfile();
      }
    }
    setManuallyCleared(true);
  };

  return (
    <>
      {/* Map tree always mounts — Mapbox warms up behind the gate */}
      <MapModeProvider initialWorkoutId={initialWorkoutId ?? null} initialContext={initialContext}>
        <MapShellInner spotFocus={spotFocus ?? null} initialOpenRun={initialOpenRun} targetSteps={targetSteps} isDemoMode={isDemoMode} />
      </MapModeProvider>

      {/* Location gate — high z-index overlay, not a tree gate.
          gateVisible staggers its (separate) Mapbox instance behind AppMap's —
          see the gateVisible comment above. */}
      {needsLocationGate && gateVisible && (
        <Suspense
          fallback={<div className="fixed inset-0 z-[80] bg-[#f3f4f6]" aria-busy="true" />}
        >
          <div className="fixed inset-0 z-[80]">
            <UnifiedLocationStep
              mode="bridge"
              onNext={handleLocationGateComplete}
              purpose={mapPurpose}
            />
          </div>
        </Suspense>
      )}
    </>
  );
}
