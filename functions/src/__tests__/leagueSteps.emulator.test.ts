/**
 * applyStepsToLeagueStats — REAL emulator suite (port 8089). 3 points per
 * 1,000 steps, applied by delta (re-runs add only what's new, never subtract),
 * counted as the 'steps' bucket and an active member.
 *
 * Run alone: bash scripts/ci/run-emulator-suites.sh --only 8089 functions/src/__tests__/leagueSteps.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { applyStepsToLeagueStats, applyWorkoutToLeagueStats } from '../lib/apply-league-stats';
import { stepsCreditOf } from '../lib/league-scope-stats';

const PROJECT_ID = 'appout-1-league-steps-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';
let app: App;
let db: Firestore;
const ts = () => FieldValue.serverTimestamp();
async function clearEmulator() {
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
}
// 2026-10-16 (Friday) → W2026-10-11, M2026-10
const hood = 'league_scope_stats/weekly_W2026-10-11_neighborhood_n1';

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `league-steps-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
});
afterAll(async () => {
  await clearEmulator().catch(() => {});
  await deleteApp(app);
});
beforeEach(async () => {
  await clearEmulator();
  await db.doc('users/u1').set({ core: { authorityId: 'tlv', neighborhoodId: 'n1', gender: 'male' }, social: { groupIds: [] } });
});

describe('stepsCreditOf', () => {
  it('3 per full 1,000', () => {
    expect(stepsCreditOf(999)).toBe(0);
    expect(stepsCreditOf(1000)).toBe(3);
    expect(stepsCreditOf(8450)).toBe(24);
    expect(stepsCreditOf('x')).toBe(0);
  });
});

describe('applyStepsToLeagueStats', () => {
  it('adds the day as the steps bucket and an active member', async () => {
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5200)).toBe('applied');
    const d = (await db.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(15);
    expect(d.activeMemberCount).toBe(1);
    expect(d.byActivity.steps).toEqual({ credit: 15, members: 1 });
  });

  it('later runs add only the delta, never subtract, member counted once', async () => {
    await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5200);
    // Same points (5 × 3); only the estimated km grew → km-only update.
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5900)).toBe('applied');
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5900)).toBe('no-change');
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 9100)).toBe('applied');
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 4000)).toBe('no-change');
    const d = (await db.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(27);
    expect(d.activeMemberCount).toBe(1);
  });

  it('no scope / no user', async () => {
    await db.doc('users/u2').set({ core: {} });
    expect(await applyStepsToLeagueStats(db, ts, 'u2', '2026-10-16', 5000)).toBe('no-scope');
    expect(await applyStepsToLeagueStats(db, ts, 'nobody', '2026-10-16', 5000)).toBe('no-user');
  });
});

describe('applyStepsToLeagueStats — distance (km, never points)', () => {
  const hoodMonth = 'league_scope_stats/monthly_M2026-10_neighborhood_n1';
  const city = 'league_scope_stats/weekly_W2026-10-11_city_tlv';

  it('adds the synced distance to the scope and the member, points unchanged', async () => {
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5200, 4100)).toBe('applied');
    for (const path of [hood, hoodMonth, city]) {
      const d = (await db.doc(path).get()).data()!;
      expect(d.totalCredit).toBe(15);
      expect(d.distanceMeters).toBe(4100);
      expect((await db.doc(`${path}/members/u1`).get()).data()!.distanceMeters).toBe(4100);
    }
  });

  it('no synced distance → the steps estimate (1,300 steps per km)', async () => {
    await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 6500);
    expect((await db.doc(hood).get()).data()!.distanceMeters).toBe(5000);
  });

  it('distance grows by delta, independent of the points', async () => {
    await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5200, 4100);
    // Same points bucket (5 × 3), more km → km-only update.
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5900, 4800)).toBe('applied');
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5900, 4800)).toBe('no-change');
    // Smaller distance never subtracts.
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 5900, 3000)).toBe('no-change');
    const d = (await db.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(15);
    expect(d.activeMemberCount).toBe(1);
    expect(d.byActivity.steps).toEqual({ credit: 15, members: 1 });
    expect(d.distanceMeters).toBe(4800);
    const marker = (await db.doc('league_steps_applied/u1_2026-10-16').get()).data()!;
    expect(marker).toMatchObject({ credit: 15, distanceMeters: 4800 });
  });

  it('under 1,000 steps: km only — no points, no active member', async () => {
    expect(await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 800, 650)).toBe('applied');
    const d = (await db.doc(hood).get()).data()!;
    expect(d.distanceMeters).toBe(650);
    expect(d.totalCredit ?? 0).toBe(0);
    expect(d.activeMemberCount ?? 0).toBe(0);
    expect(d.byActivity).toBeUndefined();
    const m = (await db.doc(`${hood}/members/u1`).get()).data()!;
    expect(m).toMatchObject({ credit: 0, activities: [], distanceMeters: 650 });
  });

  it('a km-only member still becomes active with their first points', async () => {
    await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 800, 650);
    await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 2100, 1700);
    const d = (await db.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(6);
    expect(d.activeMemberCount).toBe(1);
    expect(d.byGender.male).toEqual({ credit: 6, members: 1 });
    expect(d.distanceMeters).toBe(1700);
  });

  it('a workout never adds km, and keeps the km already there', async () => {
    await applyStepsToLeagueStats(db, ts, 'u1', '2026-10-16', 800, 650);
    const r = await applyWorkoutToLeagueStats(db, ts, 'w1', {
      userId: 'u1',
      category: 'cardio',
      duration: 30 * 60,
      date: { toDate: () => new Date('2026-10-16T09:00:00Z') },
    });
    expect(r).toBe('applied');
    const d = (await db.doc(hood).get()).data()!;
    expect(d.totalCredit).toBe(30);
    expect(d.activeMemberCount).toBe(1); // the km-only doc didn't block the count
    expect(d.distanceMeters).toBe(650);
    expect((await db.doc(`${hood}/members/u1`).get()).data()!.distanceMeters).toBe(650);
  });
});
