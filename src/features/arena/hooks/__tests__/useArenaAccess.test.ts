import { describe, it, expect } from 'vitest';
import { deriveArenaAccess } from '../derive-arena-access';

// deriveArenaAccess is the pure derivation extracted from useArenaAccess so it
// can be unit tested without React/jsdom (this repo's vitest config is
// pure-logic-only, node environment — see vitest.config.ts). The hook itself
// is a thin useMemo wrapper around this function.

describe('deriveArenaAccess — neighborhood resolution, analogous to city', () => {
  it('resolves neighborhoodAuthorityId directly from core.neighborhoodId', () => {
    const access = deriveArenaAccess({ neighborhoodId: 'nb-1' } as never, true);
    expect(access.neighborhoodAuthorityId).toBe('nb-1');
    expect(access.hasNeighborhoodAccess).toBe(true);
  });

  it('hasNeighborhoodAccess is false and id is null when core.neighborhoodId is absent', () => {
    const access = deriveArenaAccess({ authorityId: 'city-1' } as never, true);
    expect(access.neighborhoodAuthorityId).toBeNull();
    expect(access.hasNeighborhoodAccess).toBe(false);
  });

  it('neighborhoodName is always null (no stored source yet) — never fabricated', () => {
    const access = deriveArenaAccess({ neighborhoodId: 'nb-1' } as never, true);
    expect(access.neighborhoodName).toBeNull();
  });

  it('city and neighborhood resolve independently — a user can have one without the other', () => {
    const cityOnly = deriveArenaAccess({ authorityId: 'city-1' } as never, true);
    expect(cityOnly.hasCityAccess).toBe(true);
    expect(cityOnly.hasNeighborhoodAccess).toBe(false);

    const both = deriveArenaAccess({ authorityId: 'city-1', neighborhoodId: 'nb-1' } as never, true);
    expect(both.hasCityAccess).toBe(true);
    expect(both.hasNeighborhoodAccess).toBe(true);
  });

  it('undefined core (not yet hydrated) resolves neighborhood access to false, not a crash', () => {
    const access = deriveArenaAccess(undefined, false);
    expect(access.neighborhoodAuthorityId).toBeNull();
    expect(access.hasNeighborhoodAccess).toBe(false);
    expect(access.isLoading).toBe(true);
  });

  it('activeTabs is unaffected by neighborhood access — no neighborhood tab added yet (UI surfacing deferred)', () => {
    const access = deriveArenaAccess({ neighborhoodId: 'nb-1' } as never, true);
    expect(access.activeTabs.some((t) => (t.key as string) === 'neighborhood')).toBe(false);
  });
});
