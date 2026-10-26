/**
 * resolveSwapGear + chosen park (enable_location_gate_v1): a switch to the park uses the CHOSEN
 * park's equipment; the nearest equipped park (resolveWorkoutContext) only when none was chosen
 * or the chosen park lists no equipment.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const chosen = vi.fn<(id: string) => Promise<string[]>>();
const nearest = vi.fn(async () => ({ location: 'park', availableGear: ['nearest_bar'], source: 'equipped-park' }));
const normalize = vi.fn((_p: unknown, _l: unknown, parkGear: string[] | undefined) => parkGear ?? []);

vi.mock('@/features/workout-engine/services/park-equipment-resolver', () => ({ resolveChosenParkEquipmentIds: (id: string) => chosen(id) }));
vi.mock('@/features/workout-engine/services/workout-context-resolver', () => ({ resolveWorkoutContext: () => nearest() }));
vi.mock('@/features/workout-engine/core/middleware/InputSanitizerMiddleware', () => ({
  normalizeEquipmentArray: (p: unknown, l: unknown, g: string[] | undefined) => normalize(p, l, g),
}));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({ getAllGymEquipment: async () => [] }));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({ ensureEquipmentCachesLoaded: async () => {} }));

import { resolveSwapGear } from '../resolve-swap-gear';

const profile = {} as Parameters<typeof resolveSwapGear>[0];

describe('resolveSwapGear — chosen park', () => {
  beforeEach(() => { chosen.mockReset(); nearest.mockClear(); });

  it("a chosen park → that park's equipment, the nearest park is never looked up", async () => {
    chosen.mockResolvedValue(['rings', 'dip_station']);
    expect(await resolveSwapGear(profile, 'park', 'picked')).toEqual(['rings', 'dip_station']);
    expect(chosen).toHaveBeenCalledWith('picked');
    expect(nearest).not.toHaveBeenCalled();
  });
  it('no chosen park → the nearest equipped park', async () => {
    expect(await resolveSwapGear(profile, 'park')).toEqual(['nearest_bar']);
    expect(chosen).not.toHaveBeenCalled();
  });
  it('the chosen park lists no equipment → the nearest equipped park', async () => {
    chosen.mockResolvedValue([]);
    expect(await resolveSwapGear(profile, 'street', 'empty')).toEqual(['nearest_bar']);
  });
  it('a non-park switch looks up no park at all', async () => {
    await resolveSwapGear(profile, 'home', 'picked');
    expect(chosen).not.toHaveBeenCalled();
    expect(nearest).not.toHaveBeenCalled();
  });
});
