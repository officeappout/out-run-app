/**
 * computeDemonstratedRunLevels — REAL Firestore-emulator integration
 * suite (05.10.2026, §13.89). §31 discipline: every assertion exercises
 * the real Admin SDK read path against real `workouts` documents,
 * never a fake in-memory shape.
 *
 * Requires `firebase emulators:start --only firestore` running
 * separately at 127.0.0.1:8080 — beforeAll throws immediately if it
 * isn't reachable, and vitest shows every case below as skipped (not
 * failed) when that happens. Per the project-wide memory on this: run
 * ONLY this file, never together with another *.emulator.test.ts in
 * the same vitest invocation (they share one emulator database and
 * each wipes it all).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from compute*() functions — db is always injected'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from compute*() functions'); },
}));

import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { computeDemonstratedRunLevels, RUN_LEVEL_WINDOW_DAYS } from '../readiness-run-level.service';

const PROJECT_ID = 'appout-1-emulator-test';
const FIRESTORE_HOST = '127.0.0.1:8080';

let app: App;
let db: Firestore;

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to clear emulator (status ${res.status}) — is it actually running at ${FIRESTORE_HOST}?`);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

interface AerobicActual {
  distanceKm?: number;
  durationSec?: number;
}

/** A pure-running workout, matching useRunningPlayer.ts's own save shape: segments: [aerobicSegment]. */
async function seedRunningWorkout(id: string, userId: string, date: Date, actual: AerobicActual): Promise<void> {
  await db.collection('workouts').doc(id).set({
    userId,
    date: Timestamp.fromDate(date),
    workoutType: 'running',
    segments: [{ index: 0, kind: 'aerobic', aerobicType: 'running', actual }],
  });
}

