import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { selectMethodForContext } from '../method-selection.utils';
import { seedEquipmentCaches } from '../gear-mapping.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GearDefinition } from '@/features/content/equipment/gear/core/gear-definition.types';

/**
 * Pilot T6 (2026-10-30): outdoor sessions got home exercises. The park method of "Romanian
 * deadlift" needs a backpack, an isOptional improvised item, and park gating skipped every
 * isOptional id, so the method passed with no gear at all. Outdoors an optional item must be
 * in the session gear; indoors it is still assumed.
 */

const BACKPACK = 'kp7fek6IloLYhKmUs0VU';
const ex = (id: string, methods: Array<Record<string, unknown>>): Exercise =>
  ({ id, name: { he: id, en: id }, execution_methods: methods } as unknown as Exercise);

beforeAll(() => {
  seedEquipmentCaches(
    [{ id: BACKPACK, name: { he: 'תיק גב' }, category: 'improvised', isOptional: true, allowedLocations: ['home', 'park', 'office'] } as unknown as GearDefinition],
    [],
  );
});
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const rdl = ex('rdl', [
  { location: 'park', methodName: 'park-backpack', gearIds: [BACKPACK] },
  { location: 'home', methodName: 'home', gearIds: [], requiredGearType: 'improvised' },
]);

describe('park gating: optional items are not assumed outdoors', () => {
  it('park, no backpack: the exercise is excluded', () => {
    expect(selectMethodForContext(rdl, 'park', ['bodyweight'])).toBeNull();
  });
  it('park WITH a backpack: the park method is selected', () => {
    expect(selectMethodForContext(rdl, 'park', ['bodyweight', BACKPACK])?.methodName).toBe('park-backpack');
  });
  it('park: a mat (floor surface) still passes', () => {
    const plank = ex('plank', [{ location: 'park', methodName: 'mat', gearIds: ['mat'] }]);
    expect(selectMethodForContext(plank, 'park', ['bodyweight'])?.methodName).toBe('mat');
  });
  it('home: the optional backpack is still assumed', () => {
    const homeRdl = ex('rdl-home', [{ location: 'home', methodName: 'home-backpack', gearIds: [BACKPACK] }]);
    expect(selectMethodForContext(homeRdl, 'home', ['bodyweight'])?.methodName).toBe('home-backpack');
  });
});
