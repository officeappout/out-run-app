import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Stage 1 — proves onPlannedActivityCreated's recipient-resolution gate,
 * per its own header comment (functions/src/onPlannedActivityCreated.ts):
 *   privacyMode === 'verified_global' → PARTNERS axis + RADIUS axis (both)
 *   privacyMode === 'squad'           → PARTNERS axis only
 *   privacyMode === 'ghost'           → no recipients at all
 *
 * Mocks geofire-common (geohashQueryBounds/distanceBetween) to neutralize
 * real geohash math — this test isolates the function's own branch logic
 * (does it even attempt the radius query for this privacyMode, does the
 * merge/dedupe produce the right recipient set), not geohash correctness,
 * which is the library's job.
 *
 * Mirrors push.service.daily-cap.test.ts's fake-Firestore style. sendPush,
 * content selection, and persona resolution are mocked directly — this
 * test is about WHO gets notified, not push delivery mechanics or copy.
 */

const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, any> | undefined>(),
  userLocations: [] as Array<{ id: string; data: Record<string, any> }>,
}));

function pathKey(collection: string, id: string): string {
  return `${collection}/${id}`;
}

function makeDocRef(collection: string, id: string) {
  const key = pathKey(collection, id);
  return {
    id,
    get: async () => {
      const data = state.store.get(key);
      return { exists: data !== undefined, data: () => data, id };
    },
  };
}

function makeFakeDb() {
  return {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
      // Only 'userLocations' issues a range query in the code under test
      // (geohashQueryBounds → orderBy('geohash').startAt().endAt()). Since
      // geohashQueryBounds/distanceBetween are mocked below to neutralize
      // real geo filtering, this fake just returns the full fixture set —
      // the mocked distanceBetween is what actually decides "in radius".
      orderBy: () => ({
        startAt: () => ({
          endAt: () => ({
            get: async () => ({
              docs:
                name === 'userLocations'
                  ? state.userLocations.map((u) => ({ id: u.id, data: () => u.data }))
                  : [],
            }),
          }),
        }),
      }),
    }),
    doc: (path: string) => {
      const [collection, id] = path.split('/');
      return makeDocRef(collection, id);
    },
  };
}

vi.mock('firebase-admin', () => ({
  apps: [] as any[],
  initializeApp: vi.fn(),
  firestore: () => makeFakeDb(),
}));

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// v2 Firestore triggers wrap a plain handler — for testing we want direct
// access to that handler, so onDocumentCreated just returns it unwrapped.
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: (event: unknown) => unknown) => handler,
}));

// Radius math is the library's job, not this test's — always report the
// synthetic "nearby" fixture as being at the exact center (distance 0).
vi.mock('geofire-common', () => ({
  geohashQueryBounds: () => [['0', '~']],
  distanceBetween: () => 0,
}));

const sendPushMock = vi.fn(async (_opts: unknown) => ({ delivered: 1 }));
vi.mock('../services/push.service', () => ({
  sendPush: (opts: unknown) => sendPushMock(opts),
}));

vi.mock('../services/notification-content.service', () => ({
  selectNotificationContent: vi.fn(async () => ({
    text: 'מישהו מתאמן לידך',
    bundleId: 'bundle-1',
    docId: 'doc-1',
    psychologicalTrigger: 'social_proof',
  })),
  personaliseNotificationText: (text: string) => text,
}));

vi.mock('../services/persona-alias-map.service', () => ({
  resolveCanonicalPersona: () => 'generic',
}));

import { onPlannedActivityCreated } from '../onPlannedActivityCreated';

function setDoc(collection: string, id: string, data: Record<string, any>) {
  state.store.set(pathKey(collection, id), data);
}

function makeEvent(sessionId: string, session: Record<string, any>) {
  return {
    params: { sessionId },
    data: { data: () => session },
  };
}

const BASE_SESSION = {
  userId: 'creator1',
  displayName: 'Creator',
  parkId: 'park1',
  activityType: 'workout',
  lat: 32.0,
  lng: 34.8,
};

describe('onPlannedActivityCreated — recipient gate by privacyMode', () => {
  beforeEach(() => {
    state.store.clear();
    state.userLocations = [];
    sendPushMock.mockClear();

    setDoc('app_config', 'feature_flags', { socialActivityNearbyPushEnabled: true });
    setDoc('connections', 'creator1', { followers: ['follower1'] });
    setDoc('users', 'follower1', { core: { name: 'Follower' } });
    setDoc('users', 'nearby1', { core: { name: 'Nearby' } });
    state.userLocations = [{ id: 'nearby1', data: { lat: 32.0001, lng: 34.8001 } }];
  });

  it('verified_global → both partner and radius recipients', async () => {
    await (onPlannedActivityCreated as any)(
      makeEvent('s1', { ...BASE_SESSION, privacyMode: 'verified_global' }),
    );

    const recipients = sendPushMock.mock.calls.map((c: any) => c[0].toUids[0]).sort();
    expect(recipients).toEqual(['follower1', 'nearby1']);
  });

  it('squad → partner-only recipients, radius axis skipped', async () => {
    await (onPlannedActivityCreated as any)(
      makeEvent('s2', { ...BASE_SESSION, privacyMode: 'squad' }),
    );

    const recipients = sendPushMock.mock.calls.map((c: any) => c[0].toUids[0]);
    expect(recipients).toEqual(['follower1']);
  });

  it('ghost → no recipients at all', async () => {
    await (onPlannedActivityCreated as any)(
      makeEvent('s3', { ...BASE_SESSION, privacyMode: 'ghost' }),
    );

    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
