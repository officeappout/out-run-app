'use client';

/**
 * MapShell — Thin orchestrator.
 *
 * Renders ONLY:
 *   1. Base AppMap
 *   2. Layer Router (switch on mode)
 *   3. Global overlays (JIT modal, referral toast, ParticleBackground)
 *   4. Mode-sync effects
 *
 * All mode-specific UI lives in the layer components.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamicImport from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import { useMapLogic } from '@/features/parks';
import type { Route } from '@/features/parks/core/types/route.types';
import { useUserStore } from '@/features/user';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import ParticleBackground from '@/components/ParticleBackground';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { SmartwatchPromptModal } from '@/features/user/onboarding/components/SmartwatchPromptModal';
import { useFlyoverEntrance } from '@/features/safecity/hooks/useFlyoverEntrance';
import { usePresenceLayer } from '@/features/safecity/hooks/usePresenceLayer';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useActiveWorkoutHeartbeat } from '@/features/heatmap/hooks/useActiveWorkoutHeartbeat';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useDevSimulation } from '@/features/parks/core/hooks/useDevSimulation';
import { useGroupPresence } from '@/features/parks/core/hooks/useGroupPresence';
import { useMapStore } from '@/features/parks/core/store/useMapStore';
import { useRouteDeviationOrchestrator } from '@/features/parks/core/hooks/useRouteDeviationOrchestrator';
import DiscoverLayer from './layers/DiscoverLayer';
import BuilderLayer from './layers/BuilderLayer';
import NavigateLayer from './layers/NavigateLayer';
import FreeRunLayer from './layers/FreeRunLayer';
import PlannedPreviewLayer from './layers/PlannedPreviewLayer';
import ActiveWorkoutLayer from './layers/ActiveWorkoutLayer';
import SummaryLayer from './layers/SummaryLayer';
import TurnCarousel from '@/features/parks/core/components/TurnCarousel';
import { computeRouteTurns } from '@/features/parks/core/services/geoUtils';
import SessionControlBar from '@/features/parks/core/components/SessionControlBar';
import UserProfileSheet, { type ProfileUser } from '@/features/parks/client/components/UserProfileSheet';

const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#f3f4f6]" />,
  ssr: false,
});

interface MapShellProps {
  /** If set, flyTo this coordinate on map-ready (community navigation) */
  spotFocus?: { lat: number; lng: number } | null;
}

