/**
 * Fixture data for /debug/design-v2/summary (dev-only preview). Realistic
 * shapes of what the live summary screens receive — no Firebase.
 */
import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import type { GroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import type { CompletedExercise } from '@/features/workout-engine/components/strength/utils/summary.utils';
import type { EvaluatedGoal } from '@/features/workout-engine/components/strength/hooks/useGoalEvaluation';

const DATE = new Date('2026-10-15T07:12:00+03:00');

export function aerobicWorkout(activityType: 'running' | 'walking'): WorkoutHistoryEntry & { date: Date } {
  const running = activityType === 'running';
  return {
    id: 'fixture-run',
    userId: 'fixture-user',
    date: DATE,
    activityType,
    workoutType: activityType,
    category: 'cardio',
    displayIcon: running ? 'run-fast' : 'walk',
    distance: running ? 5.42 : 3.18,
    duration: running ? 1844 : 2460,
    calories: running ? 412 : 198,
    pace: running ? 5.67 : 12.9,
    earnedCoins: 0,
    parkId: 'fixture-park',
    elevationGain: running ? 38 : 0,
    laps: running
      ? [
          { id: 'l1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 342, splitPace: 5.7, isActive: false },
          { id: 'l2', lapNumber: 2, distanceMeters: 1000, durationSeconds: 331, splitPace: 5.52, isActive: false },
          { id: 'l3', lapNumber: 3, distanceMeters: 1000, durationSeconds: 338, splitPace: 5.63, isActive: false },
          { id: 'l4', lapNumber: 4, distanceMeters: 1000, durationSeconds: 345, splitPace: 5.75, isActive: false },
          { id: 'l5', lapNumber: 5, distanceMeters: 1000, durationSeconds: 336, splitPace: 5.6, isActive: false },
        ]
      : [],
  };
}

export const GROUP_CTX: GroupSummaryCtx = {
  groupName: 'רצים בפארק שדרות',
  collectiveDistanceKm: 27.6,
  participantCount: 5,
  coLocationMode: 'physical',
  participants: [
    { uid: 'fixture-user', name: 'דוד', distanceKm: 5.42, pace: 5.67 },
    { uid: 'u2', name: 'מיכל', distanceKm: 6.1, pace: 5.2 },
    { uid: 'u3', name: 'יוסי', distanceKm: 5.0, pace: 6.1 },
    { uid: 'u4', name: 'נועה', distanceKm: 5.8, pace: 5.45 },
    { uid: 'u5', name: 'אורי', distanceKm: 5.28, pace: 5.9 },
  ],
};

export const HYBRID_RESULT: HybridFinalizeResult = {
  segments: [
    { index: 0, kind: 'aerobic', aerobicType: 'running', actual: { durationSec: 612, distanceKm: 1.84 }, startedAtMs: 1, endedAtMs: 2 },
    { index: 1, kind: 'strength', actual: { durationSec: 540, sets: 9 }, startedAtMs: 3, endedAtMs: 4 },
    { index: 2, kind: 'aerobic', aerobicType: 'walking', actual: { durationSec: 380, distanceKm: 0.62 }, startedAtMs: 5, endedAtMs: 6 },
    { index: 3, kind: 'strength', actual: { durationSec: 495, sets: 8 }, startedAtMs: 7, endedAtMs: 8 },
    { index: 4, kind: 'aerobic', aerobicType: 'running', actual: { durationSec: 655, distanceKm: 1.97 }, startedAtMs: 9, endedAtMs: 10 },
  ],
  summary: {
    segmentCount: 5,
    completedAerobicSegments: 3,
    completedStrengthSegments: 2,
    totalActualAerobicSec: 1647,
    totalActualDistanceKm: 4.43,
    totalStrengthSets: 17,
    bothHalvesCompleted: true,
  },
};

export const STRENGTH_EXERCISES: CompletedExercise[] = [
  { id: 'e1', name: 'סיבובי כתפיים', category: 'warmup', sets: [20], totalReps: 20 },
  { id: 'e2', name: 'מתח אוסטרלי', category: 'main', sets: [12, 12, 10], totalReps: 34, isPersonalRecord: true },
  { id: 'e3', name: 'שכיבות סמיכה', category: 'main', sets: [15, 14, 12], totalReps: 41 },
  { id: 'e4', name: 'מקבילים', category: 'superset', sets: [8, 8, 7], totalReps: 23 },
  { id: 'e5', name: 'כפיפות בטן', category: 'superset', sets: [20, 20, 18], totalReps: 58 },
  { id: 'e6', name: 'מתיחת חזה', category: 'stretch', sets: [30], totalReps: 30 },
];

export const STRENGTH_GOALS: EvaluatedGoal[] = [
  { id: 'g1', exerciseName: 'מתח אוסטרלי', targetValue: 12, unit: 'reps', label: '12 מתח אוסטרלי', progressBonus: 5, achieved: true, bestValue: 12 },
  { id: 'g2', exerciseName: 'שכיבות סמיכה', targetValue: 20, unit: 'reps', label: '20 שכיבות סמיכה', progressBonus: 5, achieved: false, bestValue: 15 },
];

export function groupStrength(list: CompletedExercise[]): Record<string, CompletedExercise[]> {
  return list.reduce<Record<string, CompletedExercise[]>>((acc, ex) => {
    (acc[ex.category] ??= []).push(ex);
    return acc;
  }, {});
}
