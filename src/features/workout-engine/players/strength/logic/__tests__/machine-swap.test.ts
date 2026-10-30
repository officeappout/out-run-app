import { describe, it, expect } from 'vitest';
import { compareMachineLevel, machineIdOf, rankMachineSwaps } from '../machine-swap';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

const m = (id: string, primaryMuscle?: string, movementPattern?: string, extra: Partial<GymEquipment> = {}) =>
  ({ id, name: id, primaryMuscle, movementPattern, recommendedLevel: 5, ...extra }) as unknown as GymEquipment;

// The seated chest press from the pilot note, as a station pseudo-exercise.
const chestPress = { id: 'press', sourceEquipmentId: 'press', primaryMuscle: 'chest', movementGroup: 'horizontal_push' };

describe('machine-swap (pilot AG5)', () => {
  it('only a machine pseudo-exercise has a machine id', () => {
    expect(machineIdOf(chestPress)).toBe('press');
    expect(machineIdOf({ id: 'pushup', primaryMuscle: 'chest' })).toBeNull();
    expect(machineIdOf(null)).toBeNull();
  });

  it('same muscle first, then same movement pattern; never itself, cardio or other muscles', () => {
    const park = [
      m('press', 'chest', 'horizontal_push'),
      m('rower', 'back', 'horizontal_pull'),
      m('dips', 'triceps', 'horizontal_push'),
      m('fly', 'chest', 'isolation'),
      m('bike', 'chest', 'horizontal_push', { isCardio: true }),
    ];
    expect(rankMachineSwaps(chestPress, park).map((x) => x.id)).toEqual(['fly', 'dips']);
  });

  it('skips machines already in the workout and caps at 3', () => {
    const park = ['a', 'b', 'c', 'd', 'e'].map((id) => m(id, 'chest'));
    expect(rankMachineSwaps(chestPress, park, { exclude: new Set(['a']) }).map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });

  it('a park with no related machine offers none', () => {
    expect(rankMachineSwaps(chestPress, [m('rower', 'back', 'horizontal_pull')])).toEqual([]);
  });

  it('level comparison', () => {
    expect(compareMachineLevel(3, 5)).toBe('lower');
    expect(compareMachineLevel(5, 5)).toBe('same');
    expect(compareMachineLevel(7, 5)).toBe('higher');
  });
});