export default function MapShell({ spotFocus }: MapShellProps) {
  const { mode, setMode, activityType: contextActivity } = useMapMode();
  const logic = useMapLogic(mode, contextActivity);
  const routeZones = useRunningPlayer((s) => s.routeZones);
  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);
  const guidedRouteTurns = useRunningPlayer((s) => s.guidedRouteTurns);
  const runMode = useRunningPlayer((s) => s.runMode);
  const devSim = useDevSimulation();
  const effectivePos = devSim.effectiveLocation(logic.currentUserPos);

  // Presence heartbeat — uses effectivePos so mock location is broadcast
  usePresenceLayer(effectivePos ?? null, true);

  const flyover = useFlyoverEntrance(effectivePos ?? null);
  const livePartnerPositions = useGroupPresence();
  const partnerActivityFilter = useMapStore((s) => s.partnerActivityFilter);
  const liveUsersVisible = useMapStore((s) => s.liveUsersVisible);
  const [mapProfileUser, setMapProfileUser] = useState<ProfileUser | null>(null);

  // Sync effective position to route generation — use layout-phase ref to avoid
  // extra render cycle delay when dragging the simulation marker.
  const prevEffectiveRef = useRef(effectivePos);
  if (effectivePos !== prevEffectiveRef.current) {
    prevEffectiveRef.current = effectivePos;
    logic.setEffectiveUserPos(effectivePos);
  }

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

  // Resolve the initial map center: prefer the persisted profile anchor, then
  // fall back to sessionStorage so the map lands on the right neighborhood
  // even before the Firestore profile has fully hydrated.
  const initialMapCenter: { lat: number; lng: number } | null = (() => {
    if (profile?.core?.anchorLat && profile?.core?.anchorLng) {
      return { lat: profile.core.anchorLat, lng: profile.core.anchorLng };
    }
    if (typeof window !== 'undefined') {
      const lat = sessionStorage.getItem('selected_anchor_lat');
      const lng = sessionStorage.getItem('selected_anchor_lng');
      if (lat && lng) return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }
    return null;
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

  // When internal workout state becomes active, sync mode
  useEffect(() => {
    if (logic.isWorkoutActive && !logic.showSummary) {
      if (mode === 'planned_preview' || mode === 'discover' || mode === 'builder' || mode === 'navigate') {
        if (logic.workoutMode === 'free') {
          setMode('free_run');
        } else {
          setMode('active');
        }
      }
    }
  }, [logic.isWorkoutActive, logic.showSummary, logic.workoutMode, mode, setMode]);

  // When summary should show
  useEffect(() => {
    if ((logic.showSummary || logic.showDopamine) && mode !== 'summary') {
      setMode('summary');
    }
  }, [logic.showSummary, logic.showDopamine, mode, setMode]);

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

  const mapRoutes = (() => {
    if (showLivePath) return logic.focusedRoute ? [logic.focusedRoute] : [];
    if (logic.navState === 'navigating') {
      const { recommended, scenic, facilityRich } = logic.navigationVariants;
      const navRoutes = [recommended, scenic, facilityRich]
        .filter((r): r is Route => r !== null)
        .map(r => ({ ...r, isFocused: r.id === logic.focusedRoute?.id }));
      if (navRoutes.length > 0) return navRoutes;
    }
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
  })();

  return (
    <main className="relative h-[100dvh] w-full bg-[#f3f4f6] overflow-hidden font-sans" style={{ height: '100dvh' }}>
      {/* Background particles (hidden during active workouts) */}
      {!isActiveMode && (
        <div className="absolute inset-0 z-[-1] pointer-events-none">
          <ParticleBackground />
        </div>
      )}

      {/* ══════ BASE MAP ══════ */}
      <div className="absolute inset-0 z-0">
        <AppMap
          routes={mapRoutes}
          currentLocation={effectivePos}
          initialCenter={initialMapCenter}
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
          onMapRef={flyover.handleMapRef}
          skipInitialZoom={flyover.flyoverActive || !!spotFocus}
          isAutoFollowEnabled={isMapFollowEnabled}
          onUserPanDetected={() => setMapFollowEnabled(false)}
          onLongPress={devSim.isMockEnabled ? devSim.setMockLocation : undefined}
          simulationActive={devSim.isMockEnabled && devSim.isSimulating}
          speedKmH={devSim.isMockEnabled && devSim.isSimulating ? devSim.simulatedSpeedKmH : undefined}
          partnerPositions={livePartnerPositions}
          partnerActivityFilter={partnerActivityFilter}
          liveUsersVisible={liveUsersVisible}
          userPersonaId={profile?.personaId}
          onPartnerClick={(p) => setMapProfileUser({ uid: p.uid, name: p.name, personaId: undefined, lemurStage: p.lemurStage })}
          mapMode={mode}
          activityType={contextActivity}
          navigationTurns={navigationTurns}
        />
      </div>

      {/* ══════ TURN-BY-TURN CAROUSEL ══════
           Single rendering path for every navigation case — guided routes,
           park nav, free-run-with-route. The carousel handles its own
           swipe + smart-zoom (flyTo to the swiped turn, see TurnCarousel).
           When the running player has pre-computed turns (guided routes from
           `my_routes`) we use them directly; otherwise compute turns from
           the route geometry on-the-fly. The single-line NavigationHUD has
           been retired — the carousel reads as a single card when only one
           turn is left, so the HUD's compact form is preserved. */}
      {(logic.isNavigationMode || (isActiveMode && logic.focusedRoute)) &&
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

      {/* ══════ RECENTER BUTTON ══════
           Shown when user manually panned the map during an active workout.
           Tapping re-enables auto-follow, which triggers the nav camera effect
           to snap back (because isAutoFollowEnabled is in the effect's dep array). */}
      <AnimatePresence>
        {isActiveMode && !isMapFollowEnabled && (
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
              top: '8rem',
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
      {mode === 'discover' && <DiscoverLayer logic={logic} flyoverComplete={flyover.flyoverComplete} devSim={devSim} />}
      {mode === 'builder' && <BuilderLayer logic={logic} />}
      {mode === 'navigate' && <NavigateLayer logic={logic} />}
      {mode === 'free_run' && <FreeRunLayer logic={logic} />}
      {mode === 'planned_preview' && <PlannedPreviewLayer logic={logic} />}
      {mode === 'active' && <ActiveWorkoutLayer logic={logic} />}
      {mode === 'summary' && <SummaryLayer logic={logic} />}

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

      {/* Smartwatch teaser — surfaces for first-time runners AFTER JIT
          requirements clear and BEFORE the workout actually starts. The
          modal calls back into useSmartwatchPrompt's onClose, which
          trampolines _doStartActiveWorkout. The two pre-flight gates
          can never be open at the same time (JIT runs first, smartwatch
          opens only inside JIT's onComplete) so they share z-[90]
          without visual collision. */}
      <SmartwatchPromptModal
        isOpen={logic.smartwatchPrompt.isOpen}
        onClose={() => logic.smartwatchPrompt.onClose?.()}
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
