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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamicImport from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { LocateFixed } from 'lucide-react';
import { useMapLogic } from '@/features/parks';
import type { Route } from '@/features/parks/core/types/route.types';
import { useUserStore } from '@/features/user';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import ParticleBackground from '@/components/ParticleBackground';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { useFlyoverEntrance } from '@/features/safecity/hooks/useFlyoverEntrance';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useActiveWorkoutHeartbeat } from '@/features/heatmap/hooks/useActiveWorkoutHeartbeat';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useDevSimulation } from '@/features/parks/core/hooks/useDevSimulation';
import { useGroupPresence } from '@/features/parks/core/hooks/useGroupPresence';
import DiscoverLayer from './layers/DiscoverLayer';
import BuilderLayer from './layers/BuilderLayer';
import NavigateLayer from './layers/NavigateLayer';
import FreeRunLayer from './layers/FreeRunLayer';
import PlannedPreviewLayer from './layers/PlannedPreviewLayer';
import ActiveWorkoutLayer from './layers/ActiveWorkoutLayer';
import SummaryLayer from './layers/SummaryLayer';
import NavigationHUD from '@/features/parks/core/components/NavigationHUD';
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
  const devSim = useDevSimulation();
  const effectivePos = devSim.effectiveLocation(logic.currentUserPos);
  const flyover = useFlyoverEntrance(effectivePos ?? null);
  const livePartnerPositions = useGroupPresence();
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

  // Heatmap heartbeat — strict intent: follows the user's selected activity
  useActiveWorkoutHeartbeat({
    workoutType:
      contextActivity === 'walking' ? 'walking'
        : contextActivity === 'cycling' ? 'cycling'
        : 'running',
    enabled: logic.isWorkoutActive,
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

  const mapRoutes = (() => {
    if (showLivePath) return logic.focusedRoute ? [logic.focusedRoute] : [];
    if (logic.navState === 'navigating') {
      const { recommended, scenic, facilityRich } = logic.navigationVariants;
      const navRoutes = [recommended, scenic, facilityRich]
        .filter((r): r is Route => r !== null)
        .map(r => ({ ...r, isFocused: r.id === logic.focusedRoute?.id }));
      if (navRoutes.length > 0) return navRoutes;
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
            if (logic.navState === 'navigating' && route?.id?.startsWith('nav-')) {
              logic.handleVariantSelect(route.id);
            } else {
              logic.setSelectedRoute(route);
            }
          }}
          selectedRoute={logic.selectedRoute}
          destinationMarker={spotFocus ?? undefined}
          onMapRef={flyover.handleMapRef}
          skipInitialZoom={flyover.flyoverActive || !!spotFocus}
          isAutoFollowEnabled={isMapFollowEnabled}
          onUserPanDetected={() => setMapFollowEnabled(false)}
          onLongPress={devSim.isMockEnabled ? devSim.setMockLocation : undefined}
          simulationActive={devSim.isMockEnabled}
          speedKmH={devSim.isMockEnabled && devSim.isSimulating ? devSim.simulatedSpeedKmH : undefined}
          partnerPositions={livePartnerPositions}
          userPersonaId={profile?.personaId}
          onPartnerClick={(p) => setMapProfileUser({ uid: p.uid, name: p.name, personaId: undefined, lemurStage: p.lemurStage })}
        />
      </div>

      {/* ══════ NAVIGATION HUD (turn-by-turn banner) ══════ */}
      {(logic.isNavigationMode || (isActiveMode && logic.focusedRoute)) &&
        effectivePos && logic.focusedRoute?.path && (
        <NavigationHUD
          routePath={logic.focusedRoute.path}
          currentLocation={effectivePos}
          userBearing={devSim.isMockEnabled && devSim.isSimulating ? devSim.simulatedBearing : logic.userBearing}
        />
      )}

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
              border: '1px solid rgba(0,229,255,0.4)',
              color: '#00E5FF',
              boxShadow: '0 4px 20px rgba(0,229,255,0.2), 0 2px 8px rgba(0,0,0,0.4)',
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

      {/* ══════ SESSION CONTROLS (Play/Pause, Stop, Lap) — z-40, above workout layers ══════ */}
      {isActiveMode && <SessionControlBar />}

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
