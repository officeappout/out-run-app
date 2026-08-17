import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  CHILDREN: {} as Record<
    string,
    { id: string; name: string; parentAuthorityId?: string; coordinates?: { lat: number; lng: number } }[]
  >,
}));

vi.mock('@/features/admin/services/authority.service', () => ({
  getAllAuthorities: vi.fn(),
  getChildrenByParent: async (parentAuthorityId: string) => state.CHILDREN[parentAuthorityId] ?? [],
}));

import { findNearestNeighborhoodByCoordinates } from '../location-utils';

beforeEach(() => {
  for (const k of Object.keys(state.CHILDREN)) delete state.CHILDREN[k];
});

// Tel Aviv-ish coordinates for realistic distances.
const TLV = { lat: 32.0853, lng: 34.7818 };

describe('findNearestNeighborhoodByCoordinates — fallback-only, capped', () => {
  it('returns the closest neighborhood centroid within the distance cap', async () => {
    state.CHILDREN['tlv'] = [
      { id: 'nb-near', name: 'קרוב', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat + 0.001, lng: TLV.lng } }, // ~111m
      { id: 'nb-far', name: 'רחוק', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat + 0.01, lng: TLV.lng } }, // ~1.1km
    ];
    const id = await findNearestNeighborhoodByCoordinates('tlv', TLV.lat, TLV.lng);
    expect(id).toBe('nb-near');
  });

  it('returns null when even the nearest centroid exceeds the sanity cap (2000m)', async () => {
    state.CHILDREN['tlv'] = [
      { id: 'nb-distant', name: 'רחוק מאוד', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat + 0.05, lng: TLV.lng } }, // ~5.5km
    ];
    const id = await findNearestNeighborhoodByCoordinates('tlv', TLV.lat, TLV.lng);
    expect(id).toBeNull();
  });

  it('is scoped to the given city — ignores a child whose own parentAuthorityId does not match', async () => {
    state.CHILDREN['tlv'] = [
      { id: 'wrong-parent', name: 'שייך לעיר אחרת', parentAuthorityId: 'haifa', coordinates: { lat: TLV.lat, lng: TLV.lng } },
    ];
    const id = await findNearestNeighborhoodByCoordinates('tlv', TLV.lat, TLV.lng);
    expect(id).toBeNull();
  });

  it('skips children with no coordinates field instead of throwing', async () => {
    state.CHILDREN['tlv'] = [
      { id: 'no-coords', name: 'בלי נקודה', parentAuthorityId: 'tlv' },
      { id: 'nb-near', name: 'קרוב', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat + 0.001, lng: TLV.lng } },
    ];
    const id = await findNearestNeighborhoodByCoordinates('tlv', TLV.lat, TLV.lng);
    expect(id).toBe('nb-near');
  });

  it('returns null when the city has zero configured neighborhoods', async () => {
    // No entry for 'empty-city' — getChildrenByParent returns [].
    const id = await findNearestNeighborhoodByCoordinates('empty-city', TLV.lat, TLV.lng);
    expect(id).toBeNull();
  });

  it('returns null for missing cityAuthorityId or non-finite coordinates, without querying', async () => {
    expect(await findNearestNeighborhoodByCoordinates('', TLV.lat, TLV.lng)).toBeNull();
    expect(await findNearestNeighborhoodByCoordinates('tlv', NaN, TLV.lng)).toBeNull();
    expect(await findNearestNeighborhoodByCoordinates('tlv', TLV.lat, NaN)).toBeNull();
  });
});
