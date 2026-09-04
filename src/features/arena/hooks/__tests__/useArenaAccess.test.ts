import { describe, it, expect } from 'vitest';
import { deriveArenaAccess } from '../derive-arena-access';
import { RESERVE_LEAGUE_GROUP_ID } from '@/lib/military-reserve-league';

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

describe('deriveArenaAccess — reserve league tab (Phase 6a)', () => {
  // Gated on actual community_groups membership (social.groupIds), not on a
  // fresh military_declarations read — the tab means "you're in the league"
  // (post-CF-join), and reuses data already on the loaded profile.
  it('no reserve tab when social.groupIds is absent/empty', () => {
    expect(deriveArenaAccess(undefined, true).activeTabs.some((t) => t.key === 'reserve')).toBe(false);
    expect(deriveArenaAccess(undefined, true, []).activeTabs.some((t) => t.key === 'reserve')).toBe(false);
  });

  it('no reserve tab for an unrelated group id', () => {
    const access = deriveArenaAccess(undefined, true, ['some_other_group']);
    expect(access.activeTabs.some((t) => t.key === 'reserve')).toBe(false);
  });

  it('reserve tab and hasReserveAccess appear once social.groupIds includes the fixed reserve league group id', () => {
    const access = deriveArenaAccess(undefined, true, [RESERVE_LEAGUE_GROUP_ID]);
    expect(access.activeTabs.some((t) => t.key === 'reserve')).toBe(true);
    expect(access.hasReserveAccess).toBe(true);
  });

  it('reserve tab coexists with city/org/park tabs — independent of geo/org affiliation', () => {
    const access = deriveArenaAccess(
      { authorityId: 'city-1' } as never,
      true,
      [RESERVE_LEAGUE_GROUP_ID],
    );
    expect(access.activeTabs.map((t) => t.key)).toEqual(expect.arrayContaining(['global', 'city', 'reserve']));
  });
});
