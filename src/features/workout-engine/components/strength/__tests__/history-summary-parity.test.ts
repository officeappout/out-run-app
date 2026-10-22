import { describe, it, expect } from 'vitest';
import { buildPhaseSummary, type PlanSegment, type RawLogEntry } from '../utils/phase-summary';
import type { CompletedExercise } from '../utils/summary.utils';
import {
  buildLevelSnapshot,
  buildStreakSnapshot,
  buildSummarySnapshot,
  readSummarySnapshot,
  streakSnapshotToView,
} from '../history/summary-snapshot';
import {
  workoutHistoryEntryToStrengthSummaryParityProps,
  workoutHistoryEntryToStrengthSummaryProps,
} from '../strength-history-adapter';
import type { WorkoutHistoryEntry } from '../../../core/services/storage.service';
import { buildWeekDots } from '@/components/ui/v2/summary';

// History parity (22.10.2026): live summary inputs → what saveWorkoutToHistory writes →
// (Firestore JSON round trip) → the history adapter → the same phase breakdown.

const segments: PlanSegment[] = [
  { id: 'seg-warmup', title: 'חימום', exercises: [{ id: 'jj', name: 'קפיצות', duration: '30', exerciseType: 'time', sets: 1, imageUrl: 'https://img/jj.png' }] },
  {
    id: 'seg-main-1',
    title: 'בלוק 1',
    protocol: 'straight',
    exercises: [
      { id: 'pushup', name: 'שכיבות סמיכה', reps: '10', sets: 3, imageUrl: 'https://img/p.png' },
      { id: 'row', name: 'חתירה', repsSequence: [12, 10, 8], sets: 3, wasSwapped: true },
      { id: 'plank', name: 'פלאנק', duration: '40', exerciseType: 'time', sets: 2 },
    ],
  },
  {
    id: 'seg-tabata',
    title: 'טבטה',
    protocol: 'tabata',
    protocolConfig: { rounds: 8, workSec: 20, restSec: 10 },
    exercises: [
      { id: 'squat', name: 'סקוואט', duration: '20', exerciseType: 'time' },
      { id: 'burpee', name: 'ברפי', duration: '20', exerciseType: 'time' },
    ],
  },
  { id: 'seg-amrap', title: 'AMRAP', protocol: 'amrap', protocolConfig: { durationSec: 300 }, exercises: [{ id: 'lunge', name: 'מכרע', reps: '10' }] },
  { id: 'seg-cooldown', title: 'שחרור', exercises: [{ id: 'stretch', name: 'מתיחה', duration: '30', exerciseType: 'time', exerciseRole: 'cooldown' }] },
];

const log = (exerciseId: string, segmentId: string, reps: number[], targetReps = reps[0] ?? 0): RawLogEntry => ({
  exerciseId,
  exerciseName: exerciseId,
  segmentId,
  confirmedReps: reps,
  targetReps,
});

const rawLog: RawLogEntry[] = [
  log('jj', 'seg-warmup', [30]),
  log('pushup', 'seg-main-1', [10, 8, 10, 12], 10), // one extra set beyond the plan
  log('row', 'seg-main-1', [12, 9], 12),
  log('plank', 'seg-main-1', [40, 35], 40),
  log('squat', 'seg-tabata', [20, 20, 20, 18]),
  log('burpee', 'seg-tabata', [20, 20, 20, 20]),
  log('lunge', 'seg-amrap', [10, 10, 7], 10),
  log('dip', 'seg-main-1', [6, 6], 8), // swapped-in, not in the plan
  log('stretch', 'seg-cooldown', [30]),
];

const completedExercises: CompletedExercise[] = rawLog.map((e) => ({
  id: e.exerciseId,
  name: e.exerciseName,
  category: 'main',
  sets: e.confirmedReps,
  totalReps: e.confirmedReps.reduce((a, b) => a + b, 0),
}));

const previousSets = { pushup: [9, 9], row: [10, 8], plank: [30], unrelated: [1, 2, 3] };

const progressionResult = {
  success: true,
  activeProgramGain: {
    programId: 'upper_body', baseGain: 3, bonusGain: 1.24, goalBonusGain: 0, masteryBonusGain: 0,
    totalGain: 4.24, newPercent: 71.6, leveledUp: false,
  },
} as never;

const streakWeek = { days: buildWeekDots({}, new Date(2026, 9, 21), { todayDone: true }), best: 6 };

function savedDoc(snapshotOverride?: object): WorkoutHistoryEntry {
  const snapshot = buildSummarySnapshot({
    segments,
    rawLog,
    previousSets,
    level: buildLevelSnapshot({
      programId: 'upper_body',
      currentLevel: 4,
      progressToNextLevel: 67,
      maxLevel: 12,
      progressionResult,
    }),
    streak: buildStreakSnapshot({
      streak: 3,
      streakWeek,
      week: { sessions: 2, plannedSessions: 3, minutes: 95 },
    }),
  });
  // Firestore stores plain JSON — no undefined, no class instances.
  const stored = JSON.parse(JSON.stringify(snapshotOverride ?? snapshot));
  return {
    userId: 'u1',
    date: new Date(2026, 9, 21, 18, 30),
    activityType: 'strength',
    workoutType: 'strength',
    category: 'strength',
    displayIcon: 'dumbbell',
    distance: 0,
    duration: 1800,
    calories: 210,
    pace: 0,
    earnedCoins: 0,
    xpEarned: 120,
    difficulty: 3,
    programId: 'upper_body',
    segments: [
      {
        index: 0,
        kind: 'strength',
        label: 'אימון עליון',
        actual: {
          exerciseLog: rawLog.map((e) => ({
            exerciseId: e.exerciseId,
            exerciseName: e.exerciseName,
            segmentId: e.segmentId,
            confirmedReps: e.confirmedReps,
            targetReps: e.targetReps,
            ...(e.exerciseId === 'jj' ? { role: 'warmup' } : {}),
          })),
        },
      },
    ],
    summarySnapshot: stored,
  };
}

