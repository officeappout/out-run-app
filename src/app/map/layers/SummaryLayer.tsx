'use client';

import React from 'react';
import { useMapMode } from '@/features/parks/core/context/MapModeContext';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import WorkoutSummaryPage from '@/features/workout-engine/summary/WorkoutSummaryPage';
import { StrengthDopamineScreen, StrengthSummaryPage } from '@/features/workout-engine/components/strength';
import { useMapLogic } from '@/features/parks';

type MapLogic = ReturnType<typeof useMapLogic>;

interface SummaryLayerProps {
  logic: MapLogic;
}

export default function SummaryLayer({ logic }: SummaryLayerProps) {
  const { setMode } = useMapMode();
  const runMode = useRunningPlayer((s) => s.runMode);

  const handleFinish = () => {
    logic.setShowSummary(false);
    logic.setShowDopamine(false);
    logic.setIsWorkoutActive(false);
    setMode('discover');
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

  // Structured workout summary
  if (logic.showSummary && logic.workoutMode !== 'free') {
    return (
      <StrengthSummaryPage
        duration={logic.elapsedTime || 0}
        totalReps={0}
        completedExercises={[]}
        difficulty="medium"
        streak={3}
        programName="תוכנית כל הגוף"
        currentLevel={5}
        maxLevel={25}
        progressToNextLevel={80}
        onFinish={handleFinish}
      />
    );
  }

  // Free run summary
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
