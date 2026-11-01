/**
 * Pilot AG5 — swapping a park MACHINE at a station offers the park's other machines for the
 * same muscle, each with its own machine method and photo; never bodyweight from the catalog.
 * AJ9: the same machine's catalog exercises first, and an unknown park falls back to the catalog's machines.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const MACHINES = [
  { id: 'press', name: 'לחיצת חזה בישיבה', primaryMuscle: 'chest', movementPattern: 'horizontal_push', recommendedLevel: 5, brands: [{ brandName: 'Ludos', imageUrl: 'https://img/press.jpg' }] },
  { id: 'fly', name: 'פרפר', primaryMuscle: 'chest', movementPattern: 'horizontal_push', recommendedLevel: 4, brands: [{ brandName: 'Ludos', imageUrl: 'https://img/fly.jpg' }] },
  { id: 'rower', name: 'חתירה', primaryMuscle: 'back', movementPattern: 'horizontal_pull', recommendedLevel: 5, brands: [] },
  { id: 'elsewhere', name: 'לחיצה בפארק אחר', primaryMuscle: 'chest', movementPattern: 'horizontal_push', recommendedLevel: 5, brands: [] },
];

vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getAllGymEquipmentCached: async () => MACHINES,
  getGymEquipment: async () => null,
}));
// A catalog exercise done on the press machine itself (pilot AJ9, tier 1), and a bodyweight one.
const CATALOG = [
  { id: 'press-negatives', name: 'לחיצה איטית במכונה', recommendedLevel: 6, execution_methods: [{ location: 'park', equipmentIds: ['press'] }] },
  { id: 'pushup', name: 'שכיבות סמיכה', recommendedLevel: 5, execution_methods: [{ location: 'park' }] },
];
let catalog: any[] = [];
vi.mock('@/features/content/exercises', () => ({ getAllExercisesCached: async () => catalog }));
vi.mock('../../../services/home-workout.service', () => ({ generateHomeWorkoutTrio: vi.fn(), normalizeProgramId: (s: string) => s }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ getPark: vi.fn() }));
vi.mock('../../../services/park-equipment-resolver', () => ({ resolveParkEquipmentIds: vi.fn() }));
vi.mock('../../../shared/utils/gear-mapping.utils', () => ({ ensureEquipmentCachesLoaded: vi.fn() }));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({
  ensureEquipmentCachesLoaded: vi.fn(),
  normalizeGearId: (id: string) => id,
}));

import { getMachineAlternatives } from '../exercise-replacement.service';
import { getMachineSwapOptions } from '../machine-swap.service';
import { buildMachinePseudoExercise, TABATA_DIFFICULTY_LADDER } from '../../../services/compose-park-strength-workout.service';

const park = { id: 'p1', gymEquipment: [
  { equipmentId: 'press', brandName: 'Ludos' },
  { equipmentId: 'fly', brandName: 'Ludos' },
  { equipmentId: 'rower', brandName: 'Ludos' },
] } as any;

const station = buildMachinePseudoExercise(MACHINES[0] as any, TABATA_DIFFICULTY_LADDER.medium, 'Ludos');

describe('getMachineAlternatives (pilot AG5)', () => {
  beforeEach(() => { catalog = []; });

  it('the station machine carries its marker and its method (photo) on the exercise', () => {
    const ex = station.exercise as any;
    expect(ex.sourceEquipmentId).toBe('press');
    expect(ex.execution_methods?.[0]?.media?.imageUrl).toBe('https://img/press.jpg');
  });

  it('offers the park\'s other chest machine, as a machine with its own method', async () => {
    const out = await getMachineAlternatives(station.exercise as any, 5, park);
    expect(out.map((o) => o.exercise.id)).toEqual(['fly']);
    expect(out[0].selectedExecutionMethod?.requiredGearType).toBe('fixed_equipment');
    expect(out[0].selectedExecutionMethod?.media?.imageUrl).toBe('https://img/fly.jpg');
    expect(out[0].levelComparison).toBe('lower');
  });

  it('a catalog exercise gets nothing from this path', async () => {
    expect(await getMachineAlternatives({ id: 'pushup' } as any, 5, park)).toEqual([]);
  });

  it('an unknown park (preview drawer / player, AJ9) still gets machines, from the catalog', async () => {
    const out = await getMachineAlternatives(station.exercise as any, 5, null);
    expect(out.map((o) => o.exercise.id)).toEqual(['fly', 'elsewhere']);
  });

  it('never offers a machine already in the workout', async () => {
    expect(await getMachineAlternatives(station.exercise as any, 5, park, { excludeIds: new Set(['fly']) })).toEqual([]);
  });
});

describe('getMachineSwapOptions (pilot AJ9)', () => {
  beforeEach(() => { catalog = CATALOG; });

  it('the same machine\'s catalog exercises come first, with the method that uses the machine', async () => {
    const out = await getMachineSwapOptions(station.exercise as any, 5, park);
    expect(out.map((o) => o.exercise.id)).toEqual(['press-negatives', 'fly']);
    expect((out[0].selectedExecutionMethod as any)?.equipmentIds).toEqual(['press']);
    expect(out[0].levelComparison).toBe('higher');
  });

  it('never a bodyweight exercise, nor one already in the workout', async () => {
    const out = await getMachineSwapOptions(station.exercise as any, 5, park, { excludeIds: new Set(['press-negatives']) });
    expect(out.map((o) => o.exercise.id)).toEqual(['fly']);
  });
});
