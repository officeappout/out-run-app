/**
 * Generator QA round 1 (2026-10-18) — unit coverage for the fixes behind the
 * 05-BENCHMARK §6.4 findings. End-to-end coverage is the hermetic invariants gate
 * (invariants-gate.hermetic.test.ts) + the entry-point bench.
 */
import { describe, it, expect } from 'vitest';
import { isTestOrPlaceholderExercise, withoutTestExercises } from '../shared/utils/test-exercise.utils';
import { minMainExercisesFor, shortSessionRestFloor } from '../logic/session-frame.utils';
import { enforceStrictFocus, isOnStrictFocus } from '../logic/strict-focus.utils';
import { enforceVolumeCap } from '../core/presentation/PresentationFormatter';
import { calculateWeeklyBudget } from '../core/store/useWeeklyVolumeStore';
import { appendCooldownExercises } from '../services/cooldown.service';
import type { GeneratedWorkout, WorkoutExercise } from '../logic/workout-generator.types';

const ex = (id: string, he: string, extra: Record<string, unknown> = {}) => ({ id, name: { he, en: '' }, ...extra }) as any;

describe('H5 — isTestOrPlaceholderExercise', () => {
  it('flags the two known test docs by id, whatever their name', () => {
    expect(isTestOrPlaceholderExercise(ex('ETMVVSpt0lIpeF3mkEn6', 'מתיחות'))).toBe(true);
    expect(isTestOrPlaceholderExercise(ex('k10Af7WEV0qDqx8PY7xQ', 'חימום'))).toBe(true);
  });
  it('flags test / copy markers in the display name', () => {
    for (const he of ['מתיחות פלג גוף עליון לבדיקה', 'סרטון בדיקה', 'טסט', 'push test', 'Copy of מתח', 'העתק של מתח']) {
      expect(isTestOrPlaceholderExercise(ex('x', he))).toBe(true);
    }
  });
  it('does NOT flag a real exercise whose stale ENGLISH name is "Copy of …"', () => {
    expect(isTestOrPlaceholderExercise({ id: 'y', name: { he: 'שכיבות סמיכה ברכיים', en: 'Copy of Copy of חתירות ב-75°' } } as any)).toBe(false);
  });
  it('falls back to the English name only when the Hebrew one is empty', () => {
    expect(isTestOrPlaceholderExercise({ id: 'z', name: { he: '', en: 'Copy of squat' } } as any)).toBe(true);
  });
  it('withoutTestExercises keeps real docs', () => {
    expect(withoutTestExercises([ex('a', 'מתח'), ex('b', 'מתח לבדיקה')]).map(e => e.id)).toEqual(['a']);
  });
});

describe('H5 — cool-down never shows a test item', () => {
  const workout = (): GeneratedWorkout => ({ exercises: [] } as unknown as GeneratedWorkout);
  const homeMethod = { location: 'home', locationMapping: ['home'], requiredGearType: 'improvised', gearIds: [], equipmentIds: [], media: {} };
  it('skips the test cooldown doc and falls back to a real untagged stretch', () => {
    const w = workout();
    appendCooldownExercises(w, [
      ex('ETMVVSpt0lIpeF3mkEn6', 'מתיחות פלג גוף עליון לבדיקה', { exerciseRole: 'cooldown', movementGroup: 'flexibility', execution_methods: [homeMethod] }),
      ex('s1', 'מתיחת כתף', { exerciseRole: 'main', execution_methods: [homeMethod] }),
    ], { availableEquipment: [] } as any, 'home', 15);
    expect(w.exercises.map(e => e.exercise.id)).toEqual(['s1']);
    expect(w.exercises[0].isTimeBased).toBe(true);
  });
  it('omits the block when nothing real exists (never a placeholder)', () => {
    const w = workout();
    appendCooldownExercises(w, [
      ex('ETMVVSpt0lIpeF3mkEn6', 'מתיחות פלג גוף עליון לבדיקה', { exerciseRole: 'cooldown', movementGroup: 'flexibility', execution_methods: [homeMethod] }),
    ], { availableEquipment: [] } as any, 'home', 15);
    expect(w.exercises).toEqual([]);
  });
});

