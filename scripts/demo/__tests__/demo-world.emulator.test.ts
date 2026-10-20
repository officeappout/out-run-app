/**
 * Demo world end to end on the Firestore EMULATOR (:8089): seed → isolation (real-user
 * queries return no demo docs, real docs untouched) → add a viewer → purge → nothing left.
 *
 * Run alone: bash scripts/ci/run-emulator-suites.sh --only 8089 scripts/demo/__tests__/demo-world.emulator.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { isDemoTenantId, isDemoUid } from '@/lib/demo';
import { runSeed } from '../lib/seed-run';
import { executePurge, planPurge } from '../lib/purge-plan';
import { addViewer } from '../lib/viewer';

const PROJECT_ID = 'appout-1-demo-world-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';
const NOW = new Date();
let app: App;
let db: Firestore;

async function clearEmulator() {
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
}

/** Every doc path in the database (recursive). */
async function allPaths(): Promise<string[]> {
  const out: string[] = [];
  const walk = async (cols: FirebaseFirestore.CollectionReference[]) => {
    for (const col of cols) {
      for (const d of await col.listDocuments()) {
        if ((await d.get()).exists) out.push(d.path);
        await walk(await d.listCollections());
      }
    }
  };
  await walk(await db.listCollections());
  return out.sort();
}

