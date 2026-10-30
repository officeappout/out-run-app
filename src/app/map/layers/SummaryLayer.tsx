'use client';

import React, { useState } from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import WorkoutSummaryPage from '@/features/workout-engine/summary/WorkoutSummaryPage';
import { useMapLogic } from '@/features/parks';
import { useHybridRun } from '@/features/workout-engine/hybrid/useHybridRun';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import HybridSummary from '@/features/workout-engine/summary/pages/HybridSummary';
import { HYBRID_SUMMARY_ENABLED } from '@/config/feature-flags';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import PushReAskAfterWorkout from '@/features/schedule/components/push-reask/PushReAskAfterWorkout';
import ParkRingScreen from '@/features/workout-engine/summary/components/ParkRingScreen';
import { useParkLiveV2 } from '@/hooks/useParkLiveV2';
import { useComboFlowV1 } from '@/features/workout-engine/hybrid/v2/combo/useComboFlowV1';
import { useUserStore } from '@/features/user';
import { hasAssessedStrengthDomain } from '@/features/user/identity/services/access-control.service';
import { startFullStrengthQuestionnaire } from '@/features/user/onboarding/services/mini-domain-assessment';

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
  const lastLaps = useHybridRun((s) => s.lastLaps);
  const currentStreak = useProgressionStore((s) => s.currentStreak);
  const router = useRouter();
  // enable_park_live_v2 (boards Park 11-12, pilot N1 / N2 / M7): the weekly-ring screen first, then
  // the summary with the walk fixes and, with no strength questionnaire yet, the card that opens it.
  const parkLive = useParkLiveV2();
  // enable_combo_flow_v1 (board PlayerComboSummary): a combined workout ends the same way, minutes
  // ring first (walk + strength in the widget colours), then the summary with the walk fixes.
  const comboFlow = useComboFlowV1();
  const parkSummary = parkLive || comboFlow;
  const [ringSeen, setRingSeen] = useState(false);
  const profile = useUserStore((s) => s.profile);
  const needsQuiz = parkSummary && !!profile && !hasAssessedStrengthDomain(profile as never);

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

  // M7: same teardown as "סיום", then the full strength questionnaire (back to /home at its end).
  const handleStrengthQuiz = () => {
    useHybridRun.getState().reset();
    useSessionStore.getState().clearSession();
    handleFinish();
    startFullStrengthQuestionnaire(router, profile, '/home');
  };

  // (A mock StrengthDopamineScreen branch with a hard-coded 63% / level 5 used
  // to live here behind logic.showDopamine — nothing ever sets that true, so it
  // was removed. The real level-up screen renders on /workouts/[id]/active.)

  // Hybrid summary — the unified run+strength recap (Stage 3). Gated on the flag
  // + a stashed finalize result; a normal run leaves finishedHybrid=false and
  // falls through to the run summary below, unchanged. Rendering HybridSummary
  // here (instead of the aerobic shell) also kills the false "אימון קצר מדי"
  // notice a hybrid finish used to show (null runner snapshot → wasSaved=false).
  if (logic.showSummary && HYBRID_SUMMARY_ENABLED && finishedHybrid && lastResult) {
    if (parkSummary && !ringSeen) return <ParkRingScreen result={lastResult} onNext={() => setRingSeen(true)} />;
    return (
      <>
        <HybridSummary
          result={lastResult}
          calories={lastCalories}
          streakDays={currentStreak}
          onFinish={handleHybridFinish}
          parkLive={parkSummary}
          widgetRings={comboFlow}
          laps={comboFlow ? lastLaps : undefined}
          onStrengthQuiz={needsQuiz ? handleStrengthQuiz : undefined}
        />
        <PushReAskAfterWorkout />
      </>
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
      <>
        <WorkoutSummaryPage
          onFinish={handleFinish}
          workoutType={runMode === 'plan' ? 'PLAN_RUN' : 'FREE_RUN'}
        />
        <PushReAskAfterWorkout />
      </>
    );
  }

  return null;
}