describe('H3 — minimum main exercises by duration', () => {
  it('matches the owner table', () => {
    expect([10, 15, 20, 30, 45, 60].map(minMainExercisesFor)).toEqual([3, 3, 4, 4, 5, 6]);
    expect(minMainExercisesFor(undefined)).toBe(0);
  });
  it('rest floors shrink with the session', () => {
    expect([10, 15, 20, 30, 45].map(shortSessionRestFloor)).toEqual([40, 45, 60, 60, 75]);
  });
  it('weekly fallback never gives a low-level user a 2-4 set week', () => {
    expect(calculateWeeklyBudget(1)).toBe(8);
    expect(calculateWeeklyBudget(10)).toBe(20); // unchanged above the tier default
  });

  const main = (id: string, score: number): WorkoutExercise => ({
    exercise: { id, name: { he: id }, movementGroup: 'horizontal_push', secondsPerRep: 3 },
    method: {}, mechanicalType: 'none', sets: 3, reps: 10, isTimeBased: false, restSeconds: 150,
    priority: 'compound', score, reasoning: [], exerciseRole: 'main', tier: 'match',
  }) as unknown as WorkoutExercise;

  it('enforceVolumeCap trims sets, then rest, before dropping below the floor', () => {
    const w = { exercises: ['a', 'b', 'c', 'd'].map((id, i) => main(id, 90 - i)) } as unknown as GeneratedWorkout;
    enforceVolumeCap(w, { durationCap: 10 });
    const mains = w.exercises.filter(e => e.exerciseRole === 'main');
    expect(mains.length).toBeGreaterThanOrEqual(3);
    expect(mains.every(e => e.sets === 2)).toBe(true);
    expect(mains.every(e => e.restSeconds < 150 && e.restSeconds >= 40)).toBe(true);
    expect(w.estimatedDuration).toBeLessThanOrEqual(13);
  });

  it('Phase V adds reserve candidates when the plan is below the floor, before the cool-down', () => {
    const cooldown = { ...main('cd', 0), exerciseRole: 'cooldown', sets: 1, restSeconds: 0 } as WorkoutExercise;
    const w = { exercises: [main('a', 90), cooldown], reserveExercises: [main('r1', 50), main('r2', 40)] } as unknown as GeneratedWorkout;
    enforceVolumeCap(w, { durationCap: 15 });
    expect(w.exercises.filter(e => e.exerciseRole === 'main').length).toBe(3);
    expect(w.exercises[w.exercises.length - 1].exercise.id).toBe('cd');
  });
});

describe('H2 — strict focus', () => {
  const we = (id: string, movementGroup?: string, role: string = 'main') =>
    ({ exercise: { id, name: { he: id }, movementGroup }, exerciseRole: role, sets: 2, reasoning: [] }) as unknown as WorkoutExercise;
  it('maps movement groups (skills folded to their parent) and rejects unmapped ones', () => {
    expect(isOnStrictFocus({ movementGroup: 'vertical_pull' } as any, ['pull'])).toBe(true);
    expect(isOnStrictFocus({ movementGroup: 'planche' } as any, ['push'])).toBe(true);
    expect(isOnStrictFocus({ movementGroup: 'isolation' } as any, ['legs'])).toBe(false);
    expect(isOnStrictFocus({} as any, ['pull'])).toBe(false);
  });
  it('removes off-focus mains (and reserve), keeps warm-up / cool-down, no-op when not strict', () => {
    const w = {
      exercises: [we('wu', 'horizontal_push', 'warmup'), we('row', 'horizontal_pull'), we('pushup', 'horizontal_push'), we('crunch', 'core'), we('st', undefined, 'cooldown')],
      reserveExercises: [we('r-push', 'horizontal_push'), we('r-pull', 'vertical_pull')],
    } as unknown as GeneratedWorkout;
    expect(enforceStrictFocus(w, ['pull'], false)).toEqual([]);
    expect(enforceStrictFocus(w, ['pull'], true)).toEqual(['pushup', 'crunch']);
    expect(w.exercises.map(e => e.exercise.id)).toEqual(['wu', 'row', 'st']);
    expect(w.reserveExercises!.map(e => e.exercise.id)).toEqual(['r-pull']);
  });
});
