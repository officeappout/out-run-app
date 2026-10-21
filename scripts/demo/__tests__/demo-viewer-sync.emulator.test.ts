/* eslint-disable @typescript-eslint/no-explicit-any -- route bodies */
/**
 * Demo world PR 5 on the Firestore EMULATOR (:8089): seed → add the viewer → the viewer
 * reads the demo world in the app, and the demo city's MUNICIPALITY PANEL numbers match
 * the same numbers computed straight from the seeded docs (the app's sources).
 * The written check lives in agent-briefs/demo-sync-check.md.
 *
 * Run alone: bash scripts/ci/run-emulator-suites.sh --only 8089 scripts/demo/__tests__/demo-viewer-sync.emulator.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';

const st = vi.hoisted(() => ({ db: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  // The bearer token IS the uid here.
  getAdminAuth: () => ({ verifyIdToken: async (t: string) => ({ uid: t }) }),
  getAdminDb: () => st.db,
}));

import { isDemoUid } from '@/lib/demo';
import { periodKeysFor } from '@/features/arena/services/league-scope-keys';
import { runSeed } from '../lib/seed-run';
import { addViewer } from '../lib/viewer';
import { resolveDemoViewerWorld } from '@/lib/demo-viewer-world.server';
import { computeCitySummary } from '@/app/api/authority-manager/city-summary/route';
import { GET as dashboardSummary } from '@/app/api/authority-manager/dashboard-summary/route';
import { GET as neighborhoodBreakdown } from '@/app/api/authority-manager/neighborhood-breakdown/route';
import { GET as scopeStats } from '@/app/api/leagues/scope-stats/route';
import { GET as individualBoard } from '@/app/api/leagues/individual-board/route';
import { GET as feed } from '@/app/api/feed/route';

const PROJECT_ID = 'appout-1-demo-viewer-sync-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';
const CITY = 'demo-tlv';
let app: App;
let db: Firestore;

const get = async (handler: (r: NextRequest) => Promise<Response>, path: string, uid: string) =>
  (await handler(new NextRequest(`http://localhost${path}`, { headers: { authorization: `Bearer ${uid}` } }))).json() as Promise<any>;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `demo-viewer-sync-${Date.now()}`);
  db = getFirestore(app);
  st.db = db;
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
  await db.doc('users/viewer1').set({ core: { name: 'צופה', isTestData: true }, social: { groupIds: [] } });
  await db.doc('users/realUser1').set({ core: { name: 'אמיתי', authorityId: 'sderot' } });
  await db.doc('connections/realUser1').set({ following: [], followers: [] });
  await runSeed(db, { now: new Date(), historyDays: 10, applyLeagues: true });
  await addViewer(db, 'viewer1', { groups: true, name: 'צופה' });
}, 300_000);

afterAll(async () => {
  await deleteApp(app);
});

/** The seeded residents of the demo city, straight from users/ (the app's own docs). */
async function residents() {
  const snap = await db.collection('users').where('core.authorityId', '==', CITY).get();
  return snap.docs.filter((d) => isDemoUid(d.id)).map((d) => ({ uid: d.id, hood: (d.data().core?.neighborhoodId as string | undefined) ?? null }));
}

async function workoutsOf(uids: string[], from?: Date, to?: Date) {
  const out: Array<{ userId: string; duration: number }> = [];
  for (let i = 0; i < uids.length; i += 30) {
    let q = db.collection('workouts').where('userId', 'in', uids.slice(i, i + 30));
    if (from && to) q = q.where('date', '>=', Timestamp.fromDate(from)).where('date', '<=', Timestamp.fromDate(to));
    (await q.get()).docs.forEach((d) => out.push({ userId: d.data().userId, duration: Number(d.data().duration) || 0 }));
  }
  return out;
}

