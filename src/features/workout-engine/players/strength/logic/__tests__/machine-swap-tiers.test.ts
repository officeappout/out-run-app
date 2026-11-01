/**
 * Pilot AJ9: a park machine (the hip rotation machine) swaps for machines before bodyweight.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({
  // The canonical gear for a known id ('bar-123' is a pull-up bar), else the id itself.
  normalizeGearId: (id: string) => (id === 'bar-123' ? 'pullup_bar' : id),
}));

import { machineFirst, machineSwapPool, methodUsesMachine, splitMachineTabs } from '../machine-swap-tiers';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

const gear = (id: string, extra: Partial<GymEquipment> = {}) => ({ id, name: id, recommendedLevel: 1, ...extra }) as unknown as GymEquipment;
const opt = (id: string) => ({ exercise: { id } });

describe('methodUsesMachine', () => {
  it('matches the raw gym_equipment id in any equipment field', () => {
    expect(methodUsesMachine({ equipmentIds: ['hip'] }, 'hip')).toBe(true);
    expect(methodUsesMachine({ gearIds: ['hip'] }, 'hip')).toBe(true);
    expect(methodUsesMachine({ gearId: 'hip' }, 'hip')).toBe(true);
    expect(methodUsesMachine({ equipmentIds: ['other'] }, 'hip')).toBe(false);
  });

  it('matches the same canonical gear, but a bodyweight method never matches', () => {
    expect(methodUsesMachine({ gearIds: ['pullup_bar'] }, 'bar-123')).toBe(true);
    expect(methodUsesMachine({}, 'hip')).toBe(false);
    expect(methodUsesMachine(null, 'hip')).toBe(false);
  });
});

describe('machineSwapPool', () => {
  const all = [gear('hip'), gear('twist'), gear('gym-only', { availableInLocations: ['gym'] as any }), gear('both', { availableInLocations: ['park', 'gym'] as any })];

  it('a known park: only its own machines', () => {
    expect(machineSwapPool(all, new Set(['hip', 'twist'])).map((m) => m.id)).toEqual(['hip', 'twist']);
  });

  it('an unknown park: every catalog machine that lives in parks', () => {
    expect(machineSwapPool(all, new Set()).map((m) => m.id)).toEqual(['hip', 'twist', 'both']);
  });
});

describe('machineFirst / splitMachineTabs', () => {
  it('machines lead, bodyweight only fills what is left, no duplicates, capped', () => {
    expect(machineFirst([opt('twist')], [opt('plank'), opt('twist'), opt('bicycle'), opt('extra')]).map((o) => o.exercise.id))
      .toEqual(['twist', 'plank', 'bicycle']);
    expect(machineFirst([], [opt('plank')]).map((o) => o.exercise.id)).toEqual(['plank']);
  });

  it('the best three go to "adaptation", the rest lead "alternative"', () => {
    const ranked = ['a', 'b', 'c', 'd'].map(opt);
    const { adaptation, rest } = splitMachineTabs(ranked);
    expect(adaptation.map((o) => o.exercise.id)).toEqual(['a', 'b', 'c']);
    expect(rest.map((o) => o.exercise.id)).toEqual(['d']);
  });
});
