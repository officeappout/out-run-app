import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, hoisted test state — the mock filters exactly like a real Firestore
// query would (where('type','==',type) / where('parentAuthorityId','==',null)),
// so these tests exercise the actual scoping contract findAuthorityIdByCity
// relies on, not just its in-memory matching logic.
const state = vi.hoisted(() => ({
  AUTHORITIES: [] as { id: string; name: string; type: string; parentAuthorityId: string | null }[],
  calls: [] as [string | undefined, boolean | undefined][],
}));

vi.mock('@/features/admin/services/authority.service', () => ({
  getAllAuthorities: async (type?: string, topLevelOnly?: boolean) => {
    state.calls.push([type, topLevelOnly]);
    return state.AUTHORITIES.filter((a) => {
      if (type && a.type !== type) return false;
      if (topLevelOnly && a.parentAuthorityId !== null) return false;
      return true;
    });
  },
  getChildrenByParent: vi.fn(),
}));

import { findAuthorityIdByCity } from '../location-utils';

beforeEach(() => {
  state.AUTHORITIES = [];
  state.calls = [];
});

describe('findAuthorityIdByCity — top-level only, deterministic tie-break', () => {
  it('exact match returns the city id', async () => {
    state.AUTHORITIES = [{ id: 'tlv', name: 'תל אביב-יפו', type: 'city', parentAuthorityId: null }];
    expect(await findAuthorityIdByCity('תל אביב-יפו')).toBe('tlv');
  });

  it('regression: short-form city name never matches a same-substring NEIGHBORHOOD — reproduces the live "תל אביב" → "לב תל אביב" corruption', async () => {
    state.AUTHORITIES = [
      { id: 'lev-tlv', name: 'לב תל אביב', type: 'neighborhood', parentAuthorityId: 'tlv' },
      { id: 'tlv', name: 'תל אביב-יפו', type: 'city', parentAuthorityId: null },
    ];
    // Short form (no "-יפו" suffix) — e.g. Mapbox reverse-geocoding or a
    // normalizeCityName() step upstream stripped it, as it does for the
    // useUserCityName.ts map/route-engine call site.
    const id = await findAuthorityIdByCity('תל אביב');
    expect(id).toBe('tlv'); // NOT 'lev-tlv'
  });

  it('queries top-level authorities only (parentAuthorityId===null), not type=city — regional councils must still resolve', async () => {
    state.AUTHORITIES = [
      { id: 'rc-1', name: 'מועצה אזורית חוף השרון', type: 'regional_council', parentAuthorityId: null },
    ];
    const id = await findAuthorityIdByCity('מועצה אזורית חוף השרון');
    expect(id).toBe('rc-1');
    expect(state.calls).toEqual([[undefined, true]]);
  });

  it('deterministic tie-break: among multiple substring matches, prefers the closest name-length match over iteration order', async () => {
    state.AUTHORITIES = [
      // Deliberately listed first — a first-match (iteration-order) bug
      // would return this one incorrectly.
      { id: 'long', name: 'רמת ישראל והסביבה הרחבה מאוד', type: 'city', parentAuthorityId: null },
      { id: 'short', name: 'רמת גן', type: 'city', parentAuthorityId: null },
    ];
    const id = await findAuthorityIdByCity('רמת');
    expect(id).toBe('short');
  });

  it('returns null for an empty city name without querying', async () => {
    expect(await findAuthorityIdByCity('')).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it('returns null when nothing matches', async () => {
    state.AUTHORITIES = [{ id: 'tlv', name: 'תל אביב-יפו', type: 'city', parentAuthorityId: null }];
    expect(await findAuthorityIdByCity('אילת')).toBeNull();
  });
});
