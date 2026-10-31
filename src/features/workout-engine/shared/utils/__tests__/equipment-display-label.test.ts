import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/content/equipment/gear/core/gear-definition.service', () => ({ getAllGearDefinitions: async () => [] }));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({ getAllGymEquipment: async () => [] }));

import {
  resolveEquipmentDisplayLabel,
  resolveEquipmentLabel,
  seedEquipmentCaches,
} from '../gear-mapping.utils';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';

seedEquipmentCaches(
  [
    { id: 'g-bands', iconKey: 'bands', name: { he: 'גומיות', en: 'Resistance bands' } },
    { id: 'g-mat', name: { he: 'מזרן', en: '' } },
  ] as unknown as GearDefinition[],
  [
    { id: 's-bars', iconKey: 'parallel_bars', name: 'מקבילים', nameLocalized: { he: 'מקבילים', en: 'Parallel bars' } },
    { id: 's-he', name: 'מתקן עברי' },
  ] as unknown as GymEquipment[],
);

describe('resolveEquipmentDisplayLabel (AI3)', () => {
  it('Hebrew is resolveEquipmentLabel exactly', () => {
    for (const id of ['g-bands', 'bands', 's-bars', 'parallel_bars', 'g-mat', 's-he', 'dumbbells', 'no-such-id']) {
      expect(resolveEquipmentDisplayLabel(id, 'he')).toBe(resolveEquipmentLabel(id));
    }
  });

  it('English shows the gear / station English name, by id or icon key', () => {
    expect(resolveEquipmentDisplayLabel('g-bands', 'en')).toBe('Resistance bands');
    expect(resolveEquipmentDisplayLabel('bands', 'en')).toBe('Resistance bands');
    expect(resolveEquipmentDisplayLabel('s-bars', 'en')).toBe('Parallel bars');
  });

  it('English falls back to the Hebrew label when the data has no English', () => {
    expect(resolveEquipmentDisplayLabel('g-mat', 'en')).toBe('מזרן');
    expect(resolveEquipmentDisplayLabel('s-he', 'en')).toBe('מתקן עברי');
    expect(resolveEquipmentDisplayLabel('no-such-id', 'en')).toBe(resolveEquipmentLabel('no-such-id'));
  });
});