const REAL = {
  'authorities/tlv-real': { name: 'תל אביב-יפו', type: 'city' },
  'parks/park-real-1': { name: 'פארק אמיתי', authorityId: 'tlv-real', published: true, location: { lat: 32.1, lng: 34.8 } },
  'users/realUser1': { core: { name: 'אמיתי', authorityId: 'tlv-real', tenantId: 'tlv-real' }, social: { groupIds: ['realGroup'] } },
  'community_groups/realGroup': { name: 'קבוצה אמיתית', isPublic: true, authorityId: 'tlv-real', createdBy: 'realUser1' },
  'users/viewer1': { core: { name: 'צופה', isTestData: true }, social: { groupIds: ['realGroup'] } },
  'connections/viewer1': { following: ['realUser1'], followers: [] },
};
const realSnapshot: Record<string, unknown> = {};

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `demo-world-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
  for (const [p, data] of Object.entries(REAL)) await db.doc(p).set(data);
}, 60_000);

afterAll(async () => {
  await clearEmulator().catch(() => {});
  await deleteApp(app);
});

describe('demo world on the emulator', () => {
  it('refuses to seed over a non-demo doc at a demo id (nothing written)', async () => {
    await db.doc('authorities/demo-tlv').set({ name: 'not mine' });
    await expect(runSeed(db, { now: NOW, historyDays: 3, applyLeagues: false })).rejects.toThrow(/authorities\/demo-tlv/);
    expect((await db.collection('users').get()).size).toBe(2);
    expect((await db.collection('demo_registry').get()).size).toBe(0);
    await db.doc('authorities/demo-tlv').delete();
  });

  it('seeds (twice — idempotent) with league participation inside demo scopes only', async () => {
    const first = await runSeed(db, { now: NOW, historyDays: 7, applyLeagues: true });
    expect(first.users).toBeGreaterThanOrEqual(30);
    expect(first.leagues?.workouts.applied).toBeGreaterThan(0);
    const n1 = (await allPaths()).length;
    const second = await runSeed(db, { now: NOW, historyDays: 7, applyLeagues: true });
    expect(second.leagues?.workouts.applied ?? 0).toBe(0); // exactly-once markers
    expect((await allPaths()).length).toBe(n1);
    for (const p of Object.keys(REAL)) realSnapshot[p] = (await db.doc(p).get()).data();
    expect((await db.doc('demo_registry/viewers').get()).data()?.uids).toEqual([]);
  }, 300_000);

  it('real-user queries return no demo docs', async () => {
    for (const ag of ['adult', 'minor']) {
      const posts = await db.collection('feed_posts').where('ageGroup', '==', ag).get();
      expect(posts.docs.filter((d) => isDemoUid(d.data().authorUid))).toHaveLength(0);
      const steps = await db.collection('dailyActivityPublic').where('ageGroup', '==', ag).get();
      expect(steps.docs.filter((d) => isDemoUid(d.data().uid))).toHaveLength(0);
    }
    expect((await db.collection('feed_posts').where('authorityId', '==', 'tlv-real').get()).size).toBe(0);
    expect((await db.collection('sessions').where('authorityId', '==', 'tlv-real').get()).size).toBe(0);
    expect((await db.collection('workouts').where('parkId', '==', 'park-real-1').get()).size).toBe(0);
    expect((await db.collection('users').where('core.authorityId', '==', 'tlv-real').get()).docs.map((d) => d.id)).toEqual(['realUser1']);
    const pub = await db.collection('community_groups').where('isPublic', '==', true).get();
    expect(pub.docs.map((d) => d.id)).toEqual(['realGroup']);
    expect((await db.collection('community_groups/realGroup/members').get()).size).toBe(0);
    const stats = await db.collection('league_scope_stats').get();
    expect(stats.size).toBeGreaterThan(0);
    stats.docs.forEach((d) => expect(isDemoTenantId(d.data().scopeId), d.id).toBe(true));
    expect((await db.collection('userPublic').get()).size).toBe(0);
    expect((await db.collection('presence').get()).size).toBe(0);
    // Check-ins reference the real park read-only; the park itself is untouched.
    const chk = await db.collection('sessions').where('parkId', '==', 'park-real-1').get();
    expect(chk.size).toBeGreaterThan(0);
    chk.docs.forEach((d) => expect(isDemoTenantId(d.data().authorityId)).toBe(true));
    expect((await db.doc('parks/park-real-1').get()).data()).toEqual(REAL['parks/park-real-1']);
  });

  it('a viewer can join, and purge removes only the demo traces from the viewer', async () => {
    const r = await addViewer(db, 'viewer1', { groups: true, name: 'צופה' });
    expect(r.groups.length).toBeGreaterThan(0);
    await db.doc('connections/viewer1').update({ following: ['realUser1', 'demo_tlv01'] });

    const dry = await planPurge(db);
    expect(dry.problems).toEqual([]);
    expect(dry.deletes.length).toBeGreaterThan(500);
    expect(dry.deletes.some((p) => Object.keys(REAL).includes(p))).toBe(false);
    expect(dry.deletes).toContain('community_groups/demo-grp-tlv-run/members/viewer1');

    await executePurge(db, dry);
    const left = (await allPaths()).filter((p) => !p.startsWith('audit_logs/'));
    expect(left.filter((p) => /demo[-_]/.test(p))).toEqual([]);
    expect(left).toEqual(Object.keys(REAL).concat('user_memberships/viewer1').sort());
    for (const p of Object.keys(REAL).filter((x) => !x.includes('viewer1'))) expect((await db.doc(p).get()).data()).toEqual(realSnapshot[p]);
    expect((await db.doc('users/viewer1').get()).data()?.social.groupIds).toEqual(['realGroup']);
    expect((await db.doc('connections/viewer1').get()).data()?.following).toEqual(['realUser1']);
    expect((await db.doc('user_memberships/viewer1').get()).data()?.groupIds).toEqual([]);
    expect((await planPurge(db)).deletes).toEqual([]);
  }, 300_000);

  it('purge stops when a real user is in a demo chat', async () => {
    await db.doc('demo_registry/personas').set({ uids: ['demo_x'] });
    await db.doc('users/demo_x').set({ core: { demo: { v: 1 } } });
    await db.doc('chats/demo_x_realUser1').set({ participants: ['demo_x', 'realUser1'], type: 'dm' });
    const plan = await planPurge(db);
    expect(plan.problems.join('\n')).toMatch(/chats\/demo_x_realUser1/);
    await expect(executePurge(db, plan)).rejects.toThrow();
    expect((await db.doc('users/demo_x').get()).exists).toBe(true);
  });
});
