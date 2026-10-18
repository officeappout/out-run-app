import { describe, it, expect } from 'vitest';
import { buildExerciseSwapPayload, directionFromLevels, type ExerciseSwapInput } from '../build-swap-log';
import { EXERCISE_SWAP_FIELDS } from '../adaptation.types';

const base: ExerciseSwapInput = {
  userId: 'u1',
  fromExerciseId: 'ex_pushup',
  toExerciseId: 'ex_knee_pushup',
  source: 'in_workout_coach_hint',
  userInitiated: true,
};

describe('buildExerciseSwapPayload', () => {
  it('builds the minimal doc', () => {
    expect(buildExerciseSwapPayload(base)).toEqual({
      userId: 'u1',
      fromExerciseId: 'ex_pushup',
      toExerciseId: 'ex_knee_pushup',
      source: 'in_workout_coach_hint',
      userInitiated: true,
    });
  });

  it('keeps every whitelisted field and nothing else', () => {
    const full = buildExerciseSwapPayload({
      ...base,
      sessionClientId: 'w_123',
      fromName: 'שכיבות סמיכה',
      toName: 'שכיבות סמיכה על הברכיים',
      domain: 'push',
      fromLevel: 5,
      toLevel: 3,
      userDomainLevel: 5,
      direction: 'lower',
      tab: 'adaptation',
      flow: 'solo',
      location: 'park',
      parkId: 'p1',
      segmentRole: 'main',
      setsDoneBefore: 2,
      lastSetReps: 4,
      rangeMin: 8,
      reason: 'too_hard',
      appVersion: 'abc1234',
    })!;
    const allowed = new Set<string>(EXERCISE_SWAP_FIELDS);
    for (const k of Object.keys(full)) expect(allowed.has(k)).toBe(true);
    // `at` is the writer's serverTimestamp, never the builder's.
    expect(full).not.toHaveProperty('at');
    expect(full.reason).toBe('too_hard');
    expect(full.setsDoneBefore).toBe(2);
  });

  it('never emits undefined / null values', () => {
    const p = buildExerciseSwapPayload({
      ...base,
      fromName: undefined,
      toName: null,
      fromLevel: null,
      tab: undefined,
      location: '',
    })!;
    for (const v of Object.values(p)) {
      expect(v).not.toBeUndefined();
      expect(v).not.toBeNull();
    }
    expect(p).not.toHaveProperty('toName');
    expect(p).not.toHaveProperty('location');
  });

  it('drops invalid enum values instead of writing them (the rule would reject the doc)', () => {
    const p = buildExerciseSwapPayload({
      ...base,
      reason: 'bored' as never,
      direction: 'sideways' as never,
      tab: 'other' as never,
      flow: 'nope' as never,
    })!;
    expect(p).not.toHaveProperty('reason');
    expect(p).not.toHaveProperty('direction');
    expect(p).not.toHaveProperty('tab');
    expect(p).not.toHaveProperty('flow');
  });

  it('drops non-finite / out-of-range numbers', () => {
    const p = buildExerciseSwapPayload({ ...base, fromLevel: NaN, lastSetReps: -1, setsDoneBefore: Infinity })!;
    expect(p).not.toHaveProperty('fromLevel');
    expect(p).not.toHaveProperty('lastSetReps');
    expect(p).not.toHaveProperty('setsDoneBefore');
  });

  it('derives direction from levels when the caller has none', () => {
    expect(buildExerciseSwapPayload({ ...base, fromLevel: 5, toLevel: 3 })!.direction).toBe('lower');
    expect(buildExerciseSwapPayload({ ...base, fromLevel: 5, toLevel: 5 })!.direction).toBe('same');
    expect(buildExerciseSwapPayload({ ...base, fromLevel: 5, toLevel: 7 })!.direction).toBe('higher');
    // explicit modal value wins
    expect(buildExerciseSwapPayload({ ...base, fromLevel: 5, toLevel: 7, direction: 'same' })!.direction).toBe('same');
    expect(directionFromLevels(undefined, 3)).toBeUndefined();
  });

  it('truncates long strings to the rule bounds', () => {
    const p = buildExerciseSwapPayload({ ...base, fromName: 'א'.repeat(500) })!;
    expect((p.fromName as string).length).toBe(120);
  });

  it('returns null for an unloggable swap', () => {
    expect(buildExerciseSwapPayload({ ...base, userId: '' })).toBeNull();
    expect(buildExerciseSwapPayload({ ...base, toExerciseId: base.fromExerciseId })).toBeNull();
    expect(buildExerciseSwapPayload({ ...base, source: 'somewhere' as never })).toBeNull();
  });

  it('records system swaps as userInitiated:false (only a literal true counts)', () => {
    expect(buildExerciseSwapPayload({ ...base, userInitiated: false })!.userInitiated).toBe(false);
    expect(buildExerciseSwapPayload({ ...base, userInitiated: 'yes' as never })!.userInitiated).toBe(false);
  });

  it("keeps 'pain' as a reason (logged; adaptation must filter it later)", () => {
    expect(buildExerciseSwapPayload({ ...base, reason: 'pain' })!.reason).toBe('pain');
  });
});
