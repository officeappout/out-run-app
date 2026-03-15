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
import { useMapLogic } from '@/features/parks';
import { useUserStore } from '@/features/user';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import ParticleBackground from '@/components/ParticleBackground';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { useFlyoverEntrance } from '@/features/safecity/hooks/useFlyoverEntrance';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import DiscoverLayer from './layers/DiscoverLayer';
import BuilderLayer from './layers/BuilderLayer';
import NavigateLayer from './layers/NavigateLayer';
import FreeRunLayer from './layers/FreeRunLayer';
import PlannedPreviewLayer from './layers/PlannedPreviewLayer';
import ActiveWorkoutLayer from './layers/ActiveWorkoutLayer';
import SummaryLayer from './layers/SummaryLayer';

const AppMap = dynamicImport(() => import('@/features/parks/core/components/AppMap'), {
  loading: () => <div className="h-full w-full bg-[#f3f4f6]" />,
  ssr: false,
});

export default function MapShell() {
  const { mode, setMode, activityType: contextActivity } = useMapMode();
  const logic = useMapLogic(mode, contextActivity);
  const routeZones = useRunningPlayer((s) => s.routeZones);
  const isMapFollowEnabled = useRunningPlayer((s) => s.isMapFollowEnabled);
  const setMapFollowEnabled = useRunningPlayer((s) => s.setMapFollowEnabled);
  const flyover = useFlyoverEntrance(logic.currentUserPos ?? null);
  const { profile, refreshProfile } = useUserStore();
  const { celebrate } = useGoalCelebration();

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
    if (mode === 'navigate') {
      const navRoute = logic.navigationRoutes[logic.selectedNavActivity];
      return navRoute ? [navRoute] : [];
    }
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
          currentLocation={logic.currentUserPos}
          userBearing={logic.userBearing}
          livePath={showLivePath ? logic.livePath : undefined}
          livePathZones={showLivePath ? routeZones : undefined}
          isActiveWorkout={logic.isWorkoutActive}
          isNavigationMode={logic.isNavigationMode}
          onRouteSelect={logic.setSelectedRoute}
          selectedRoute={logic.selectedRoute}
          onMapRef={flyover.handleMapRef}
          skipInitialZoom={flyover.flyoverActive}
          isAutoFollowEnabled={isMapFollowEnabled}
          onUserPanDetected={() => setMapFollowEnabled(false)}
        />
      </div>

      {/* ══════ LAYER ROUTER ══════ */}
      {mode === 'discover' && <DiscoverLayer logic={logic} flyoverComplete={flyover.flyoverComplete} />}
      {mode === 'builder' && <BuilderLayer logic={logic} />}
      {mode === 'navigate' && <NavigateLayer logic={logic} />}
      {mode === 'free_run' && <FreeRunLayer logic={logic} />}
      {mode === 'planned_preview' && <PlannedPreviewLayer logic={logic} />}
      {mode === 'active' && <ActiveWorkoutLayer logic={logic} />}
      {mode === 'summary' && <SummaryLayer logic={logic} />}

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
    </main>
  );
}
