/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * Demo viewer world (PR 5): who gets a demo home, which one, and what a non-viewer costs.
 * Also the viewer's map presence (demo-viewer-presence.server.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeAdminDb } from './helpers/fake-admin-db';
import { __resetDemoWorldCachesForTests } from '../demo-world.server';
import { resolveDemoViewerWorld } from '../demo-viewer-world.server';
import { DEMO_PRESENCE_STALE_MS, getDemoPresenceForViewer, toDemoPresenceMarker } from '../demo-viewer-presence.server';

vi.mock('server-only', () => ({}));

const WORLD = {
  'demo_registry/viewers': { uids: ['viewerA', 'viewerB'], homes: { viewerB: { cityId: 'demo-haifa', neighborhoodId: 'demo-haifa-n2' } } },
  'demo_registry/tenants': {
    cityIds: ['demo-tlv', 'demo-haifa', 'tlv-real'],
    authorityIds: ['demo-tlv', 'demo-tlv-n1', 'demo-tlv-n2', 'demo-haifa', 'demo-haifa-n1', 'demo-haifa-n2', 'tlv-real'],
    groupIds: ['demo-grp-tlv-walk', 'demo-grp-tlv-run'],
  },
  'authorities/demo-tlv': { name: 'דמו · תל אביב', type: 'city', isDemo: true },
  'authorities/demo-tlv-n1': { name: 'דמו · הצפון הישן', type: 'neighborhood', parentAuthorityId: 'demo-tlv', isDemo: true },
  'authorities/demo-tlv-n2': { name: 'דמו · פלורנטין', type: 'neighborhood', parentAuthorityId: 'demo-tlv', isDemo: true },
  'authorities/demo-haifa': { name: 'דמו · חיפה', type: 'city', isDemo: true },
  'authorities/demo-haifa-n1': { name: 'דמו · כרמל', type: 'neighborhood', parentAuthorityId: 'demo-haifa', isDemo: true },
  'authorities/demo-haifa-n2': { name: 'דמו · נווה שאנן', type: 'neighborhood', parentAuthorityId: 'demo-haifa', isDemo: true },
  // A registry typo pointing at a real city must never become anyone's demo home.
  'authorities/tlv-real': { name: 'תל אביב-יפו', type: 'city' },
};

beforeEach(() => __resetDemoWorldCachesForTests());

describe('resolveDemoViewerWorld', () => {
  it('a real user gets null and costs only the shared viewers read', async () => {
    const { db, reads } = makeFakeAdminDb(WORLD);
    await expect(resolveDemoViewerWorld(db, 'realUser')).resolves.toBeNull();
    expect(reads).toEqual(['demo_registry/viewers']);
  });

  it('demo users / AI testers (demo_ uids) and signed-out callers get null with no read', async () => {
    const { db, reads } = makeFakeAdminDb(WORLD);
    await expect(resolveDemoViewerWorld(db, 'demo_tlv01')).resolves.toBeNull();
    await expect(resolveDemoViewerWorld(db, null)).resolves.toBeNull();
    expect(reads).toEqual([]);
  });

  it('a viewer lives in the first demo city and its first neighbourhood by default; real ids never appear', async () => {
    const { db } = makeFakeAdminDb(WORLD);
    const w = await resolveDemoViewerWorld(db, 'viewerA');
    expect(w?.home).toEqual({ cityId: 'demo-tlv', cityName: 'דמו · תל אביב', neighborhoodId: 'demo-tlv-n1', neighborhoodName: 'דמו · הצפון הישן' });
    expect(w?.cities.map((c) => c.id)).toEqual(['demo-tlv', 'demo-haifa']);
    expect(w?.groupIds).toEqual(['demo-grp-tlv-walk', 'demo-grp-tlv-run']);
  });

  it('demo_registry/viewers.homes picks another demo home', async () => {
    const { db } = makeFakeAdminDb(WORLD);
    expect((await resolveDemoViewerWorld(db, 'viewerB'))?.home).toMatchObject({ cityId: 'demo-haifa', neighborhoodId: 'demo-haifa-n2' });
  });

  it('fails closed: no tenants registry ⇒ null (the viewer sees the real app)', async () => {
    const { db } = makeFakeAdminDb({ 'demo_registry/viewers': { uids: ['viewerA'] } });
    await expect(resolveDemoViewerWorld(db, 'viewerA')).resolves.toBeNull();
  });

  it('the world is cached per instance (one registry read for many calls)', async () => {
    const { db, reads } = makeFakeAdminDb(WORLD);
    await resolveDemoViewerWorld(db, 'viewerA');
    await resolveDemoViewerWorld(db, 'viewerB');
    expect(reads.filter((r) => r === 'demo_registry/tenants')).toHaveLength(1);
  });
});

describe('demo presence for the viewer', () => {
  const now = Date.parse('2026-10-21T08:00:00Z');
  const fresh = { toMillis: () => now - 60_000 };
  const presence = {
    'presence/demo_tlv01': { uid: 'demo_tlv01', name: 'נועה ל.', mode: 'group', isDemo: true, lat: 32.09, lng: 34.78, audienceGroupIds: ['demo-grp-tlv-walk'], gender: 'female', activity: { status: 'walking', workoutTitle: 'הליכה' }, updatedAt: fresh },
    'presence/demo_tlv02': { uid: 'demo_tlv02', mode: 'group', isDemo: true, lat: 32.1, lng: 34.8, audienceGroupIds: ['demo-grp-tlv-run'], updatedAt: { toMillis: () => now - DEMO_PRESENCE_STALE_MS - 1 } },
    // a real user's group presence in a (hypothetically) shared group never leaves the server
    'presence/realU': { uid: 'realU', mode: 'group', lat: 32.1, lng: 34.8, audienceGroupIds: ['demo-grp-tlv-walk'], updatedAt: fresh },
  };

  it('a viewer gets the fresh demo markers only', async () => {
    const { db } = makeFakeAdminDb({ ...WORLD, ...presence });
    const markers = await getDemoPresenceForViewer(db, 'viewerA', now);
    expect(markers.map((m) => m.uid)).toEqual(['demo_tlv01']);
    expect(markers[0]).toMatchObject({ name: 'נועה ל.', gender: 'female', activity: { status: 'walking' } });
  });

  it('a real user gets [] without any presence read', async () => {
    const { db, reads } = makeFakeAdminDb({ ...WORLD, ...presence });
    await expect(getDemoPresenceForViewer(db, 'realUser', now)).resolves.toEqual([]);
    expect(reads.some((r) => r.startsWith('presence'))).toBe(false);
  });

  it('toDemoPresenceMarker rejects non-demo / malformed docs', () => {
    expect(toDemoPresenceMarker('realU', { isDemo: true, lat: 1, lng: 1, updatedAt: fresh }, now)).toBeNull();
    expect(toDemoPresenceMarker('demo_x', { isDemo: true, lat: null, lng: 1, updatedAt: fresh } as any, now)).toBeNull();
    expect(toDemoPresenceMarker('demo_x', { lat: 1, lng: 1, updatedAt: fresh }, now)).toBeNull();
  });
});
