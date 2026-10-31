import { describe, expect, it } from 'vitest';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { bodyweightIntroView } from '../park/bodyweight-intro';

const plan = (exercises: Record<string, unknown>[]): WorkoutPlan => ({
  id: 'p', name: 'p', totalDuration: 0, difficulty: 'easy',
  segments: [{ id: 's', type: 'strength', title: '', icon: '', target: { type: 'reps', value: 0 }, isCompleted: false, exercises }],
} as unknown as WorkoutPlan);

describe('bodyweightIntroView', () => {
  it('rows with sets × target, unique muscles, the same set count', () => {
    const v = bodyweightIntroView(plan([
      { id: 'a', name: 'Push-up', reps: '10', sets: 3, imageUrl: 'a.jpg', muscleGroups: ['chest', 'triceps'] },
      { id: 'b', name: 'Plank', duration: '30s', sets: 3, muscleGroups: ['core', 'chest'] },
      { id: 'w', name: 'Warm', reps: '5', exerciseRole: 'warmup' },
    ]), 'park1');
    expect(v).toEqual({
      kind: 'park',
      rows: [
        { id: 'a', name: 'Push-up', imageUrl: 'a.jpg', target: '3×10' },
        { id: 'b', name: 'Plank', imageUrl: null, target: '3×30s' },
      ],
      muscles: ['chest', 'triceps', 'core'],
      setsEach: 3,
    });
  });
  it('no park → street; mixed sets → null; no set count → the bare target', () => {
    const v = bodyweightIntroView(plan([
      { id: 'a', name: 'A', reps: '8', sets: 2 },
      { id: 'b', name: 'B', reps: '12', sets: 4 },
      { id: 'c', name: 'C', reps: '6' },
    ]), null);
    expect(v?.kind).toBe('street');
    expect(v?.setsEach).toBeNull();
    expect(v?.rows[2].target).toBe('6');
  });
  it('no exercises → null (the old welcome screen stays)', () => {
    expect(bodyweightIntroView(plan([]), 'p')).toBeNull();
    expect(bodyweightIntroView(null, 'p')).toBeNull();
  });
});
