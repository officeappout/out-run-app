/**
 * applyWorkoutToLeagueStats — REAL emulator suite (port 8089, same group as
 * reminderSweepScheduler.emulator.test.ts). Proves on a real Firestore: sums,
 * distinct-member counting (per scope, per activity, per gender), the
 * neighborhood's parent city, and exactly-once on a retried workout.
 *
 * Run alone: bash scripts/ci/run-emulator-suites.sh --only 8089 functions/src/__tests__/leagueScopeStats.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { applyWorkoutToLeagueStats } from '../lib/apply-league-stats';

const PROJECT_ID = 'appout-1-league-stats-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';

let app: App;
let db: Firestore;

async function clearEmulator() {
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
}

const ts = () => FieldValue.serverTimestamp();
// Fri 16 Oct 2026, 10:00 Israel → weekly W2026-10-11, monthly M2026-10
const FRI = Timestamp.fromDate(new Date('2026-10-16T07:00:00Z'));
const week = (g: string, id: string) => `weekly_W2026-10-11_${g}_${id}`;

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `league-stats-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
});
afterAll(async () => {
  await clearEmulator().catch(() => {});
  await deleteApp(app);
});
beforeEach(async () => {
  await clearEmulator();
  await db.doc('users/u1').set({ core: { authorityId: 'tlv', neighborhoodId: 'n1', gender: 'female' }, social: { groupIds: ['g1'] } });
  await db.doc('users/u2').set({ core: { authorityId: 'tlv', neighborhoodId: 'n1', gender: 'male' }, social: { groupIds: [] } });
});

describe('applyWorkoutToLeagueStats', () => {
  it('sums points per scope and counts each member once', async () => {
    // u1: 30 min strength (60 pts) + 20 min cardio (20 pts); u2: 10 min strength (20 pts)
    await applyWorkoutToLeagueStats(db, ts, 'w1', { userId: 'u1', category: 'strength', duration: 1800, date: FRI });
    await applyWorkoutToLeagueStats(db, ts, 'w2', { userId: 'u1', category: 'cardio', duration: 1200, date: FRI });
    await applyWorkoutToLeagueStats(db, ts, 'w3', { userId: 'u2', category: 'strength', duration: 600, date: FRI });

    const hood = (await db.doc(`league_scope_stats/${week('neighborhood', 'n1')}`).get()).data()!;
    expect(hood.totalCredit).toBe(100);
    expect(hood.activeMemberCount).toBe(2);
    expect(hood.parentId).toBe('tlv');
    expect(hood.byActivity.strength).toEqual({ credit: 80, members: 2 });
    expect(hood.byActivity.cardio).toEqual({ credit: 20, members: 1 });
    expect(hood.byGender.female).toEqual({ credit: 80, members: 1 });
    expect(hood.byGender.male).toEqual({ credit: 20, members: 1 });

    const city = (await db.doc(`league_scope_stats/${week('city', 'tlv')}`).get()).data()!;
    expect(city.totalCredit).toBe(100);
    const group = (await db.doc(`league_scope_stats/${week('group', 'g1')}`).get()).data()!;
    expect(group.totalCredit).toBe(80);
    expect(group.activeMemberCount).toBe(1);
    const month = (await db.doc('league_scope_stats/monthly_M2026-10_neighborhood_n1').get()).data()!;
    expect(month.totalCredit).toBe(100);
  });

  it('a retried workout is counted exactly once', async () => {
    const w = { userId: 'u2', category: 'strength', duration: 600, date: FRI };
    expect(await applyWorkoutToLeagueStats(db, ts, 'w9', w)).toBe('applied');
    expect(await applyWorkoutToLeagueStats(db, ts, 'w9', w)).toBe('already');
    const hood = (await db.doc(`league_scope_stats/${week('neighborhood', 'n1')}`).get()).data()!;
    expect(hood.totalCredit).toBe(20);
  });

  it('skips a zero-length workout and a user with no scopes', async () => {
    await db.doc('users/u3').set({ core: {} });
    expect(await applyWorkoutToLeagueStats(db, ts, 'w4', { userId: 'u1', category: 'strength', duration: 10, date: FRI })).toBe('no-credit');
    expect(await applyWorkoutToLeagueStats(db, ts, 'w5', { userId: 'u3', category: 'strength', duration: 600, date: FRI })).toBe('no-scope');
  });
});
