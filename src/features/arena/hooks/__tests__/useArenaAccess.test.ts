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

describe('deriveArenaAccess — reserve league tab (Phase 6a)', () => {
  // hasReserveAccess is an explicit boolean param here, not derived from
  // core/profile data — its real source is a live military_declarations
  // listener (useHasDeclaredReserveStatus.ts), computed by the caller so
  // that listener isn't mounted for every one of this hook's many other
  // consumers. See that hook's own comment for why (immediacy after
  // declaring, independent of the join CF's completion).
  it('no reserve tab when hasReserveAccess is false (default)', () => {
    expect(deriveArenaAccess(undefined, true).activeTabs.some((t) => t.key === 'reserve')).toBe(false);
    expect(deriveArenaAccess(undefined, true, false).activeTabs.some((t) => t.key === 'reserve')).toBe(false);
  });

  it('reserve tab and hasReserveAccess appear when the param is true', () => {
    const access = deriveArenaAccess(undefined, true, true);
    expect(access.activeTabs.some((t) => t.key === 'reserve')).toBe(true);
    expect(access.hasReserveAccess).toBe(true);
  });

  it('reserve tab coexists with city/org/park tabs — independent of geo/org affiliation', () => {
    const access = deriveArenaAccess(
      { authorityId: 'city-1' } as never,
      true,
      true,
    );
    expect(access.activeTabs.map((t) => t.key)).toEqual(expect.arrayContaining(['global', 'city', 'reserve']));
  });
});

describe('deriveArenaAccess — hasUnitLeagueAccess (Phase 6b)', () => {
  // 07.09.2026 — unit-vs-unit competition no longer has its own activeTabs
  // entry (moved into the 'reserve' tab's own "קבוצות" toggle, read directly
  // via access.hasUnitLeagueAccess by community/page.tsx's
  // renderReserveSegment() — not via activeTabs). hasUnitLeagueAccess itself
  // is still independent of hasReserveAccess: a career/regular soldier with
  // a declared brigade still has hasUnitLeagueAccess=true even without ever
  // qualifying for the individual reserve league.
  it('hasUnitLeagueAccess is independent of hasReserveAccess', () => {
    const access = deriveArenaAccess(undefined, true, false, true);
    expect(access.hasUnitLeagueAccess).toBe(true);
    expect(access.hasReserveAccess).toBe(false);
    // No 'unit_league' key exists in ArenaTabKey at all anymore — a
    // .some(t => t.key === 'unit_league') check would now be a type error
    // (the literal has no overlap with the union), which is itself the
    // guarantee: it's not just absent at runtime, it's unrepresentable.
  });

  it('hasUnitLeagueAccess and hasReserveAccess can both be true independently', () => {
    const access = deriveArenaAccess(undefined, true, true, true);
    expect(access.hasUnitLeagueAccess).toBe(true);
    expect(access.hasReserveAccess).toBe(true);
    expect(access.activeTabs.map((t) => t.key)).toEqual(expect.arrayContaining(['reserve']));
  });
});
