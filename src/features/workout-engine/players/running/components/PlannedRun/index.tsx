'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import WorkoutPreviewScreen from './WorkoutPreviewScreen';
import PlannedRunActive from './PlannedRunActive';
import PlannedRunPaused from './PlannedRunPaused';
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

  const handleSave = () => {
    clearRunningData();
    clearSession();
    router.push('/home');
  };

  // ── State machine ────────────────────────────────────────────────

  // No workout loaded — should not reach here, but guard anyway
  if (!currentWorkout) {
    return null;
  }

  // Pre-start preview
  if (status === 'idle') {
    return (
      <WorkoutPreviewScreen
        workout={currentWorkout}
        onStart={handleStart}
        onBack={handleBack}
      />
    );
  }

  // Post-workout summary (reuse Free Run summary)
  if (status === 'finished') {
    return <FreeRunSummary onDelete={handleDelete} onSave={handleSave} />;
  }

  // Paused
  if (status === 'paused') {
    return <PlannedRunPaused onBack={handleBack} />;
  }

  // Active (default)
  return <PlannedRunActive onBack={handleBack} />;
}
