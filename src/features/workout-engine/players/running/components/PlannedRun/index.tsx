'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import WorkoutPreviewScreen from './WorkoutPreviewScreen';
import PlannedRunActive from './PlannedRunActive';

export default function PlannedRun() {
  const router = useRouter();
  const { status, startSession, endSession } = useSessionStore();
  const {
    currentWorkout,
    startGPSTracking,
    stopGPSTracking,
    initializeRunningData,
  } = useRunningPlayer();

  // Unlock audio for iOS on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioService.unlock();
    }
  }, []);

  // GPS lifecycle — track when active, stop otherwise
  useEffect(() => {
    if (status === 'active') {
      startGPSTracking();
    } else {
      stopGPSTracking();
    }
    return () => {
      stopGPSTracking();
    };
  }, [status, startGPSTracking, stopGPSTracking]);

  const handleStart = () => {
    initializeRunningData();
    startSession('running');
  };

  const handleBack = () => {
    endSession();
    router.push('/map');
  };

  // ── State machine ────────────────────────────────────────────────

  if (!currentWorkout) {
    return null;
  }

  if (status === 'idle') {
    return (
      <WorkoutPreviewScreen
        workout={currentWorkout}
        onStart={handleStart}
        onBack={handleBack}
      />
    );
  }

  // 'finished': render nothing. The post-run summary is owned by MapShell —
  // its finished→showSummary bridge flips mode to 'summary' on the very next
  // effect pass, unmounting this layer and mounting SummaryLayer →
  // WorkoutSummaryPage → AerobicSummaryShell (AEROBIC_SOLO_ENABLED). The legacy
  // FreeRunSummary that used to render here was only ever visible for that
  // 1–2 frame gap (no tap could reach its buttons) and was retired 16.10.2026.
  //
  // KNOWN GAP (pre-existing, not introduced here): the "save" handler that
  // FreeRunSummary used to call from this file was the ONLY caller of
  // markSessionComplete (workout-completion.service.ts — marks the running
  // program's week/day done from the planned_run_week/_day sessionStorage keys
  // PlannedPreviewLayer sets). Because that button was never reachable, the
  // live planned-run finish has not been marking program sessions complete.
  // The removed handler is in this file's pre-16.10.2026 history for whoever
  // wires it into the live finish path.
  if (status === 'finished') {
    return null;
  }

  // Both 'active' and 'paused' are handled inside PlannedRunActive
  // (it renders its own Strength-style pause overlay when paused)
  return <PlannedRunActive onBack={handleBack} />;
}