/** A hybrid workout — aerobic run at a NON-zero index, same "legA/station/legB" shape as the strength module's own test. */
async function seedHybridWorkoutWithRun(id: string, userId: string, date: Date, runActual: AerobicActual): Promise<void> {
  await db.collection('workouts').doc(id).set({
    userId,
    date: Timestamp.fromDate(date),
    workoutType: 'hybrid',
    segments: [
      { index: 0, kind: 'aerobic', aerobicType: 'running', actual: runActual },
      { index: 1, kind: 'strength', actual: { exerciseLog: [] } },
    ],
  });
}

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `run-level-emulator-test-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
}, 20000);

beforeEach(async () => {
  await clearEmulator();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('computeDemonstratedRunLevels', () => {
  it('an aerobic run embedded inside a HYBRID workout is counted (the same segments[] lesson as the strength module)', async () => {
    await seedHybridWorkoutWithRun('h1', 'uid-1', daysAgo(1), { distanceKm: 3.0, durationSec: 900 }); // 5:00/km
    await seedHybridWorkoutWithRun('h2', 'uid-1', daysAgo(2), { distanceKm: 3.0, durationSec: 930 });

    const result = await computeDemonstratedRunLevels(db, ['uid-1']);
    expect(result['uid-1'].normalizedTimeSeconds).not.toBeNull();
  });

  it('2.5km is NOT counted; 3.1km IS counted', async () => {
    await seedRunningWorkout('w1', 'uid-2', daysAgo(1), { distanceKm: 2.5, durationSec: 750 }); // out of range
    await seedRunningWorkout('w2', 'uid-2', daysAgo(2), { distanceKm: 3.1, durationSec: 930 });
    await seedRunningWorkout('w3', 'uid-2', daysAgo(3), { distanceKm: 3.1, durationSec: 940 });

    const result = await computeDemonstratedRunLevels(db, ['uid-2']);
    // Only the two 3.1km runs count (2 >= MIN_COUNTED_RUNS) — the 2.5km run contributes nothing.
    expect(result['uid-2'].normalizedTimeSeconds).not.toBeNull();
  });

  it('two counted runs → returns the FASTER (lower) normalized time', async () => {
    await seedRunningWorkout('w1', 'uid-3', daysAgo(1), { distanceKm: 3.0, durationSec: 1000 }); // slower: pace 333.3/km *3 = 1000s
    await seedRunningWorkout('w2', 'uid-3', daysAgo(2), { distanceKm: 3.0, durationSec: 900 }); // faster: pace 300/km *3 = 900s

    const result = await computeDemonstratedRunLevels(db, ['uid-3']);
    expect(result['uid-3'].normalizedTimeSeconds).toBe(900);
  });

  it('only ONE counted run → null (not enough evidence)', async () => {
    await seedRunningWorkout('w1', 'uid-4', daysAgo(1), { distanceKm: 3.0, durationSec: 900 });

    const result = await computeDemonstratedRunLevels(db, ['uid-4']);
    expect(result['uid-4'].normalizedTimeSeconds).toBeNull();
  });

  it('missing distanceKm → not determinable, never 0', async () => {
    await seedRunningWorkout('w1', 'uid-5', daysAgo(1), { durationSec: 900 }); // no distanceKm at all
    await seedRunningWorkout('w2', 'uid-5', daysAgo(2), { durationSec: 920 });

    const result = await computeDemonstratedRunLevels(db, ['uid-5']);
    expect(result['uid-5'].normalizedTimeSeconds).toBeNull();
    expect(result['uid-5'].normalizedTimeSeconds).not.toBe(0);
  });

  it('zero runs at all → null, and null is explicitly NOT 0', async () => {
    const result = await computeDemonstratedRunLevels(db, ['uid-6-no-runs']);
    expect(result['uid-6-no-runs'].normalizedTimeSeconds).toBeNull();
    expect(result['uid-6-no-runs'].normalizedTimeSeconds).not.toBe(0);
    expect(result['uid-6-no-runs'].excludedImpossiblePaceCount).toBe(0);
  });

  it('a 2:00/km pace is excluded as impossible, and the exclusion count reports 1', async () => {
    // 2:00/km = 120 sec/km, over 3km = 360 sec total — faster than the 150 sec/km (2:30/km) floor.
    await seedRunningWorkout('w1', 'uid-7', daysAgo(1), { distanceKm: 3.0, durationSec: 360 });
    // Two REAL runs so the uid would otherwise have enough evidence — the impossible one must not silently count toward it.
    await seedRunningWorkout('w2', 'uid-7', daysAgo(2), { distanceKm: 3.0, durationSec: 900 });
    await seedRunningWorkout('w3', 'uid-7', daysAgo(3), { distanceKm: 3.0, durationSec: 910 });

    const result = await computeDemonstratedRunLevels(db, ['uid-7']);
    expect(result['uid-7'].excludedImpossiblePaceCount).toBe(1);
    expect(result['uid-7'].normalizedTimeSeconds).toBe(900); // from the two real runs only
  });

  it(`a run on day ${RUN_LEVEL_WINDOW_DAYS + 1} is outside the window`, async () => {
    await seedRunningWorkout('w1', 'uid-8', daysAgo(RUN_LEVEL_WINDOW_DAYS + 1), { distanceKm: 3.0, durationSec: 900 });
    await seedRunningWorkout('w2', 'uid-8', daysAgo(RUN_LEVEL_WINDOW_DAYS + 1), { distanceKm: 3.0, durationSec: 910 });

    const result = await computeDemonstratedRunLevels(db, ['uid-8']);
    expect(result['uid-8'].normalizedTimeSeconds).toBeNull();
  });

  it('a walking aerobic segment is never counted as a run', async () => {
    await db.collection('workouts').doc('w1').set({
      userId: 'uid-9', date: Timestamp.fromDate(daysAgo(1)), workoutType: 'walking',
      segments: [{ index: 0, kind: 'aerobic', aerobicType: 'walking', actual: { distanceKm: 3.0, durationSec: 1800 } }],
    });
    await db.collection('workouts').doc('w2').set({
      userId: 'uid-9', date: Timestamp.fromDate(daysAgo(2)), workoutType: 'walking',
      segments: [{ index: 0, kind: 'aerobic', aerobicType: 'walking', actual: { distanceKm: 3.0, durationSec: 1850 } }],
    });

    const result = await computeDemonstratedRunLevels(db, ['uid-9']);
    expect(result['uid-9'].normalizedTimeSeconds).toBeNull();
  });

  it('every requested uid is present in the result, even with zero evidence', async () => {
    const result = await computeDemonstratedRunLevels(db, ['uid-a', 'uid-b', 'uid-c']);
    expect(Object.keys(result).sort()).toEqual(['uid-a', 'uid-b', 'uid-c']);
  });
});
