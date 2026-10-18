import { describe, it, expect } from 'vitest';
import { GenerateWorkoutInput } from '@/lib/ai/coach/tools';
import { buildGenerateOptions, compactWorkout, newAiWorkoutId } from '../services/workout-tool.pure';

const profile = { id: 'u' } as any;

describe('buildGenerateOptions (mirrors WorkoutBuilderSheet.handleGenerate)', () => {
  it('maps the model input to the builder knobs', () => {
    const input = GenerateWorkoutInput.parse({ durationMin: 25, location: 'home', difficulty: 2, domains: ['core', 'legs'], equipment: ['mat'] });
    const o = buildGenerateOptions(input, profile, { remaining: 40, usagePct: 0 }, undefined);
    expect(o).toEqual({
      userProfile: profile,
      testLocation: 'home',
      availableTime: 25,
      difficulty: 2,
      targetDifficulty: 2,
      intentMode: undefined,
      requiredDomains: ['core', 'legs'],
      strictDomains: true,
      equipmentOverride: ['mat'],
      remainingWeeklyBudget: 40,
      weeklyBudgetUsagePercent: undefined,
      parkEquipmentIds: undefined,
      isManualOverride: true,
    });
  });

  it('short + intense → blast (same rule as the builder); no domains → engine decides', () => {
    const input = GenerateWorkoutInput.parse({ durationMin: 15, location: 'park', difficulty: 3 });
    const o = buildGenerateOptions(input, profile, {}, ['bar']);
    expect(o.intentMode).toBe('blast');
    expect(o.requiredDomains).toBeUndefined();
    expect(o.strictDomains).toBe(false);
    expect(o.equipmentOverride).toBeUndefined();
    expect(o.parkEquipmentIds).toEqual(['bar']);
  });
});

describe('compactWorkout', () => {
  const workout = {
    title: 'אימון בטן ורגליים',
    estimatedDuration: 24.6,
    exercises: [
      { exerciseRole: 'warmup', sets: 1, reps: 10, isTimeBased: false, exercise: { name: 'חימום' } },
      { exerciseRole: 'main', sets: 3, reps: 12, isTimeBased: false, exercise: { name: 'סקוואט' } },
      { sets: 3, reps: 30, isTimeBased: true, exercise: { name: 'פלאנק' } },
      { exerciseRole: 'cooldown', sets: 1, reps: 30, isTimeBased: true, exercise: { name: 'מתיחה' } },
    ],
    decisionRecord: { v: 1, seed: 7, reasons: [{ code: 'TIME', slot: 'morning' }], expect: { exercisesCount: 2 } },
  } as any;

  it('keeps main exercises only, reps vs seconds, rounded minutes, decision record', () => {
    const c = compactWorkout('ai-x-123456', 'home', workout, (ex: any) => ex.exercise.name);
    expect(c).toEqual({
      workoutId: 'ai-x-123456',
      title: 'אימון בטן ורגליים',
      minutes: 25,
      location: 'home',
      exercises: [
        { name: 'סקוואט', sets: 3, reps: 12, seconds: null },
        { name: 'פלאנק', sets: 3, reps: null, seconds: 30 },
      ],
      decisionRecord: workout.decisionRecord,
    });
  });

  it('workout ids match the server-side schema', () => {
    expect(newAiWorkoutId(1_760_000_000_000, () => 0.5)).toMatch(/^ai-[a-z0-9-]{4,60}$/);
  });
});
