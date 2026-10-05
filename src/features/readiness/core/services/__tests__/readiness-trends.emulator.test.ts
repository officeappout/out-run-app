/**
 * computeReadinessTrends — REAL Firestore-emulator integration suite
 * (05.10.2026, §13.90). §31 discipline: every assertion exercises the
 * real Admin SDK read path against real documents.
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080. Run ONLY this file, never together
 * with another *.emulator.test.ts in the same vitest invocation (they
 * share one emulator database and each wipes it all).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { computeReadinessTrends } from '../readiness-trends.service';
import type { UnitPermissionScope } from '@/lib/unitPermissionScope';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';
const TENANT_ID = 'emu-trends-tenant';
const UNIT_ID = 'emu-trends-unit';

const PULL_PROGRAM_ID = 'program-pull';
const PUSH_PROGRAM_ID = 'program-push';
const FULL_PULLUP = 'ex-full-pullup'; // pull, level 11
const FULL_DIP = 'ex-full-dip'; // push, level 10
const BAND_PULLUP_L9 = 'ex-band-pullup-l9'; // pull, level 9
const TIME_PULLUP_L11 = 'ex-time-pullup-l11'; // pull, level 11, type 'time' — the "third state" exercise

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

const TENANT_OWNER_SCOPE: UnitPermissionScope = { kind: 'tenantOwner', tenantId: TENANT_ID };

async function seedThresholdsProgramsExercises(): Promise<void> {
  const batch = db.batch();
  batch.set(db.collection('readiness_thresholds').doc('global'), {
    id: 'global', version: 1, updatedBy: 'test', updatedAt: new Date(),
    tests: [
      { id: 'run_3000m', label: 'ריצת 3,000 מ', metric: 'time', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 } },
      { id: 'pullups', label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 1 } },
      { id: 'dips', label: 'מקבילים', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 10, female: 3 } },
    ],
  });
  batch.set(db.collection('programs').doc(PULL_PROGRAM_ID), { slug: 'pull', name: 'משיכה' });
  batch.set(db.collection('programs').doc(PUSH_PROGRAM_ID), { slug: 'push', name: 'דחיפה' });
  batch.set(db.collection('exercises').doc(FULL_PULLUP), { type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 11 }] });
  batch.set(db.collection('exercises').doc(FULL_DIP), { type: 'reps', targetPrograms: [{ programId: PUSH_PROGRAM_ID, level: 10 }] });
  batch.set(db.collection('exercises').doc(BAND_PULLUP_L9), { type: 'reps', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 9 }] });
  batch.set(db.collection('exercises').doc(TIME_PULLUP_L11), { type: 'time', targetPrograms: [{ programId: PULL_PROGRAM_ID, level: 11 }] });
  await batch.commit();
}

async function createSoldier(id: string, name: string, gender: 'male' | 'female', uid: string | null): Promise<void> {
  await db.collection('readiness_soldiers').doc(id).set({
    tenantId: TENANT_ID, unitId: UNIT_ID, name, gender, uid, linkedAt: null, mergedInto: null,
    createdBy: 'test', createdAt: new Date(), updatedAt: new Date(),
  });
}

async function addResult(
  id: string, soldierId: string, testId: string, outcome: 'pass' | 'fail', value: number,
  testDate: Date, uid: string | null = null, extra: Record<string, unknown> = {},
): Promise<void> {
  await db.collection('readiness_results').doc(id).set({
    soldierId, tenantId: TENANT_ID, unitId: UNIT_ID, testId, outcome, value,
    notPerformedReason: null, source: 'organized_test',
    thresholdSnapshot: { thresholdVersion: 1, gender: 'male', thresholdValue: 1, lowerIsBetter: false, validityDays: 365 },
    recordedBy: 'test-officer', recordedAt: testDate, testDate, uid,
    ...extra,
  });
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function seedStrengthWorkout(id: string, userId: string, date: Date, exerciseId: string, confirmedReps: number[]): Promise<void> {
  await db.collection('workouts').doc(id).set({
    userId, date: Timestamp.fromDate(date), workoutType: 'strength',
    segments: [{ index: 0, kind: 'strength', actual: { exerciseLog: [{ exerciseId, confirmedReps }] } }],
  });
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `trends-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
  await seedThresholdsProgramsExercises();
}, 20000);

beforeEach(async () => {
  await clearEmulator();
  await seedThresholdsProgramsExercises();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeReadinessTrends — the green line', () => {
  it('two test dates → two discrete step points, each with its own correct value (not interpolated)', async () => {
    await createSoldier('s1', 'חייל א', 'male', null);
    await addResult('r1', 's1', 'run_3000m', 'fail', 1300, new Date('2026-01-01'));
    await addResult('r2', 's1', 'run_3000m', 'pass', 1000, new Date('2026-04-01'));

    // componentFilter: 'run' — this soldier only has a run_3000m result; the
    // default "all" filter would correctly read as not_yet_tested (pullups/
    // dips were never measured), which isn't what THIS test is checking.
    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'run' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.green.length).toBe(2);
    expect(result.body.green[0].passPercent).toBe(0); // as of Jan 1 — failing
    expect(result.body.green[1].passPercent).toBe(100); // as of Apr 1 — passing
  });

  it('a 3-month gap between two test dates produces no fabricated intermediate point — green is held, not sampled monthly', async () => {
    await createSoldier('s1', 'חייל ב', 'male', null);
    await addResult('r1', 's1', 'run_3000m', 'pass', 1000, new Date('2026-01-01'));
    await addResult('r2', 's1', 'run_3000m', 'pass', 1000, new Date('2026-04-01'));

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.green.length).toBe(2); // not 4 — no entries for Feb/Mar
  });

  it('a superseded result contributes NO separate point and does not shift the average — only the correction counts', async () => {
    await createSoldier('s1', 'חייל ג', 'male', null);
    const testDate = new Date('2026-02-01');
    await addResult('r1-old', 's1', 'pullups', 'fail', 2, testDate); // typo, corrected
    await addResult('r1-new', 's1', 'pullups', 'pass', 8, testDate, null, { correctsResultId: 'r1-old' });
    await db.collection('readiness_results').doc('r1-old').update({ supersededByResultId: 'r1-new', supersededAt: new Date(), supersededByUid: 'test-officer' });

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const pullupsAvg = result.body.componentAverages.pullups;
    expect(pullupsAvg.length).toBe(1);
    expect(pullupsAvg[0].average).toBe(8); // not 2, not (2+8)/2=5 — only the correction
    expect(pullupsAvg[0].testedCount).toBe(1);
  });

  it('a single test date → one point (no line to draw)', async () => {
    await createSoldier('s1', 'חייל ד', 'male', null);
    await addResult('r1', 's1', 'run_3000m', 'pass', 1000, new Date('2026-03-01'));

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, {});
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.green.length).toBe(1);
  });
});

describe('computeReadinessTrends — the blue line and the third ("could lie") state', () => {
  it('level demonstrated but no rep count (a time-held exercise) → excluded from BOTH numerator and denominator', async () => {
    await createSoldier('s1', 'חייל ה', 'male', 'uid-1');
    await seedStrengthWorkout('w1', 'uid-1', daysAgo(1), TIME_PULLUP_L11, [45]);
    await seedStrengthWorkout('w2', 'uid-1', daysAgo(2), TIME_PULLUP_L11, [50]);

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'strength' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const latest = result.body.blue[result.body.blue.length - 1];
    expect(latest.determinableCount).toBe(0); // level=11 (qualifies) but reps=null — not determinable, not a pass
  });

  it('a linked soldier who trained and did NOT meet the threshold → a real 0, counted inside the denominator', async () => {
    await createSoldier('s1', 'חייל ו', 'male', 'uid-2');
    // Demonstrated level 9 (band) — a real, confirmed level BELOW the 11 bar → a determined fail, not "not determinable."
    await seedStrengthWorkout('w1', 'uid-2', daysAgo(1), BAND_PULLUP_L9, [20]);
    await seedStrengthWorkout('w2', 'uid-2', daysAgo(2), BAND_PULLUP_L9, [18]);

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'strength' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const latest = result.body.blue[result.body.blue.length - 1];
    expect(latest.determinableCount).toBe(1);
    expect(latest.meetsCount).toBe(0);
  });

  it('25% determinable → no blue line point drawn (below the 30% floor)', async () => {
    await createSoldier('s1', 'ח1', 'male', 'uid-a');
    await createSoldier('s2', 'ח2', 'male', null);
    await createSoldier('s3', 'ח3', 'male', null);
    await createSoldier('s4', 'ח4', 'male', null);
    await seedStrengthWorkout('w1', 'uid-a', daysAgo(1), FULL_PULLUP, [3]);
    await seedStrengthWorkout('w2', 'uid-a', daysAgo(2), FULL_PULLUP, [4]);
    await seedStrengthWorkout('w3', 'uid-a', daysAgo(1), FULL_DIP, [11]);
    await seedStrengthWorkout('w4', 'uid-a', daysAgo(2), FULL_DIP, [12]);

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'strength' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const latest = result.body.blue[result.body.blue.length - 1];
    expect(latest.totalCount).toBe(4);
    expect(latest.determinableCount).toBe(1); // 25%
    expect(latest.meetsPercent).toBeNull();
  });

  it('35% determinable → a real blue line point, with the coverage declaration', async () => {
    const soldierIds = Array.from({ length: 20 }, (_, i) => `pop-s${i}`);
    for (const id of soldierIds) await createSoldier(id, `חייל ${id}`, 'male', null);
    // 7 of 20 (35%) linked + determinable.
    for (let i = 0; i < 7; i++) {
      const id = soldierIds[i];
      const uid = `uid-pop-${i}`;
      await db.collection('readiness_soldiers').doc(id).update({ uid });
      await seedStrengthWorkout(`w-${id}-1`, uid, daysAgo(1), FULL_PULLUP, [3]);
      await seedStrengthWorkout(`w-${id}-2`, uid, daysAgo(2), FULL_PULLUP, [4]);
      await seedStrengthWorkout(`w-${id}-3`, uid, daysAgo(1), FULL_DIP, [11]);
      await seedStrengthWorkout(`w-${id}-4`, uid, daysAgo(2), FULL_DIP, [12]);
    }

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'strength' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    const latest = result.body.blue[result.body.blue.length - 1];
    expect(latest.totalCount).toBe(20);
    expect(latest.determinableCount).toBe(7); // 35%
    expect(latest.meetsPercent).not.toBeNull();
    expect(result.body.latestCoverageNote).toContain('7');
  });
});

describe('computeReadinessTrends — filters', () => {
  it('componentFilter "strength" → both lines evaluate strength only, ignoring a failing run', async () => {
    await createSoldier('s1', 'חייל ז', 'male', 'uid-3');
    await addResult('r1', 's1', 'run_3000m', 'fail', 1500, new Date('2026-02-01')); // run fails officially
    await addResult('r2', 's1', 'pullups', 'pass', 8, new Date('2026-02-01'));
    await addResult('r3', 's1', 'dips', 'pass', 12, new Date('2026-02-01'));

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'strength' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    // Green, under "strength": pullups+dips both pass → 100%, the failing run must not drag it down.
    expect(result.body.green[0].passPercent).toBe(100);
  });

  it('componentFilter "run" → both lines evaluate run only, ignoring failing strength', async () => {
    await createSoldier('s1', 'חייל ח', 'male', null);
    await addResult('r1', 's1', 'run_3000m', 'pass', 1000, new Date('2026-02-01'));
    await addResult('r2', 's1', 'pullups', 'fail', 1, new Date('2026-02-01'));

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { componentFilter: 'run' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    expect(result.body.green[0].passPercent).toBe(100);
  });

  it('populationFilter "did_not_pass_previous_round" → only soldiers who failed the previous event are included', async () => {
    await createSoldier('pass-prev', 'עבר קודם', 'male', null);
    await createSoldier('fail-prev', 'לא עבר קודם', 'male', null);
    // Previous round (Jan): one passes, one fails.
    await addResult('r1', 'pass-prev', 'run_3000m', 'pass', 1000, new Date('2026-01-01'));
    await addResult('r2', 'fail-prev', 'run_3000m', 'fail', 1500, new Date('2026-01-01'));
    // Current round (Apr): both now pass.
    await addResult('r3', 'pass-prev', 'run_3000m', 'pass', 1000, new Date('2026-04-01'));
    await addResult('r4', 'fail-prev', 'run_3000m', 'pass', 1050, new Date('2026-04-01'));

    const result = await computeReadinessTrends(db, TENANT_OWNER_SCOPE, { populationFilter: 'did_not_pass_previous_round', componentFilter: 'run' });
    expect(result.status).toBe(200);
    if (result.status !== 200) return;
    // Only "fail-prev" is in scope for this filter — at the LATEST (Apr) event, that one soldier passes → 100%, tested=1.
    const latestGreen = result.body.green[result.body.green.length - 1];
    expect(latestGreen.testedCount).toBe(1);
    expect(latestGreen.passPercent).toBe(100);
  });
});
