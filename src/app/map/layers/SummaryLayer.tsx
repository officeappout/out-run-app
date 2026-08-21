'use client';

import React from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import WorkoutSummaryPage from '@/features/workout-engine/summary/WorkoutSummaryPage';
import { StrengthDopamineScreen } from '@/features/workout-engine/components/strength';
import { useMapLogic } from '@/features/parks';
import { useHybridRun } from '@/features/workout-engine/hybrid/useHybridRun';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import HybridSummary from '@/features/workout-engine/summary/pages/HybridSummary';
import { HYBRID_SUMMARY_ENABLED } from '@/config/feature-flags';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';

type MapLogic = ReturnType<typeof useMapLogic>;

interface SummaryLayerProps {
  logic: MapLogic;
}

export default function SummaryLayer({ logic }: SummaryLayerProps) {
  const { setMode } = useMapMode();
  const runMode = useRunningPlayer((s) => s.runMode);
  const finishedHybrid = useHybridRun((s) => s.finishedHybrid);
  const lastResult = useHybridRun((s) => s.lastResult);
  const lastCalories = useHybridRun((s) => s.lastCalories);
  const currentStreak = useProgressionStore((s) => s.currentStreak);
  const router = useRouter();

  const handleFinish = () => {
    logic.setShowSummary(false);
    logic.setShowDopamine(false);
    logic.setIsWorkoutActive(false);
    setMode('discover');
  };

  // Hybrid summary dismissal also clears the stashed finalize result, so a later
  // normal run never re-reads a stale hybrid result.
  const handleHybridFinish = () => {
    useHybridRun.getState().reset();
    // Restore the bottom navbar (unmounted while session status === 'finished',
    // ClientLayout.tsx) + land on /home — parity with the aerobic
    // WorkoutSummaryPage.handleFinish teardown.
    useSessionStore.getState().clearSession();
    handleFinish();
    router.push('/home');
  };

  // Dopamine screen (transition to summary)
  if (logic.showDopamine) {
    return (
      <StrengthDopamineScreen
        initialProgress={63}
        currentLevel={5}
        programName={logic.workoutMode === 'free' ? 'אימון חופשי' : 'אימון מסלול'}
        onShare={() => {}}
        onBack={() => {
          logic.setShowDopamine(false);
          logic.setShowSummary(true);
        }}
      />
    );
  }

  // Hybrid summary — the unified run+strength recap (Stage 3). Gated on the flag
  // + a stashed finalize result; a normal run leaves finishedHybrid=false and
  // falls through to the run summary below, unchanged. Rendering HybridSummary
  // here (instead of the aerobic shell) also kills the false "אימון קצר מדי"
  // notice a hybrid finish used to show (null runner snapshot → wasSaved=false).
  if (logic.showSummary && HYBRID_SUMMARY_ENABLED && finishedHybrid && lastResult) {
    return (
      <HybridSummary
        result={lastResult}
        calories={lastCalories}
        streakDays={currentStreak}
        onFinish={handleHybridFinish}
      />
    );
  }

  // Run summary (free, planned, or my_routes) — showSummary is only ever set
  // true from the running-session finish bridge (MapShell.tsx), so this is
  // the correct catch-all for every non-hybrid case reaching this layer.
  // Do NOT branch on logic.workoutMode here: it's a local discover/free flag
  // that DiscoverLayer/BuilderLayer never update before startActiveWorkout()
  // (see the comment on MapShell.tsx's mode-sync effect), so it can't
  // reliably distinguish "free run" from "planned run" — runMode does that.
  // A previous version of this branch used workoutMode !== 'free' to guess
  // "this must be a real structured strength workout" and rendered a mock
  // StrengthSummaryPage — but no strength workout ever reaches SummaryLayer,
  // so it only ever misfired for planned/my_routes runs: a second,
  // strength-classified XP + activity/streak write on top of the real
  // running award finishWorkout already made.
  if (logic.showSummary) {
    return (
      <WorkoutSummaryPage
        onFinish={handleFinish}
        workoutType={runMode === 'plan' ? 'PLAN_RUN' : 'FREE_RUN'}
      />
    );
  }

  return null;
}
