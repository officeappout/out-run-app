'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import WorkoutPreviewScreen from './WorkoutPreviewScreen';
import PlannedRunActive from './PlannedRunActive';
import FreeRunSummary from '../FreeRun/FreeRunSummary';

export default function PlannedRun() {
  const router = useRouter();
  const { status, startSession, endSession, clearSession } = useSessionStore();
  const {
    currentWorkout,
    startGPSTracking,
    stopGPSTracking,
    clearRunningData,
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

  const handleDelete = () => {
    clearRunningData();
    clearSession();
    router.push('/map');
  };

  // Planner completion (markSessionComplete) no longer happens here — it
  // fires unconditionally inside useRunningPlayer.finishWorkout(), the same
  // place the home-strip's syncWorkoutCompletion already fires (decision 3,
  // workout-completion-badge-audit). This handler is now pure navigation.
  const handleSave = () => {
    clearRunningData();
    clearSession();
    router.push('/home');
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

  if (status === 'finished') {
    return <FreeRunSummary onDelete={handleDelete} onSave={handleSave} />;
  }

  // Both 'active' and 'paused' are handled inside PlannedRunActive
  // (it renders its own Strength-style pause overlay when paused)
  return <PlannedRunActive onBack={handleBack} />;
}