describe('the viewer reads the demo world', () => {
  it('home city / neighbourhood are demo ids', async () => {
    const w = await resolveDemoViewerWorld(db, 'viewer1');
    expect(w?.home.cityId).toBe(CITY);
    expect(w?.home.neighborhoodId).toMatch(/^demo-tlv-n/);
    expect(await resolveDemoViewerWorld(db, 'realUser1')).toBeNull();
  });

  it('home feed: demo posts for the viewer, none for a real user', async () => {
    const mine = await get(feed, '/api/feed?max=30', 'viewer1');
    expect(mine.posts.length).toBeGreaterThan(0);
    expect(mine.posts.every((p: any) => isDemoUid(p.authorUid))).toBe(true);
    const real = await get(feed, '/api/feed?max=30', 'realUser1');
    expect(real.posts.some((p: any) => isDemoUid(p.authorUid))).toBe(false);
  });

  it('city board (demo cohort) for the viewer; empty for a real caller', async () => {
    const q = `/api/leagues/individual-board?mode=credit&scope=city&scopeId=${CITY}&window=monthly&max=50`;
    const mine = await get(individualBoard, q, 'viewer1');
    expect(mine.entries.length).toBeGreaterThan(0);
    expect(mine.entries.every((e: any) => isDemoUid(e.uid))).toBe(true);
    expect((await get(individualBoard, q, 'realUser1')).entries).toEqual([]);
  });

  it('neighbourhood league board of the demo city = league_scope_stats docs', async () => {
    const body = await get(scopeStats, `/api/leagues/scope-stats?board=neighborhood&parentId=${CITY}&window=monthly`, 'viewer1');
    const key = periodKeysFor(new Date()).monthly;
    const docs = (await db.collection('league_scope_stats').where('window', '==', 'monthly').where('periodKey', '==', key).where('granularity', '==', 'neighborhood').where('parentId', '==', CITY).get()).docs.map((d) => d.data());
    expect(body.entries.length).toBe(docs.length);
    for (const e of body.entries) {
      const d = docs.find((x) => x.scopeId === e.scopeId)!;
      expect(e.activeMemberCount).toBe(d.activeMemberCount);
    }
    expect((await get(scopeStats, `/api/leagues/scope-stats?board=neighborhood&parentId=${CITY}&window=monthly`, 'realUser1')).entries).toEqual([]);
  });
});

describe('municipality panel numbers = the app sources (demo city)', () => {
  it('residents: city-summary = dashboard-summary = authority.userCount = users/', async () => {
    const r = await residents();
    const summary = await computeCitySummary(db, 'viewer1', CITY);
    expect(summary.status).toBe(200);
    const body = (summary as any).body;
    expect(body.authorityId).toBe(CITY);
    expect(body.totalUsers).toBe(r.length);
    const dash = await get(dashboardSummary, `/api/authority-manager/dashboard-summary?authorityId=${CITY}`, 'viewer1');
    expect(dash.authorityId).toBe(CITY);
    expect(dash.genderDistribution.total).toBe(r.length);
    expect((await db.doc(`authorities/${CITY}`).get()).data()?.userCount).toBe(r.length);
  });

  it('the panel follows the city on screen for a manager of several demo authorities', async () => {
    for (const id of ['demo-b7', 'demo-haifa']) {
      const s = await computeCitySummary(db, 'viewer1', id);
      expect((s as any).body.authorityId).toBe(id);
    }
  });

  it('active this month (MAU) = distinct residents with a workout this month', async () => {
    const r = await residents();
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const w = await workoutsOf(r.map((x) => x.uid), from, to);
    const dash = await get(dashboardSummary, `/api/authority-manager/dashboard-summary?authorityId=${CITY}`, 'viewer1');
    expect(dash.mau).toBe(new Set(w.map((x) => x.userId)).size);
    expect(dash.mau).toBeGreaterThan(0);
  });

  it('neighbourhood table: residents / active / workouts / minutes = the seeded docs', async () => {
    const r = await residents();
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const rows = await get(neighborhoodBreakdown, `/api/authority-manager/neighborhood-breakdown?ageMin=18&ageMax=99&authorityId=${CITY}`, 'viewer1');
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      const uids = r.filter((x) => x.hood === row.neighborhoodId).map((x) => x.uid);
      const month = await workoutsOf(uids, from, to);
      const all = await workoutsOf(uids);
      expect(row.totalUsers, row.neighborhoodId).toBe(uids.length);
      expect(row.activeUsers, row.neighborhoodId).toBe(new Set(month.map((x) => x.userId)).size);
      expect(row.workouts, row.neighborhoodId).toBe(all.length);
      expect(row.totalActiveMinutes, row.neighborhoodId).toBe(Math.round(month.reduce((s, x) => s + x.duration / 60, 0)));
    }
    expect(rows.reduce((s: number, x: any) => s + x.totalUsers, 0)).toBe(r.filter((x) => x.hood).length);
  });
});
