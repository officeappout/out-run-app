/**
 * enable_swap_fixes_v1 — service inputs: exercises already in the workout are never offered,
 * and a station's equipment is applied BEFORE the cap of 3. Hidden skills never offered.
 * No opts → today's behaviour.
 */
import { describe, it, expect, vi } from 'vitest';

const park = (gear?: string) => ({ location: 'park', ...(gear ? { equipmentIds: [gear] } : {}) });
const ex = (id: string, level: number, gear?: string, extra: object = {}) => ({
  id,
  name: { he: id },
  base_movement_id: 'pull_family',
  movementGroup: 'vertical_pull',
  targetPrograms: [{ programId: 'pull', level }],
  execution_methods: [park(gear)],
  ...extra,
});

const CATALOG = [
  ex('current', 5, 'bar'),
  ex('in_workout', 5, 'bar'),
  // 4 rings variants at 4/5/6 + 1 bar variant at 7: today's cap keeps rings first.
  ex('rings4', 4, 'rings'),
  ex('rings5', 5, 'rings'),
  ex('rings6', 6, 'rings'),
  ex('bar7', 7, 'bar'),
  ex('mu', 6, 'bar', { targetPrograms: [{ programId: 'muscle_up', level: 6 }] }),
];

vi.mock('@/features/content/exercises', () => ({
  getAllExercisesCached: async () => CATALOG,
}));
vi.mock('../execution-method-selector.service', () => ({
  selectExecutionMethodWithBrand: async (e: { execution_methods: unknown[] }) => e.execution_methods[0],
}));

import { getExerciseVariations, getAlternativeExercises } from '../exercise-replacement.service';

const current = CATALOG[0] as any;
const ids = (list: { exercise: { id: string } }[]) => list.map((o) => o.exercise.id).sort();

describe('exercise-replacement — swap fixes', () => {
  it('no opts → today (in-workout exercise can be offered; hidden skill never)', async () => {
    const out = await getExerciseVariations(current, 5, 'park', null, {} as any);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(ids(out)).not.toContain('mu');
  });

  it('excludeIds drops exercises already in the workout (both tabs)', async () => {
    const opts = { excludeIds: new Set(['in_workout', 'rings5']) };
    const v = await getExerciseVariations(current, 5, 'park', null, {} as any, undefined, opts);
    expect(ids(v)).not.toContain('in_workout');
    expect(ids(v)).not.toContain('rings5');
    const a = await getAlternativeExercises(current, 5, 'park', null, {} as any, undefined, new Set(), undefined, opts);
    expect(ids(a)).not.toContain('in_workout');
  });

  it('station equipment is applied before the cap of 3 — a fitting bar option is found', async () => {
    const v = await getExerciseVariations(current, 5, 'park', null, {} as any, undefined, {
      allowedEquipmentIds: ['bar'],
      excludeIds: new Set(['in_workout']),
    });
    expect(ids(v)).toEqual(['bar7']);
  });
});
