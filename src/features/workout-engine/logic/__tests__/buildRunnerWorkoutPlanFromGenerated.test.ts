import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildRunnerWorkoutPlanFromGenerated } from '../buildRunnerWorkoutPlanFromGenerated';
import type { GeneratedWorkout } from '../WorkoutGenerator';

/**
 * Builder→Runner gap regression (two failures, one fix).
 *
 * 1. WRONG EXERCISES: the CustomBuilder synthesises a GeneratedWorkout; the
 *    preview shows it; but the runner previously received a STALE
 *    `active_workout_data` snapshot because no GeneratedWorkout → WorkoutPlan
 *    conversion existed on the start hand-off.
 *
 * 2. WRONG VIDEO: even once the exercises reached the runner, the plan must
 *    carry `bunnyVideoId` resolved off the ENGINE-selected method (`ex.method`).
 *    Without it the runner's `exerciseBunnyVideoId` memo re-derives from
 *    `execution_methods[0]` and plays a different method's video.
 *
 * This asserts the converter fixes both: the exact generated exercises survive,
 * AND each carries the engine method's Bunny id — not method[0]'s.
 */

// A minimal WorkoutExercise fixture. `execution_methods[0]` carries a DECOY
// Bunny id; the engine picked a DIFFERENT method (`method`) with the real id.
const mkExercise = (
  id: string,
  he: string,
  role: 'main' | 'warmup' | 'cooldown',
  engineBunnyId: string,
) =>
  ({
    exercise: {
      id,
      name: { he, en: id },
      type: 'reps',
      exerciseRole: role,
      content: {},
      // method[0] is NOT the one the engine chose — its id must never surface.
      execution_methods: [
        { methodName: 'decoy-home', media: { bunnyVideoId_mainVideoUrl: `DECOY-${id}` } },
      ],
    },
    // The engine-selected method (park/pull-up-bar, etc.) — the source of truth.
    method: { methodName: 'engine-park', media: { bunnyVideoId_mainVideoUrl: engineBunnyId } },
    mechanicalType: 'push',
    sets: 3,
    reps: 8,
    isTimeBased: false,
    restSeconds: 60,
    priority: 'primary',
    score: 1,
    reasoning: [],
  }) as any;

const gw: GeneratedWorkout = {
  title: 'אימון מותאם אישית',
  description: '',
  exercises: [
    mkExercise('front-lever-full', 'פרונט לבר מלא', 'main', 'ENGINE-front-lever'),
    mkExercise('parallel-eccentric-hold', 'החזקות מקבילים אקצנטרי', 'main', 'ENGINE-eccentric'),
    mkExercise('wide-pushups', 'שכיבות סמיכה רחבות', 'main', 'ENGINE-wide-pushups'),
  ],
  estimatedDuration: 30,
  structure: {} as any,
  difficulty: 2 as any,
  mechanicalBalance: {} as any,
  stats: {} as any,
  isRecovery: false,
  totalPlannedSets: 9,
} as any;

describe('buildRunnerWorkoutPlanFromGenerated', () => {
  beforeEach(() => {
    // Silence any [Media FAIL] console.error for media-less branches.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('carries the CustomBuilder exercises into the runner plan (no stale/fallback swap)', () => {
    const plan = buildRunnerWorkoutPlanFromGenerated(gw, { id: 'workout-builder-123' });

    expect(plan.id).toBe('workout-builder-123');

    const names = plan.segments.flatMap((s) => (s.exercises ?? []).map((e) => e.name));
    expect(names).toEqual([
      'פרונט לבר מלא',
      'החזקות מקבילים אקצנטרי',
      'שכיבות סמיכה רחבות',
    ]);

    const ids = plan.segments.flatMap((s) => (s.exercises ?? []).map((e) => e.id));
    expect(ids).toEqual(['front-lever-full', 'parallel-eccentric-hold', 'wide-pushups']);

    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].exercises).toHaveLength(3);
  });

  it('carries bunnyVideoId from the ENGINE-selected method, not execution_methods[0]', () => {
    const plan = buildRunnerWorkoutPlanFromGenerated(gw, { id: 'w-1' });
    const exs = plan.segments.flatMap((s) => (s.exercises ?? [])) as any[];

    // Each exercise plays the engine method's video…
    expect(exs.map((e) => e.bunnyVideoId)).toEqual([
      'ENGINE-front-lever',
      'ENGINE-eccentric',
      'ENGINE-wide-pushups',
    ]);
    // …and NEVER the decoy method[0] id.
    for (const e of exs) {
      expect(e.bunnyVideoId).not.toMatch(/^DECOY-/);
    }
  });

  it('groups warmup / main / cooldown into distinct ordered segments', () => {
    const withRoles: GeneratedWorkout = {
      ...gw,
      exercises: [
        mkExercise('jumping-jacks', 'קפיצות פישוק', 'warmup', 'ENGINE-jj'),
        mkExercise('front-lever-full', 'פרונט לבר מלא', 'main', 'ENGINE-fl'),
        mkExercise('hamstring-stretch', 'מתיחת ירך אחורית', 'cooldown', 'ENGINE-hs'),
      ],
    } as any;

    const plan = buildRunnerWorkoutPlanFromGenerated(withRoles, { id: 'w-1' });
    expect(plan.segments.map((s) => s.id)).toEqual([
      'seg-warmup',
      'seg-main',
      'seg-cooldown',
    ]);
  });
});