describe('history parity — round trip', () => {
  it('redraws the same phase breakdown (blocks, planned sets, targets, images, improvements)', () => {
    const live = buildPhaseSummary({ completedExercises, rawLog, segments, previousSets });
    const props = workoutHistoryEntryToStrengthSummaryParityProps(savedDoc());
    const history = buildPhaseSummary({
      completedExercises: props.completedExercises,
      rawLog: props.rawExerciseLog,
      segments: props.workoutSegments,
      previousSets: props.previousSets,
    });
    expect(history).toEqual(live);
    // sanity: the plan really came back (not the category fallback)
    expect(history.map((p) => p.phase)).toEqual(['warmup', 'main', 'cooldown']);
    expect(history[1].blocks.map((b) => b.id)).toEqual(['seg-main-1', 'seg-tabata', 'seg-amrap']);
  });

  it('keeps only this workout\'s previous sets', () => {
    const props = workoutHistoryEntryToStrengthSummaryParityProps(savedDoc());
    expect(props.previousSets).toEqual({ pushup: [9, 9], row: [10, 8], plank: [30] });
  });

  it('passes difficulty, program, header and the saved level / streak through', () => {
    const props = workoutHistoryEntryToStrengthSummaryParityProps(savedDoc());
    expect(props.difficulty).toBe('hard');
    expect(props.programId).toBe('upper_body');
    expect(props.programName).toBe('אימון עליון');
    expect(props.maxLevel).toBe(12);
    expect(props.completedExercises[0].category).toBe('warmup');
    expect(props.savedSummary?.level).toEqual({
      programId: 'upper_body',
      before: { level: 4, percent: 67 },
      after: { level: 4, percent: 72 },
      maxLevel: 12,
      gain: 4.2,
      leveledUp: false,
    });
    const view = streakSnapshotToView(props.savedSummary!.streak!, props.savedSummary!.workoutDate);
    expect(view.streakWeek.best).toBe(6);
    expect(view.streakWeek.days.map((d) => d.state)).toEqual(streakWeek.days.map((d) => d.state));
    expect(view.streakWeek.days).toEqual(streakWeek.days);
    expect(view.week).toMatchObject({ sessions: 2, plannedSessions: 3, minutes: 95, whoMinutes: 150 });
  });
});

describe('history parity — level snapshot', () => {
  it('uses the level-up override like the live ring', () => {
    const snap = buildLevelSnapshot({
      currentLevel: 4, progressToNextLevel: 90, maxLevel: 25, progressionResult,
      levelOverride: { level: 5, percent: 3.4 },
    });
    expect(snap.after).toEqual({ level: 5, percent: 3 });
  });

  it('marks a skipped (no questionnaire) progression', () => {
    const snap = buildLevelSnapshot({
      currentLevel: 1, progressToNextLevel: 0, maxLevel: 25,
      progressionResult: { ...(progressionResult as object), skipped: 'no_questionnaire' } as never,
    });
    expect(snap.skipped).toBe(true);
  });
});

describe('history parity — old docs', () => {
  const oldDoc = (): WorkoutHistoryEntry => {
    const d = savedDoc();
    delete d.summarySnapshot;
    delete d.programId;
    delete d.difficulty;
    d.segments = [{ ...d.segments![0], label: undefined, actual: { exerciseLog: d.segments![0].actual!.exerciseLog!.map(({ segmentId: _s, role: _r, ...e }) => e) } }];
    return d;
  };

  it('falls back to the reduced view (no plan, no level ring, no streak card)', () => {
    const props = workoutHistoryEntryToStrengthSummaryParityProps(oldDoc());
    expect(props.workoutSegments).toBeUndefined();
    expect(props.previousSets).toBeUndefined();
    expect(props.savedSummary?.level).toBeUndefined();
    expect(props.savedSummary?.streak).toBeUndefined();
    expect(props.difficulty).toBe('medium');
    expect(props.programName).toBe('אימון כוח');
    // Same breakdown as the flag-OFF adapter.
    const base = workoutHistoryEntryToStrengthSummaryProps(oldDoc());
    const a = buildPhaseSummary({ completedExercises: props.completedExercises, rawLog: props.rawExerciseLog });
    const b = buildPhaseSummary({ completedExercises: base.completedExercises, rawLog: base.rawExerciseLog });
    expect(a).toEqual(b);
  });

  it('ignores a malformed snapshot', () => {
    expect(readSummarySnapshot({ v: 2, plan: [] })).toBeUndefined();
    expect(readSummarySnapshot('x')).toBeUndefined();
    const props = workoutHistoryEntryToStrengthSummaryParityProps(savedDoc({ v: 1, level: { nope: true } }));
    expect(props.savedSummary?.level).toBeUndefined();
  });
});
