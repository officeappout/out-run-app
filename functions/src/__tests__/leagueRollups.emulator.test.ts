/**
 * leagueStepsRollup + dailyActivityPublicSync handlers — REAL emulator suite
 * (port 8089) for the 19.10.2026 scale pass: both page through the day's
 * dailyActivity docs (page size 2 here, so every case crosses pages), and
 * both skip work for days that haven't changed since the last run.
 *
 * Only firebase-admin's app/messaging/auth plumbing is faked; Firestore is
 * the real emulator. Run alone:
 *   bash scripts/ci/run-emulator-suites.sh --only 8089 functions/src/__tests__/leagueRollups.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.LEAGUE_STEPS_PAGE_SIZE = '2';
  process.env.DAILY_PUBLIC_SYNC_PAGE_SIZE = '2';
});

const PROJECT_ID = 'appout-1-league-rollups-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

let testApp: App;
let testDb: Firestore;
const realUids = new Set<string>();
// Both handlers call admin.firestore() at import time, before testDb exists —
// so the mock hands out a proxy that resolves the real db on each use.
const holder = vi.hoisted(() => ({ db: null as unknown as Record<string | symbol, unknown> }));

vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(
    () =>
      new Proxy({}, {
        get: (_t, k) => {
          const v = holder.db[k];
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(holder.db) : v;
        },
      }),
    { FieldValue, Timestamp },
  ),
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    getUsers: async (ids: Array<{ uid: string }>) => ({
      users: ids.map(({ uid }) => ({ uid, providerData: realUids.has(uid) ? [{ providerId: 'google.com' }] : [] })),
    }),
  }),
}));
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => unknown) => handler,
}));

import { leagueStepsRollup } from '../leagueStepsRollup';
import { dailyActivityPublicSync } from '../dailyActivityPublicSync';

async function clearEmulator() {
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
}

// Friday 2026-10-16, 12:00 Israel (UTC+3) → W2026-10-11; "yesterday" = 2026-10-15.
const DAY = '2026-10-16';
const hood = 'league_scope_stats/weekly_W2026-10-11_neighborhood_n1';
const UIDS = ['u1', 'u2', 'u3', 'u4', 'u5'];

async function seedUsers() {
  for (const uid of UIDS) {
    await testDb.doc(`users/${uid}`).set({ core: { authorityId: 'tlv', neighborhoodId: 'n1', gender: 'male' }, social: { groupIds: [] } });
  }
}
async function seedDay(uid: string, steps: number, extra: Record<string, unknown> = {}) {
  await testDb.doc(`dailyActivity/${uid}_${DAY}`).set({ userId: uid, date: DAY, steps, ...extra }, { merge: true });
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  testApp = initializeApp({ projectId: PROJECT_ID }, `league-rollups-${Date.now()}`);
  testDb = getFirestore(testApp);
  holder.db = testDb as unknown as Record<string | symbol, unknown>;
  await clearEmulator();
});
afterAll(async () => {
  await clearEmulator().catch(() => {});
  await deleteApp(testApp);
});
beforeEach(async () => {
  await clearEmulator();
  realUids.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 16, 9, 0, 0)));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('leagueStepsRollup', () => {
  it('pages through every user-day (5 docs, page size 2) and applies each once', async () => {
    await seedUsers();
    for (const uid of UIDS) await seedDay(uid, 5200); // 15 points each
    await (leagueStepsRollup as any)();
    const d = (await testDb.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(75);
    expect(d.activeMemberCount).toBe(5);
  });

  it('an unchanged day is skipped (no transaction); a grown day adds only its delta', async () => {
    await seedUsers();
    await seedDay('u1', 5200);
    await seedDay('u2', 3100);
    await (leagueStepsRollup as any)();
    const marker1 = (await testDb.doc(`league_steps_applied/u1_${DAY}`).get()).data()!;

    await seedDay('u2', 6100); // +3 full 1,000s → +9
    await (leagueStepsRollup as any)();

    // u1 untouched: the marker was not rewritten at all.
    const marker1b = (await testDb.doc(`league_steps_applied/u1_${DAY}`).get()).data()!;
    expect((marker1b.updatedAt as Timestamp).isEqual(marker1.updatedAt as Timestamp)).toBe(true);
    const d = (await testDb.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(15 + 18); // u1 15; u2 9, then +9 (only the delta)
    expect(d.activeMemberCount).toBe(2);
  });

  it('re-running with nothing new changes nothing', async () => {
    await seedUsers();
    await seedDay('u1', 8000);
    await (leagueStepsRollup as any)();
    const before = (await testDb.doc(hood).get()).data()!;
    await (leagueStepsRollup as any)();
    const after = (await testDb.doc(hood).get()).data()!;
    expect(after.totalCredit).toBe(before.totalCredit);
    expect((after.updatedAt as Timestamp).isEqual(before.updatedAt as Timestamp)).toBe(true);
  });
});

describe('dailyActivityPublicSync', () => {
  it('mirrors every real account across pages; guests and unstamped docs never appear', async () => {
    for (const uid of ['u1', 'u2', 'u3', 'u4']) realUids.add(uid);
    for (const uid of UIDS) await seedDay(uid, 4000, { authorityId: 'tlv', displayName: `name-${uid}` });
    await testDb.doc(`dailyActivity/u6_${DAY}`).set({ userId: 'u6', date: DAY, steps: 10 }); // no authorityId
    realUids.add('u6');
    await testDb.doc('userAge/u1').set({ ageGroup: 'adult' });

    await (dailyActivityPublicSync as any)();

    const snap = await testDb.collection('dailyActivityPublic').get();
    expect(snap.docs.map((d) => d.id).sort()).toEqual(['u1', 'u2', 'u3', 'u4'].map((u) => `${u}_${DAY}`));
    const u1 = (await testDb.doc(`dailyActivityPublic/u1_${DAY}`).get()).data()!;
    expect(u1).toMatchObject({ uid: 'u1', steps: 4000, authorityId: 'tlv', ageGroup: 'adult', displayName: 'name-u1' });
    expect((await testDb.doc(`dailyActivityPublic/u2_${DAY}`).get()).data()!.ageGroup).toBe('minor'); // no userAge → fail closed
  });

  it('an unchanged mirror is not rewritten; changed steps or age are', async () => {
    realUids.add('u1');
    realUids.add('u2');
    await seedDay('u1', 4000, { authorityId: 'tlv' });
    await seedDay('u2', 4000, { authorityId: 'tlv' });
    await (dailyActivityPublicSync as any)();
    const u1a = (await testDb.doc(`dailyActivityPublic/u1_${DAY}`).get()).data()!;
    const u2a = (await testDb.doc(`dailyActivityPublic/u2_${DAY}`).get()).data()!;

    await new Promise((r) => setTimeout(r, 5)); // distinct server timestamps
    await seedDay('u2', 4500, { authorityId: 'tlv' });
    await (dailyActivityPublicSync as any)();
    const u1b = (await testDb.doc(`dailyActivityPublic/u1_${DAY}`).get()).data()!;
    const u2b = (await testDb.doc(`dailyActivityPublic/u2_${DAY}`).get()).data()!;
    expect((u1b.updatedAt as Timestamp).isEqual(u1a.updatedAt as Timestamp)).toBe(true);
    expect(u2b.steps).toBe(4500);
    expect((u2b.updatedAt as Timestamp).isEqual(u2a.updatedAt as Timestamp)).toBe(false);

    await testDb.doc('userAge/u1').set({ ageGroup: 'adult' });
    await (dailyActivityPublicSync as any)();
    expect((await testDb.doc(`dailyActivityPublic/u1_${DAY}`).get()).data()!.ageGroup).toBe('adult');
  });
});
