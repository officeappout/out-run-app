'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import FreeRunActive from './FreeRunActive';

export default function FreeRun() {
  const router = useRouter();
  const { status, endSession } = useSessionStore();
  const { startGPSTracking, stopGPSTracking } = useRunningPlayer();

  // Unlock audio engine on mount (for iOS Safari)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioService.unlock();
    }
  }, []);

  // Start GPS tracking when workout becomes active
  useEffect(() => {
    if (status === 'active') {
      startGPSTracking();
    } else {
      stopGPSTracking();
    }

    // Cleanup on unmount
    return () => {
      stopGPSTracking();
    };
  }, [status, startGPSTracking, stopGPSTracking]);

  // Clear group session context when workout finishes — fires after the XP
  // award calls have been initiated in useRunningPlayer.finishWorkout().
  useEffect(() => {
    if (status === 'finished') {
      useSharedSession.getState().clearGroupSession();
    }
  }, [status]);

  const handleBack = () => {
    endSession();
    router.push('/map');
  };

  // Switch between views based on status.
  //
  // The previous build swapped between FreeRunActive (running) and
  // FreeRunPaused (paused) as separate top-level components — but that
  // unmount/remount cycle made the in-place "paused = orange chrome"
  // state machine impossible (the controls cluster was being torn down
  // the instant the user paused). FreeRunActive now owns BOTH states
  // internally: WorkoutControlCluster swaps its 2-button row, and
  // AdaptiveMetricsWrapper paints an orange border + orange numbers
  // when `useSessionStore.status === 'paused'`. FreeRunPaused (the old
  // dark-glass view) is intentionally no longer rendered here.
  // 'finished': render nothing. The post-run summary is owned by MapShell —
  // its finished→showSummary bridge flips mode to 'summary' on the very next
  // effect pass, unmounting this layer and mounting SummaryLayer →
  // WorkoutSummaryPage → AerobicSummaryShell (AEROBIC_SOLO_ENABLED). The legacy
  // FreeRunSummary that used to render here was only ever visible for that
  // 1–2 frame gap (no tap could reach its buttons) and was retired 16.10.2026.
  if (status === 'finished') {
    return null;
  }

  return <FreeRunActive onBack={handleBack} />;
}
