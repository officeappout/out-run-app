/**
 * onGroupMemberWrite — REAL emulator suite (port 8089): memberCount comes
 * from an aggregation count() (19.10.2026, was a full members read) and must
 * equal the number of member docs; activation at minimumMembers unchanged.
 *   bash scripts/ci/run-emulator-suites.sh --only 8089 functions/src/__tests__/onGroupMemberWrite.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'appout-1-group-member-count-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';
let testApp: App;
let testDb: Firestore;
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
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentWritten: (_p: string, h: unknown) => h }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, h: unknown) => h }));

import { onGroupMemberWrite } from '../onGroupMemberWrite';

async function clearEmulator() {
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
}
const run = (groupId: string) => (onGroupMemberWrite as any)({ params: { groupId, uid: 'x' } });

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  testApp = initializeApp({ projectId: PROJECT_ID }, `group-member-count-${Date.now()}`);
  testDb = getFirestore(testApp);
  holder.db = testDb as unknown as Record<string | symbol, unknown>;
  await clearEmulator();
});
afterAll(async () => {
  await clearEmulator().catch(() => {});
  await deleteApp(testApp);
});
beforeEach(clearEmulator);

describe('onGroupMemberWrite', () => {
  it('memberCount / currentParticipants = the number of member docs; activates at the minimum', async () => {
    await testDb.doc('community_groups/g1').set({ isActive: false, minimumMembers: 3, memberCount: 0 });
    for (const uid of ['a', 'b']) await testDb.doc(`community_groups/g1/members/${uid}`).set({ uid });
    await run('g1');
    let g = (await testDb.doc('community_groups/g1').get()).data()!;
    expect(g.memberCount).toBe(2);
    expect(g.currentParticipants).toBe(2);
    expect(g.isActive).toBe(false);

    await testDb.doc('community_groups/g1/members/c').set({ uid: 'c' });
    await run('g1');
    g = (await testDb.doc('community_groups/g1').get()).data()!;
    expect(g.memberCount).toBe(3);
    expect(g.isActive).toBe(true);

    await testDb.doc('community_groups/g1/members/a').delete();
    await run('g1');
    g = (await testDb.doc('community_groups/g1').get()).data()!;
    expect(g.memberCount).toBe(2);
    expect(g.isActive).toBe(true); // never de-activated (unchanged behaviour)
  });

  it('a deleted group is left alone', async () => {
    await testDb.doc('community_groups/gone/members/a').set({ uid: 'a' });
    await run('gone');
    expect((await testDb.doc('community_groups/gone').get()).exists).toBe(false);
  });
});
