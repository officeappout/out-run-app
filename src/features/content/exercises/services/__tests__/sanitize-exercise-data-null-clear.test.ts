import { describe, it, expect } from 'vitest';
import { sanitizeExerciseData } from '../exercise-mapping.utils';

/**
 * Round 2 (docs/workout-engine/03-CHANGES.md): the admin panel sent `undefined`
 * to mean "cleared" for movementGroup/primaryMuscle/base_movement_id —
 * exercise.service.ts's preserveField treats undefined as "field untouched",
 * so clearing silently didn't persist. Fixed at the UI layer (send `null`
 * instead) — this locks in that sanitizeExerciseData (the layer between the
 * form and preserveField) correctly passes a real `null` through rather than
 * dropping the key or reintroducing undefined.
 */
describe('sanitizeExerciseData — null is a real, explicit "cleared" value', () => {
  it('movementGroup: null → sanitized.movementGroup === null (not dropped, not undefined)', () => {
    const sanitized = sanitizeExerciseData({ movementGroup: null } as any);
    expect(sanitized.movementGroup).toBeNull();
    expect('movementGroup' in sanitized).toBe(true);
  });

  it('primaryMuscle: null → sanitized.primaryMuscle === null', () => {
    const sanitized = sanitizeExerciseData({ primaryMuscle: null } as any);
    expect(sanitized.primaryMuscle).toBeNull();
    expect('primaryMuscle' in sanitized).toBe(true);
  });

  it('base_movement_id: null → sanitized.base_movement_id === null', () => {
    const sanitized = sanitizeExerciseData({ base_movement_id: null } as any);
    expect(sanitized.base_movement_id).toBeNull();
    expect('base_movement_id' in sanitized).toBe(true);
  });

  it('a real value still passes through unaffected (not accidentally nulled)', () => {
    const sanitized = sanitizeExerciseData({
      movementGroup: 'squat',
      primaryMuscle: 'quads',
      base_movement_id: 'squat_variation',
    } as any);
    expect(sanitized.movementGroup).toBe('squat');
    expect(sanitized.primaryMuscle).toBe('quads');
    expect(sanitized.base_movement_id).toBe('squat_variation');
  });

  it('an omitted key (real "untouched") stays absent from sanitized — preserveField must still see it as untouched', () => {
    const sanitized = sanitizeExerciseData({ tags: ['skill'] } as any);
    expect('movementGroup' in sanitized).toBe(false);
    expect('primaryMuscle' in sanitized).toBe(false);
    expect('base_movement_id' in sanitized).toBe(false);
  });

  it('targetPrograms is not covered by this function\'s explicit field list (handled by the form submit layer instead) — undefined stays dropped, [] must be preserved by whichever caller sends it', () => {
    const sanitized = sanitizeExerciseData({ targetPrograms: [] } as any);
    expect(sanitized.targetPrograms).toEqual([]);
  });
});
