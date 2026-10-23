'use client';

/**
 * enable_workout_insights_v1 — the level-up screen's lemur line. Builds the insight request from
 * the same inputs the v2 summary uses (so the summary reuses this request), once the level
 * result is in (`pending` false). Flag off / no Kelly AI → nothing, no request.
 */
import React, { useMemo } from 'react';
import type { LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';
import { buildPhaseSummary, type BuildPhaseSummaryInput } from '../utils/phase-summary';
import { strengthInsightRequest } from './insight-input';
import { useWorkoutInsight } from './useWorkoutInsight';
import LemurBubble from './LemurBubble';

export interface LevelUpLemurProps extends BuildPhaseSummaryInput {
  durationSec: number;
  outcome: LevelUpOutcome | null;
  isRecovery: boolean;
  pending: boolean;
  reducedMotion: boolean;
}

export default function LevelUpLemur({
  durationSec,
  outcome,
  isRecovery,
  pending,
  reducedMotion,
  completedExercises,
  rawLog,
  segments,
  previousSets,
}: LevelUpLemurProps) {
  const req = useMemo(() => {
    if (pending) return null;
    const phases = buildPhaseSummary({ completedExercises, rawLog, segments, previousSets });
    return strengthInsightRequest({ durationSec, phases, outcome, isRecovery });
  }, [pending, completedExercises, rawLog, segments, previousSets, durationSec, outcome, isRecovery]);
  const { active, lines } = useWorkoutInsight(req);
  return <LemurBubble active={active} line={lines ? lines.funny : undefined} reducedMotion={reducedMotion} />;
}
