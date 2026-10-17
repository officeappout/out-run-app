import { describe, it, expect } from 'vitest';
import {
  buildPhaseSummary,
  sessionTotals,
  segmentPhase,
  markFor,
  formatWorkSeconds,
  type PlanSegment,
  type RawLogEntry,
} from '../utils/phase-summary';
import type { CompletedExercise } from '../utils/summary.utils';

const log = (exerciseId: string, segmentId: string, reps: number[], targetReps = reps[0] ?? 0): RawLogEntry => ({
  exerciseId,
  exerciseName: exerciseId,
  segmentId,
  confirmedReps: reps,
  targetReps,
});

const segments: PlanSegment[] = [
  { id: 'seg-warmup', title: 'חימום', exercises: [{ id: 'jj', name: 'jj', duration: '30 שניות', exerciseType: 'time', sets: 1 }] },
  {
    id: 'seg-main-1',
    title: 'בלוק 1',
    protocol: 'straight',
    exercises: [
      { id: 'pushup', name: 'שכיבות סמיכה', reps: '10', sets: 3 },
      { id: 'plank', name: 'פלאנק', duration: '40', exerciseType: 'time', sets: 2 },
    ],
  },
  { id: 'seg-cooldown', title: 'מתיחות', exercises: [{ id: 'stretch', name: 'stretch', duration: '30', exerciseType: 'time' }] },
];

describe('segmentPhase', () => {
  it('detects warmup / cooldown by id, Hebrew title and exerciseRole', () => {
    expect(segmentPhase({ id: 'seg-warmup' })).toBe('warmup');
    expect(segmentPhase({ id: 'x', title: 'שחרור' })).toBe('cooldown');
    expect(segmentPhase({ id: 'x', exercises: [{ id: 'a', name: 'a', exerciseRole: 'warmup' }] })).toBe('warmup');
    expect(segmentPhase({ id: 'x', exercises: [{ id: 'a', name: 'a', exerciseRole: 'recovery' }] })).toBe('cooldown');
    expect(segmentPhase({ id: 'seg-main', title: 'עיקרי' })).toBe('main');
  });
});

describe('markFor', () => {
  it('full / partial / missed', () => {
    expect(markFor(10, 10)).toBe('full');
    expect(markFor(7, 10)).toBe('partial');
    expect(markFor(null, 10)).toBe('missed');
    expect(markFor(0, 10)).toBe('missed');
    expect(markFor(5, null)).toBe('full');
  });
});

describe('buildPhaseSummary — live flow (plan segments)', () => {
  const rawLog = [
    log('jj', 'seg-warmup', [30]),
    log('pushup', 'seg-main-1', [10, 8], 10),
    log('plank', 'seg-main-1', [40, 40]),
  ];
  const phases = buildPhaseSummary({ completedExercises: [], rawLog, segments });

  it('splits into warmup / main / cooldown in order, using real segments', () => {
    expect(phases.map((p) => p.phase)).toEqual(['warmup', 'main', 'cooldown']);
    expect(phases[1].blocks[0].title).toBe('בלוק 1');
    expect(phases[1].blocks[0].protocol).toBe('straight');
  });

  it('per-set done vs planned with marks', () => {
    const pushup = phases[1].blocks[0].exercises[0];
    expect(pushup.unit).toBe('reps');
    expect(pushup.plannedSets).toBe(3);
    expect(pushup.sets.map((s) => s.mark)).toEqual(['full', 'partial', 'missed']);
    expect(pushup.sets.map((s) => s.target)).toEqual([10, 10, 10]);
    expect(pushup.status).toBe('partial');
    const plank = phases[1].blocks[0].exercises[1];
    expect(plank.unit).toBe('seconds');
    expect(plank.sets.every((s) => s.target === 40 && s.mark === 'full')).toBe(true);
    expect(plank.status).toBe('done');
  });

  it('phase totals separate reps from timed work', () => {
    expect(phases[1].totals).toEqual({
      setsDone: 4,
      setsPlanned: 5,
      reps: 18,
      workSeconds: 80,
      exercisesDone: 2,
      exercisesTotal: 2,
    });
  });

  it('unlogged cooldown is "skipped", and session totals add up', () => {
    expect(phases[2].blocks[0].exercises[0].status).toBe('skipped');
    const t = sessionTotals(phases);
    expect(t.setsDone).toBe(5);
    expect(t.setsPlanned).toBe(7);
    expect(t.completionPercent).toBe(71);
  });

  it('swapped-in exercise lands in its segment with unknown plan', () => {
    const p = buildPhaseSummary({
      completedExercises: [],
      rawLog: [log('dips', 'seg-main-1', [12])],
      segments,
    });
    const main = p.find((x) => x.phase === 'main')!;
    const dips = main.blocks[0].exercises.find((e) => e.key === 'seg-main-1:dips')!;
    expect(dips.plannedSets).toBeNull();
    expect(main.totals.setsPlanned).toBeNull();
  });

  it('tabata block: planned sets = rounds / members, target = workSec', () => {
    const p = buildPhaseSummary({
      completedExercises: [],
      rawLog: [log('a', 'seg-t', [20, 20, 15, 20])],
      segments: [
        {
          id: 'seg-t',
          protocol: 'tabata',
          protocolConfig: { workSec: 20, restSec: 10, rounds: 8 },
          exercises: [
            { id: 'a', name: 'a', exerciseType: 'time' },
            { id: 'b', name: 'b', exerciseType: 'time' },
          ],
        },
      ],
    });
    const a = p[0].blocks[0].exercises[0];
    expect(a.plannedSets).toBe(4);
    expect(a.sets.map((s) => s.mark)).toEqual(['full', 'full', 'partial', 'full']);
  });

  it('improvedBy compares best set with the previous session', () => {
    const p = buildPhaseSummary({
      completedExercises: [],
      rawLog,
      segments,
      previousSets: { pushup: [8, 8, 7], plank: [45] },
    });
    const [pushup, plank] = p[1].blocks[0].exercises;
    expect(pushup.improvedBy).toBe(2);
    expect(plank.improvedBy).toBeNull();
  });
});

describe('buildPhaseSummary — history (no plan)', () => {
  it('groups by category and never invents planned sets', () => {
    const completed: CompletedExercise[] = [
      { id: 'w', name: 'w', category: 'warmup', sets: [30], totalReps: 30 },
      { id: 'm', name: 'm', category: 'main', sets: [10, 9], totalReps: 19 },
    ];
    const p = buildPhaseSummary({ completedExercises: completed, rawLog: [log('m', '0', [10, 9], 10)] });
    expect(p.map((x) => x.phase)).toEqual(['warmup', 'main']);
    const m = p[1].blocks[0].exercises[0];
    expect(m.plannedSets).toBeNull();
    expect(m.sets.map((s) => s.mark)).toEqual(['full', 'partial']);
    expect(sessionTotals(p).completionPercent).toBeNull();
  });
});

describe('formatWorkSeconds', () => {
  it('formats', () => {
    expect(formatWorkSeconds(45)).toBe('45');
    expect(formatWorkSeconds(95)).toBe('1:35');
  });
});
