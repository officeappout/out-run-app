import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  CHILDREN: {} as Record<
    string,
    { id: string; name: string; parentAuthorityId?: string; coordinates?: { lat: number; lng: number } }[]
  >,
  childrenCalls: 0,
  authoritiesCalls: 0,
  release: null as null | (() => void),
}));

vi.mock('@/features/admin/services/authority.service', () => ({
  getAllAuthorities: async () => {
    state.authoritiesCalls++;
    await new Promise<void>((r) => { state.release = r; });
    return [{ id: 'tlv', name: 'תל אביב-יפו', parentAuthorityId: null }];
  },
  getChildrenByParent: async (parentAuthorityId: string) => {
    state.childrenCalls++;
    return state.CHILDREN[parentAuthorityId] ?? [];
  },
}));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: vi.fn() }));
vi.mock('@/features/parks/core/services/inventory.service', () => ({ InventoryService: {} }));

import {
  resolveNeighborhoodIdForGps,
  matchNeighborhoodByName,
  matchNearestNeighborhood,
  prewarmLocationLookups,
  findAuthorityIdByCity,
} from '../location-utils';

const TLV = { lat: 32.0853, lng: 34.7818 };

beforeEach(() => {
  for (const k of Object.keys(state.CHILDREN)) delete state.CHILDREN[k];
  state.childrenCalls = 0;
  state.authoritiesCalls = 0;
});

describe('resolveNeighborhoodIdForGps — one children read, name match first', () => {
  it('prefers the name match over a nearer centroid', async () => {
    state.CHILDREN['tlv'] = [
      { id: 'nb-name', name: 'פלורנטין', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat + 0.01, lng: TLV.lng } },
      { id: 'nb-near', name: 'אחר', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat, lng: TLV.lng } },
    ];
    expect(await resolveNeighborhoodIdForGps('tlv', 'פלורנטין', TLV.lat, TLV.lng)).toBe('nb-name');
    expect(state.childrenCalls).toBe(1);
  });

  it('falls back to the nearest centroid with the same single read', async () => {
    state.CHILDREN['tlv'] = [
      { id: 'nb-near', name: 'אחר', parentAuthorityId: 'tlv', coordinates: { lat: TLV.lat + 0.001, lng: TLV.lng } },
    ];
    expect(await resolveNeighborhoodIdForGps('tlv', 'לא קיים', TLV.lat, TLV.lng)).toBe('nb-near');
    expect(await resolveNeighborhoodIdForGps('tlv', null, TLV.lat, TLV.lng)).toBe('nb-near');
    expect(state.childrenCalls).toBe(2);
  });

  it('returns null without a read when there is no authority', async () => {
    expect(await resolveNeighborhoodIdForGps(null, 'x', TLV.lat, TLV.lng)).toBeNull();
    expect(state.childrenCalls).toBe(0);
  });

  it('stays scoped to the city (parentAuthorityId re-check) in both matchers', () => {
    const kids = [{ id: 'other', name: 'פלורנטין', parentAuthorityId: 'haifa', coordinates: TLV }];
    expect(matchNeighborhoodByName(kids, 'tlv', 'פלורנטין')).toBeNull();
    expect(matchNearestNeighborhood(kids, 'tlv', TLV.lat, TLV.lng)).toBeNull();
  });
});

describe('prewarmLocationLookups — in-flight dedupe', () => {
  it('a lookup started while the prewarm is in flight joins it (one Firestore scan)', async () => {
    prewarmLocationLookups();
    const pending = findAuthorityIdByCity('תל אביב-יפו');
    await Promise.resolve();
    state.release?.();
    expect(await pending).toBe('tlv');
    expect(state.authoritiesCalls).toBe(1);
  });
});
