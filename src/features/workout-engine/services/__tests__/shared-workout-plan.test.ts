import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { sharedDocToGeneratedWorkout } from '../shared-workout-plan';
import { groupExercisesIntoSections } from '@/features/workouts/components/workout-preview-drawer/utils/section-grouping.utils';

const ex = (id: string, extra: Record<string, unknown> = {}) => ({
  exerciseId: id, name: `ex-${id}`, sets: 3, reps: 10, isTimeBased: false, restSeconds: 60, ...extra,
});
const base = { title: 'T', description: 'D', difficulty: 2, estimatedDuration: 30, totalPlannedSets: 9, isRecovery: false, structure: 'standard' };

describe('sharedDocToGeneratedWorkout', () => {
  it('rebuilds the plan with roles, ranges and equipment', () => {
    const w = sharedDocToGeneratedWorkout({
      ...base,
      equipment: ['pullup_bar'],
      exercises: [
        ex('w1', { exerciseRole: 'warmup' }),
        ex('a', { pairedWith: 'b', repsRange: { min: 8, max: 12 } }),
        ex('b', { pairedWith: 'a', imageUrl: 'http://img' }),
        ex('c', { exerciseRole: 'cooldown' }),
      ],
    } as never)!;
    expect(w.exercises).toHaveLength(4);
    expect(w.exercises[0].exerciseRole).toBe('warmup');
    expect(w.exercises[1].repsRange).toEqual({ min: 8, max: 12 });
    expect((w.exercises[2].method as any).media.imageUrl).toBe('http://img');
    expect((w.exercises[1].method as any).gearIds).toEqual(['pullup_bar']);
    expect(w.difficulty).toBe(2);
    // The shared preview list groups it like the in-app one: warmup, a superset pair, cooldown.
    const sections = groupExercisesIntoSections(w.exercises);
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });
  it('returns null when the doc lacks data', () => {
    expect(sharedDocToGeneratedWorkout(null)).toBeNull();
    expect(sharedDocToGeneratedWorkout({ ...base, exercises: [] } as never)).toBeNull();
    expect(sharedDocToGeneratedWorkout({ ...base, exercises: [ex('a', { name: '' })] } as never)).toBeNull();
  });
  it('clamps an unknown difficulty to medium', () => {
    expect(sharedDocToGeneratedWorkout({ ...base, difficulty: 9, exercises: [ex('a')] } as never)!.difficulty).toBe(2);
  });
  it('the shared page renders it only behind the flag, with the old layout as fallback', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../../app/workouts/[id]/WorkoutPreviewClient.tsx', import.meta.url)), 'utf8');
    expect(src).toContain('previewFlags.enableSharedWorkoutPreviewV1');
    expect(src).toContain('richPreview && sharedPlan');
    expect(src).toContain(') : hasStructuredGroups ? (');
  });
});
