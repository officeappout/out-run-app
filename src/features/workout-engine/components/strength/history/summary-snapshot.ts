/**
 * Build / restore the saved strength-summary snapshot (history parity).
 * Pure — no React, no Firebase. Built from the exact inputs the live summary
 * rendered from, and restored into the same shapes, so the history view
 * redraws the saved workout the way it was shown right after finishing.
 */
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';
import { weekDotsFromStates, type WeekDot } from '@/components/ui/v2/summary';
import { WHO_COMPLIANCE_BASELINE } from '@/features/activity/types/activity.types';
import {
  blockPlannedSets,
  blockTarget,
  exerciseUnit,
  planExercisePlannedSets,
  planExerciseSetTarget,
  segmentPhase,
  type PlanSegment,
  type RawLogEntry,
} from '../utils/phase-summary';
import { resolveLiveLevel } from '../utils/live-level';
import { isProgressionSkippedNoQuestionnaire } from '../utils/level-ring-visibility';
import type {
  SavedLevelSnapshot,
  SavedPlanSegment,
  SavedStreakSnapshot,
  StrengthSummarySnapshot,
} from './summary-snapshot.types';

export type * from './summary-snapshot.types';

/** The summary's week card ("אימוני כוח השבוע"), shared by the live view and the restore. */
export interface WeekCardData {
  categoryLabel: string;
  sessions: number;
  plannedSessions: number | null;
  minutes: number;
  whoMinutes: number;
}

export function buildWeekCard(week: { cardio?: boolean; sessions: number; plannedSessions: number | null; minutes: number }): WeekCardData {
  return {
    categoryLabel: week.cardio ? 'אימוני אירובי השבוע' : 'אימוני כוח השבוע', // i18n-allow-hebrew: same literals the live summary used
    sessions: week.sessions,
    plannedSessions: week.plannedSessions,
    minutes: week.minutes,
    whoMinutes: WHO_COMPLIANCE_BASELINE.weeklyAerobicMinutes,
  };
}

// ── Build (live summary → doc) ────────────────────────────────────────────

export function buildPlanSnapshot(segments: PlanSegment[], rawLog: RawLogEntry[] = []): SavedPlanSegment[] {
  const doneCount = new Map(rawLog.map((e) => [`${e.segmentId}:${e.exerciseId}`, e.confirmedReps.length]));
  return segments.map((seg) => {
    const blockSets = blockPlannedSets(seg);
    return {
      id: seg.id,
      ...(seg.title ? { title: seg.title } : {}),
      ...(seg.protocol ? { protocol: seg.protocol } : {}),
      phase: segmentPhase(seg),
      exercises: (seg.exercises ?? []).map((ex) => {
        const unit = exerciseUnit(ex, seg);
        const sets = planExercisePlannedSets(ex, blockSets);
        const bTarget = blockTarget(seg, unit);
        const count = Math.max(sets ?? 0, doneCount.get(`${seg.id}:${ex.id}`) ?? 0);
        const targets = Array.from({ length: count }, (_, i) => planExerciseSetTarget(ex, seg, unit, bTarget, i));
        return {
          id: ex.id,
          name: ex.name ?? '',
          unit: unit === 'seconds' ? ('seconds' as const) : ('reps' as const),
          sets,
          ...(targets.some((t) => t !== null) ? { targets } : {}),
          ...(ex.imageUrl ? { image: ex.imageUrl } : {}),
          ...(ex.wasSwapped ? { swapped: true as const } : {}),
        };
      }),
    };
  });
}

