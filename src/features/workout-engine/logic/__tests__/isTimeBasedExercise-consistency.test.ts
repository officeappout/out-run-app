import { describe, it, expect, vi } from 'vitest';
import { isTimeBasedExercise } from '../workout-budgeting.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * docs/workout-engine/06-TIME-VS-REPS.md — the reps-vs-seconds bug.
 *
 * isTimeBasedExercise is deterministic per exercise.type/mechanicalType/
 * movementGroup/name — the SAME exercise object must always get the SAME
 * answer. Real snapshot data showed the same exercise_id ("שכיבות סמיכה
 * ברכיים") reachable with is_time_based=0 (55 occurrences) AND =1 (38
 * occurrences) in the identical exerciseRole='main' context — proof that
 * something downstream was reimplementing this logic instead of calling it,
 * and getting a different answer. Every call site that builds a
 * WorkoutExercise (warmup.service, cooldown.service,
 * home-workout.service.generateRecoveryWorkout, trio-modifiers.service's
 * naked-backfill) now calls THIS function directly instead of
 * re-deriving the flag — these tests lock down its own behavior so no
 * future reimplementation can silently drift from it again.
 *
 * The ONE declared, intentional exception is tabata pool-injection
 * (tabata.block.ts) — see tabata-block.test.ts's dedicated isTimeBased
 * test: a tabata interval is always time-boxed regardless of the
 * underlying exercise's own nature, overriding this function's answer.
 */

const ex = (overrides: Partial<Exercise>): Exercise =>
  ({
    id: 'x',
    name: { he: 'תרגיל', en: 'exercise' },
    ...overrides,
  } as Exercise);

describe('isTimeBasedExercise — the single source of truth', () => {
  it('type="time" wins unconditionally, even over a dynamic movement group', () => {
    expect(isTimeBasedExercise(ex({ type: 'time' as any, movementGroup: 'squat' }))).toBe(true);
  });

  it('type="reps" + no straight_arm + no hold-keyword name => false', () => {
    expect(isTimeBasedExercise(ex({ type: 'reps' as any, name: { he: 'שכיבות סמיכה ברכיים', en: '' } }))).toBe(false);
  });

  it('mechanicalType="straight_arm" => true, regardless of type', () => {
    expect(isTimeBasedExercise(ex({ mechanicalType: 'straight_arm' as any, type: 'reps' as any }))).toBe(true);
  });

  it('mechanicalType="straight_arm" with type not "reps" logs a CMS-fix warning but still returns true', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isTimeBasedExercise(ex({ mechanicalType: 'straight_arm' as any }))).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a dynamic movement group (squat/hinge/lunge/push/pull) is ALWAYS false, even with a hold-ish name', () => {
    // DYNAMIC_MOVEMENT_GROUPS check runs before the name heuristic — a squat
    // named "hold" (unlikely real data, but the precedence must hold) stays reps-based.
    expect(isTimeBasedExercise(ex({ movementGroup: 'squat', name: { he: 'סקוואט', en: 'squat hold' } }))).toBe(false);
    expect(isTimeBasedExercise(ex({ movementGroup: 'vertical_pull' }))).toBe(false);
    expect(isTimeBasedExercise(ex({ movementGroup: 'horizontal_push' }))).toBe(false);
  });

  it('name-heuristic fallback: hold/plank/hang/החזק/פלאנק match when type/mechanicalType/movementGroup give no signal', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isTimeBasedExercise(ex({ name: { he: 'פלאנק', en: 'plank' } }))).toBe(true);
    expect(isTimeBasedExercise(ex({ name: { he: 'החזקת מתח', en: '' } }))).toBe(true);
    // getLocalizedText defaults to 'he' and only falls through to 'en' when
    // 'he' is empty — these two cover that fallback path explicitly, since
    // this catalog is Hebrew-only in practice (see the comment above the
    // heuristic itself for why the Latin keywords rarely fire on real data).
    expect(isTimeBasedExercise(ex({ name: { he: '', en: 'dead hang' } }))).toBe(true);
    expect(isTimeBasedExercise(ex({ name: { he: '', en: 'hold at top position' } }))).toBe(true);
    warn.mockRestore();
  });

  it('no signal at all (no type, no straight_arm, no dynamic group, no hold-name) => false', () => {
    expect(isTimeBasedExercise(ex({ name: { he: 'כפיפות בטן', en: 'crunches' } }))).toBe(false);
  });

  it('the exact real-data case: "שכיבות סמיכה ברכיים" with no type/mechanicalType/movementGroup signal is deterministically false', () => {
    // Reproduces the fixture shape that produced the real 55-vs-38 split in
    // snapshot.sqlite — proves the canonical function itself was never
    // ambiguous; the ambiguity was introduced downstream (now fixed).
    const kneelingPushup = ex({ name: { he: 'שכיבות סמיכה ברכיים', en: 'knee push-up' } });
    expect(isTimeBasedExercise(kneelingPushup)).toBe(false);
    // Calling it twice must give the identical answer — determinism, not luck.
    expect(isTimeBasedExercise(kneelingPushup)).toBe(false);
  });
});
