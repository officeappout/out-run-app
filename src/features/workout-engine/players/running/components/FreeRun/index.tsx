'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import FreeRunActive from './FreeRunActive';
import FreeRunSummary from './FreeRunSummary';

export default function FreeRun() {
  const router = useRouter();
  const { status, endSession, clearSession } = useSessionStore();
  const { startGPSTracking, stopGPSTracking, clearRunningData } = useRunningPlayer();

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

  const handleBack = () => {
    endSession();
    router.push('/map');
  };

  const handleDelete = () => {
    // Clear all data and go back to map
    clearRunningData();
    clearSession();
    router.push('/map');
  };

  const handleSave = () => {
    // Workout is already saved in useRunningPlayer.ts finishWorkout()
    // Just clear state and navigate home
    clearRunningData();
    clearSession();
    router.push('/home');
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
  if (status === 'finished') {
    return <FreeRunSummary onDelete={handleDelete} onSave={handleSave} />;
  }

  return <FreeRunActive onBack={handleBack} />;
}
