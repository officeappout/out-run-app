import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Proves the entry router's Gate-2 geo checks never fabricate "content
 * nearby" on a failed fetch — "never an empty screen" must not flip into
 * "never a wrong screen" by claiming real content exists when the data
 * fetch itself failed.
 */

const mocks = vi.hoisted(() => ({
  fetchRealParksImpl: vi.fn(),
  getCachedOfficialRoutesImpl: vi.fn(),
}));

vi.mock('@/features/parks/core/services/parks.service', () => ({
  fetchRealParks: (...args: unknown[]) => mocks.fetchRealParksImpl(...args),
}));
vi.mock('@/features/parks/core/services/inventory.service', () => ({
  getCachedOfficialRoutes: (...args: unknown[]) => mocks.getCachedOfficialRoutesImpl(...args),
}));
vi.mock('@/features/workout-engine/hybrid/park-fitness.util', () => ({
  hasUsableEquipment: () => true,
  isPrimaryFitness: () => true,
}));
vi.mock('@/features/parks/core/services/geoUtils', () => ({
  isRouteNearby: () => true,
}));

import { hasNearbyGardens, hasNearbyPreparedRoutes } from '../entry-router-geo.service';

const COORDS = { lat: 32.08, lng: 34.78 };

beforeEach(() => {
  mocks.fetchRealParksImpl.mockReset();
  mocks.getCachedOfficialRoutesImpl.mockReset();
});

describe('hasNearbyGardens — fail-closed on fetch failure', () => {
  it('returns true when a real, equipped, nearby park exists', async () => {
    mocks.fetchRealParksImpl.mockResolvedValue([{ location: { lat: 32.0801, lng: 34.7801 } }]);
    expect(await hasNearbyGardens(COORDS)).toBe(true);
  });

  it('returns false, not throws, when fetchRealParks rejects', async () => {
    mocks.fetchRealParksImpl.mockRejectedValue(new Error('offline'));
    await expect(hasNearbyGardens(COORDS)).resolves.toBe(false);
  });

  it('returns false when no park is within range', async () => {
    mocks.fetchRealParksImpl.mockResolvedValue([{ location: { lat: 31.0, lng: 35.5 } }]);
    expect(await hasNearbyGardens(COORDS)).toBe(false);
  });
});

describe('hasNearbyPreparedRoutes — fail-closed on fetch failure', () => {
  it('returns true when a nearby official route exists', async () => {
    mocks.getCachedOfficialRoutesImpl.mockResolvedValue([{ id: 'r1' }]);
    expect(await hasNearbyPreparedRoutes(COORDS)).toBe(true);
  });

  it('returns false, not throws, when getCachedOfficialRoutes rejects', async () => {
    mocks.getCachedOfficialRoutesImpl.mockRejectedValue(new Error('offline'));
    await expect(hasNearbyPreparedRoutes(COORDS)).resolves.toBe(false);
  });
});
