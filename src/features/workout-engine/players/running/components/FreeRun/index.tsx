'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import FreeRunActive from './FreeRunActive';
import FreeRunPaused from './FreeRunPaused';
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

  // Switch between views based on status
  if (status === 'finished') {
    return <FreeRunSummary onDelete={handleDelete} onSave={handleSave} />;
  }

  if (status === 'paused') {
    return <FreeRunPaused onBack={handleBack} />;
  }

  return <FreeRunActive onBack={handleBack} />;
}
