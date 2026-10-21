/**
 * Demo viewer client pieces (PR 5) — pure: payload validation + cache, the ArenaAccess
 * overlay, presence mapping, "לא לבד" pick.
 */
import { describe, expect, it } from 'vitest';
import { NON_VIEWER_TTL_MS, VIEWER_TTL_MS, parseViewerWorld, readCachedWorld, writeCachedWorld } from '../viewer-world.cache';
import { applyViewerWorldToArenaAccess } from '../viewer-arena-access';
import { demoMarkersToPresenceDocs, keepLivePartner } from '../viewer-presence';
import { pickViewerWalkingSuggestion } from '../viewer-walking';
import { deriveArenaAccess } from '@/features/arena/hooks/derive-arena-access';
import type { CommunityGroup } from '@/types/community.types';
import type { DemoViewerWorld } from '../viewer-world.types';

const WORLD: DemoViewerWorld = {
  viewer: true,
  home: { cityId: 'demo-tlv', cityName: 'דמו · תל אביב', neighborhoodId: 'demo-tlv-n1', neighborhoodName: 'דמו · הצפון הישן' },
  cities: [{ id: 'demo-tlv', name: 'דמו · תל אביב' }],
  groupIds: ['demo-grp-tlv-walk'],
};

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('parseViewerWorld', () => {
  it('accepts a demo world', () => {
    expect(parseViewerWorld(WORLD)).toEqual(WORLD);
  });
  it('rejects a non-viewer answer or any real id as home', () => {
    expect(parseViewerWorld({ viewer: false })).toBeNull();
    expect(parseViewerWorld({ ...WORLD, home: { ...WORLD.home, cityId: 'sderot' } })).toBeNull();
    expect(parseViewerWorld({ ...WORLD, home: { ...WORLD.home, neighborhoodId: 'real-n' } })).toBeNull();
    expect(parseViewerWorld({ ...WORLD, groupIds: ['realGroup', 'demo-grp-x'] })?.groupIds).toEqual(['demo-grp-x']);
  });
});

describe('viewer world cache', () => {
  it('caches a viewer for VIEWER_TTL_MS and a non-viewer for a day', () => {
    const s = memStorage();
    writeCachedWorld(s, 'v', WORLD, 0);
    writeCachedWorld(s, 'r', null, 0);
    expect(readCachedWorld(s, 'v', VIEWER_TTL_MS - 1)).toEqual(WORLD);
    expect(readCachedWorld(s, 'v', VIEWER_TTL_MS + 1)).toBeUndefined();
    expect(readCachedWorld(s, 'r', NON_VIEWER_TTL_MS - 1)).toBeNull();
    expect(readCachedWorld(s, 'r', NON_VIEWER_TTL_MS + 1)).toBeUndefined();
    expect(readCachedWorld(s, 'other', 0)).toBeUndefined();
  });
  it('storage that throws is treated as empty', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => writeCachedWorld(bad, 'v', WORLD)).not.toThrow();
    expect(readCachedWorld(bad, 'v')).toBeUndefined();
    expect(readCachedWorld(null, 'v')).toBeUndefined();
  });
});

describe('applyViewerWorldToArenaAccess', () => {
  const real = deriveArenaAccess({ authorityId: 'sderot', neighborhoodId: 'sderot-n1', affiliations: [] } as never, true);
  it('no world ⇒ the very same object', () => {
    expect(applyViewerWorldToArenaAccess(real, null)).toBe(real);
  });
  it('the viewer reads the demo home city and neighbourhood', () => {
    const a = applyViewerWorldToArenaAccess(real, WORLD);
    expect(a).toMatchObject({ cityAuthorityId: 'demo-tlv', cityName: 'דמו · תל אביב', neighborhoodAuthorityId: 'demo-tlv-n1', hasCityAccess: true, hasNeighborhoodAccess: true });
    expect(a.activeTabs.filter((t) => t.key === 'city')).toHaveLength(1);
  });
  it('a viewer with no city of their own gets the city tab', () => {
    const none = deriveArenaAccess({ affiliations: [] } as never, true);
    expect(applyViewerWorldToArenaAccess(none, WORLD).activeTabs.map((t) => t.key)).toEqual(['global', 'city']);
  });
});

describe('demo presence → partner docs', () => {
  it('keeps demo uids with finite coords only', () => {
    const docs = demoMarkersToPresenceDocs([
      { uid: 'demo_a', name: 'א', lat: 32, lng: 34.8, gender: 'female', activity: { status: 'walking' } },
      { uid: 'realU', lat: 32, lng: 34.8 },
      { uid: 'demo_b', lat: Number.NaN, lng: 34.8 },
    ]);
    expect(docs).toEqual([{ uid: 'demo_a', name: 'א', lat: 32, lng: 34.8, mode: 'group', isDemo: true, gender: 'female', activity: { status: 'walking' } }]);
    expect(demoMarkersToPresenceDocs('nope')).toEqual([]);
  });
  it('demo partners skip the radius gate; real ones keep it', () => {
    expect(keepLivePartner({ uid: 'demo_a', distanceKm: 90 }, 5, true)).toBe(true);
    expect(keepLivePartner({ uid: 'realU', distanceKm: 90 }, 5, true)).toBe(false);
    expect(keepLivePartner({ uid: 'realU', distanceKm: 90 }, 5, false)).toBe(true);
  });
});

describe('pickViewerWalkingSuggestion', () => {
  const now = new Date('2026-10-21T05:00:00'); // Wednesday
  const group = (id: string, authorityId: string, lat: number): CommunityGroup => ({
    id, authorityId, name: id, category: 'walking', isActive: true, isPublic: false,
    meetingLocation: { address: 'דמו · הצפון הישן', location: { lat, lng: 34.78 }, precision: 'exact' },
    scheduleSlots: [{ dayOfWeek: 4, time: '18:30', frequency: 'weekly' }],
  } as unknown as CommunityGroup);

  it('offers the home city walking group even when the viewer is far away', () => {
    const s = pickViewerWalkingSuggestion([group('demo-grp-tlv-walk', 'demo-tlv', 32.09)], 'demo-tlv', { lat: 29.55, lng: 34.95 }, now);
    expect(s).toMatchObject({ groupId: 'demo-grp-tlv-walk', km: 0, place: 'דמו · הצפון הישן' });
  });
  it('never offers a non-demo group', () => {
    expect(pickViewerWalkingSuggestion([group('realWalk', 'tlv-real', 32.09)], 'demo-tlv', { lat: 32.09, lng: 34.78 }, now)).toBeNull();
  });
});
