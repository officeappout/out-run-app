'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useRunningPlayer } from '../../store/useRunningPlayer';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { audioService } from '@/features/workout-engine/core/services/AudioService';
import {
  markSessionComplete,
  getCurrentUid,
  type SessionSummary,
} from '@/features/workout-engine/core/services/workout-completion.service';
import WorkoutPreviewScreen from './WorkoutPreviewScreen';
import PlannedRunActive from './PlannedRunActive';
import FreeRunSummary from '../FreeRun/FreeRunSummary';

export default function PlannedRun() {
  const router = useRouter();
  const { status, startSession, endSession, clearSession, totalDistance, totalDuration } = useSessionStore();
  const {
    currentWorkout,
    startGPSTracking,
    stopGPSTracking,
    clearRunningData,
    initializeRunningData,
    currentPace,
  } = useRunningPlayer();
  const profile = useUserStore((s) => s.profile);

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

  const handleSave = async () => {
    const uid = getCurrentUid();
    const activeProgram = profile?.running?.activeProgram;
    const weekStr = typeof window !== 'undefined' ? sessionStorage.getItem('planned_run_week') : null;
    const dayStr = typeof window !== 'undefined' ? sessionStorage.getItem('planned_run_day') : null;

    if (uid && activeProgram && weekStr && dayStr) {
      const week = parseInt(weekStr, 10);
      const day = parseInt(dayStr, 10);
      const avgPace = currentPace || 0;
      const targetDist = currentWorkout?.totalDistance || 0;
      const completionRate = targetDist > 0 ? Math.min(1, totalDistance / targetDist) : 1;

      const summary: SessionSummary = {
        avgPace,
        completionRate,
        distanceKm: totalDistance,
        durationSeconds: totalDuration,
      };

      await markSessionComplete(uid, week, day, summary, activeProgram);

      sessionStorage.removeItem('planned_run_week');
      sessionStorage.removeItem('planned_run_day');
    }

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
