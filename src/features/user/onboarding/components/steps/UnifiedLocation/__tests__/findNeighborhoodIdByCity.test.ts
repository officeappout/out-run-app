import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, hoisted test state the authority-service mock can reach.
const state = vi.hoisted(() => ({
  CHILDREN: {} as Record<string, { id: string; name: string; parentAuthorityId?: string }[]>,
  calls: [] as string[], // parentAuthorityId passed to getChildrenByParent, per call
}));

vi.mock('@/features/admin/services/authority.service', () => ({
  getAllAuthorities: vi.fn(),
  getChildrenByParent: async (parentAuthorityId: string) => {
    state.calls.push(parentAuthorityId);
    return state.CHILDREN[parentAuthorityId] ?? [];
  },
}));

import { findNeighborhoodIdByCity } from '../location-utils';

beforeEach(() => {
  for (const k of Object.keys(state.CHILDREN)) delete state.CHILDREN[k];
  state.calls = [];
});

describe('findNeighborhoodIdByCity — scoped, never global', () => {
  it('exact name match returns the neighborhood id', async () => {
    state.CHILDREN['telaviv'] = [
      { id: 'nb-bavli', name: 'באבלי', parentAuthorityId: 'telaviv' },
      { id: 'nb-florentin', name: 'פלורנטין', parentAuthorityId: 'telaviv' },
    ];
    const id = await findNeighborhoodIdByCity('telaviv', 'באבלי');
    expect(id).toBe('nb-bavli');
  });

  it('falls back to substring match when no exact match exists', async () => {
    state.CHILDREN['telaviv'] = [{ id: 'nb-bavli', name: 'באבלי צפון', parentAuthorityId: 'telaviv' }];
    const id = await findNeighborhoodIdByCity('telaviv', 'באבלי');
    expect(id).toBe('nb-bavli');
  });

  it('returns null when the city has no matching neighborhood — not an error', async () => {
    state.CHILDREN['telaviv'] = [{ id: 'nb-bavli', name: 'באבלי', parentAuthorityId: 'telaviv' }];
    const id = await findNeighborhoodIdByCity('telaviv', 'רמת אביב');
    expect(id).toBeNull();
  });

  it('returns null (never a cross-city match) when the city has zero configured neighborhoods', async () => {
    // No entry for 'haifa' in state.CHILDREN — getChildrenByParent returns [].
    const id = await findNeighborhoodIdByCity('haifa', 'הדר');
    expect(id).toBeNull();
  });

  it('is scoped to the given city — never queries or matches another city\'s children', async () => {
    state.CHILDREN['telaviv'] = [{ id: 'tlv-bavli', name: 'באבלי', parentAuthorityId: 'telaviv' }];
    state.CHILDREN['haifa'] = [{ id: 'hfa-bavli', name: 'באבלי', parentAuthorityId: 'haifa' }]; // same name, different city
    const id = await findNeighborhoodIdByCity('haifa', 'באבלי');
    expect(id).toBe('hfa-bavli'); // NOT tlv-bavli
    expect(state.calls).toEqual(['haifa']); // only the given city's children were fetched
  });

  it('returns null for empty cityAuthorityId or neighborhoodName without querying', async () => {
    expect(await findNeighborhoodIdByCity('', 'באבלי')).toBeNull();
    expect(await findNeighborhoodIdByCity('telaviv', '')).toBeNull();
    expect(state.calls).toEqual([]);
  });

  it('never returns a candidate whose own parentAuthorityId does not match the queried city — even if getChildrenByParent returned it', async () => {
    // Reproduces the real production case: a Rishon LeZion user's
    // core.neighborhoodId resolved to "רמת אביב", a Tel Aviv neighborhood.
    // Simulates getChildrenByParent (rishonlezion) incorrectly including a
    // Tel-Aviv-parented doc — e.g. a caching/index bug upstream — to prove
    // findNeighborhoodIdByCity itself is the last line of defense, not just
    // a passthrough that trusts whatever the query returned.
    state.CHILDREN['rishonlezion'] = [
      { id: 'tlv-ramat-aviv', name: 'רמת אביב', parentAuthorityId: 'telaviv' }, // wrong parent
    ];
    const id = await findNeighborhoodIdByCity('rishonlezion', 'רמת אביב');
    expect(id).toBeNull();
  });

  it('skips a mismatched-parent candidate and still matches a correctly-scoped sibling', async () => {
    state.CHILDREN['rishonlezion'] = [
      { id: 'tlv-ramat-aviv', name: 'רמת אביב', parentAuthorityId: 'telaviv' }, // wrong parent, must be ignored
      { id: 'rl-ramat-eliyahu', name: 'רמת אליהו', parentAuthorityId: 'rishonlezion' }, // correct
    ];
    const id = await findNeighborhoodIdByCity('rishonlezion', 'רמת אליהו');
    expect(id).toBe('rl-ramat-eliyahu');
  });
});