/** Only the exercises of this workout — keeps the doc small. */
export function pickPreviousSets(
  previousSets: Record<string, number[]> | undefined,
  exerciseIds: readonly string[],
): Record<string, number[]> | undefined {
  if (!previousSets) return undefined;
  const out: Record<string, number[]> = {};
  for (const id of exerciseIds) {
    const sets = previousSets[id];
    if (Array.isArray(sets) && sets.length > 0) out[id] = sets.filter((n) => typeof n === 'number');
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildLevelSnapshot(args: {
  programId?: string;
  currentLevel: number;
  progressToNextLevel: number;
  maxLevel: number;
  progressionResult: WorkoutCompletionResult | null | undefined;
  levelOverride?: { level: number; percent: number };
}): SavedLevelSnapshot {
  const { liveLevel, livePercent } = resolveLiveLevel(args);
  const gain = args.progressionResult?.success ? args.progressionResult.activeProgramGain : null;
  return {
    ...(args.programId ? { programId: args.programId } : {}),
    before: { level: args.currentLevel, percent: args.progressToNextLevel },
    after: { level: liveLevel, percent: livePercent },
    maxLevel: args.maxLevel,
    gain: Math.round((gain?.totalGain ?? 0) * 10) / 10,
    leveledUp: !!gain?.leveledUp,
    ...(isProgressionSkippedNoQuestionnaire(args.progressionResult) ? { skipped: true as const } : {}),
  };
}

export function buildStreakSnapshot(args: {
  streak: number;
  streakWeek: { days: WeekDot[]; best: number };
  week: { cardio?: boolean; sessions: number; plannedSessions: number | null; minutes: number } | null;
}): SavedStreakSnapshot {
  return {
    streak: args.streak,
    best: Math.max(args.streakWeek.best, args.streak),
    days: args.streakWeek.days.map((d) => d.state),
    ...(args.week
      ? {
          week: {
            sessions: args.week.sessions,
            plannedSessions: args.week.plannedSessions,
            minutes: args.week.minutes,
            ...(args.week.cardio ? { cardio: true as const } : {}),
          },
        }
      : {}),
  };
}

export function buildSummarySnapshot(parts: {
  segments?: PlanSegment[];
  rawLog?: RawLogEntry[];
  previousSets?: Record<string, number[]>;
  level?: SavedLevelSnapshot;
  streak?: SavedStreakSnapshot;
}): StrengthSummarySnapshot {
  const rawLog = parts.rawLog ?? [];
  const previous = pickPreviousSets(parts.previousSets, rawLog.map((e) => e.exerciseId));
  return {
    v: 1,
    ...(parts.segments && parts.segments.length > 0 ? { plan: buildPlanSnapshot(parts.segments, rawLog) } : {}),
    ...(previous ? { previousSets: previous } : {}),
    ...(parts.level ? { level: parts.level } : {}),
    ...(parts.streak ? { streak: parts.streak } : {}),
  };
}

// ── Restore (doc → history view) ──────────────────────────────────────────

/** Tolerant read of the doc's optional `summarySnapshot` (absent/malformed ⇒ undefined). */
export function readSummarySnapshot(raw: unknown): StrengthSummarySnapshot | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const s = raw as Partial<StrengthSummarySnapshot>;
  if (s.v !== 1) return undefined;
  return {
    v: 1,
    ...(Array.isArray(s.plan) ? { plan: s.plan } : {}),
    ...(s.previousSets && typeof s.previousSets === 'object' ? { previousSets: s.previousSets } : {}),
    ...(s.level && typeof s.level === 'object' && s.level.after ? { level: s.level } : {}),
    ...(s.streak && typeof s.streak === 'object' && Array.isArray(s.streak.days) ? { streak: s.streak } : {}),
  };
}

export function planSnapshotToSegments(plan: SavedPlanSegment[]): PlanSegment[] {
  return plan.map((seg) => ({
    id: seg.id,
    ...(seg.title ? { title: seg.title } : {}),
    ...(seg.protocol ? { protocol: seg.protocol } : {}),
    phase: seg.phase,
    exercises: (seg.exercises ?? []).map((ex) => ({
      id: ex.id,
      name: ex.name,
      exerciseType: ex.unit === 'seconds' ? ('time' as const) : ('reps' as const),
      plannedSets: typeof ex.sets === 'number' ? ex.sets : null,
      setTargets: ex.targets ?? [],
      ...(ex.image ? { imageUrl: ex.image } : {}),
      ...(ex.swapped ? { wasSwapped: true } : {}),
    })),
  }));
}

export function streakSnapshotToView(
  streak: SavedStreakSnapshot,
  workoutDate: Date,
): { streakWeek: { days: WeekDot[]; best: number }; week: WeekCardData | null } {
  return {
    streakWeek: { days: weekDotsFromStates(streak.days, workoutDate), best: streak.best },
    week: streak.week ? buildWeekCard(streak.week) : null,
  };
}
