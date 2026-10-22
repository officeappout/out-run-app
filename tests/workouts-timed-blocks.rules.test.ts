/**
 * workouts/{id}.timedBlocks — enable_home_v2 (19.10.2026, owner-approved).
 * The optional, compact timed-block records ride in the SAME create as the
 * rest of the workout doc (no extra write, no new collection), and the
 * history summary reads them back. firestore.rules is NOT changed: the
 * workouts rule checks ownership only (no field whitelist) — this suite
 * proves the field is accepted and round-trips.
 *
 * Run: isolated emulator on 127.0.0.1:8089 — start with:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initTimed, reduceTimedAll } from '../src/features/workout-engine/engines/timed/timed-machine';
import { buildTimedResult } from '../src/features/workout-engine/engines/timed/timed-result';
import { parseTimedBlockRecords, toTimedBlockRecord } from '../src/features/workout-engine/engines/timed/timed-record';
import type { TimedBlockSpec } from '../src/features/workout-engine/engines/timed/timed.types';
import { workoutHistoryEntryToStrengthSummaryProps } from '../src/features/workout-engine/components/strength/strength-history-adapter';
import { amrapSummaryModel } from '../src/features/workout-engine/components/strength/utils/timed-summary.model';
import { makeT } from '../src/lib/i18n/t';
import { player } from '../src/messages/ns/player';

const PROJECT_ID = 'appout-1-audit-test';
let env: RulesTestEnvironment;

function amrapRecord() {
  const spec: TimedBlockSpec = {
    format: 'amrap',
    config: { capSec: 300, roundItems: [] },
    items: [
      { kind: 'exercise', key: 'a', exerciseId: 'a', name: 'a', targetReps: 12 },
      { kind: 'exercise', key: 'b', exerciseId: 'b', name: 'b', targetReps: 10 },
    ],
  };
  const T0 = 1_000_000;
  const s = reduceTimedAll(initTimed(spec), [
    { type: 'START', atMs: T0 },
    { type: 'ITEM_DONE', atMs: T0 + 60_000 },
    { type: 'ITEM_DONE', atMs: T0 + 130_000 },
    { type: 'TICK', atMs: T0 + 300_000 },
    { type: 'LOG_REPS', atMs: T0 + 301_000, reps: 5 },
  ]);
  return toTimedBlockRecord('seg-main', buildTimedResult(s));
}

/** The shape saveWorkout writes for a strength session (+ the new optional field). */
function workoutDoc(userId: string, extra: Record<string, unknown> = {}) {
  return {
    userId,
    activityType: 'strength',
    workoutType: 'strength',
    category: 'strength',
    displayIcon: 'dumbbell',
    distance: 0,
    duration: 600,
    calories: 0,
    pace: 0,
    earnedCoins: 0,
    routePath: [],
    segments: [{ index: 0, kind: 'strength', actual: { durationSec: 600, exercises: 2, sets: 2 } }],
    date: serverTimestamp(),
    ...extra,
  };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 },
  });
  await env.clearFirestore();
});

afterAll(async () => {
  if (env) await env.cleanup();
});

describe('workouts.timedBlocks (write + read back)', () => {
  it('[ALLOW] the owner creates a workout doc carrying timedBlocks in the same write', async () => {
    const db = env.authenticatedContext('user_a').firestore();
    await assertSucceeds(setDoc(doc(db, 'workouts', 'w1'), workoutDoc('user_a', { timedBlocks: [amrapRecord()] })));
  });

  it('[ALLOW] a doc without the field (flag off) is unchanged', async () => {
    const db = env.authenticatedContext('user_a').firestore();
    await assertSucceeds(setDoc(doc(db, 'workouts', 'w0'), workoutDoc('user_a')));
  });

  it('[READ] the owner reads it back; history adapter + summary card render it', async () => {
    const db = env.authenticatedContext('user_a').firestore();
    const snap = await assertSucceeds(getDoc(doc(db, 'workouts', 'w1')));
    const data = snap.data() as Record<string, unknown>;
    const records = parseTimedBlockRecords(data.timedBlocks);
    expect(records).toEqual([amrapRecord()]);
    const props = workoutHistoryEntryToStrengthSummaryProps({ ...(data as object), id: 'w1' } as never);
    expect(props.savedTimedBlocks).toEqual(records);
    expect(amrapSummaryModel(makeT('he', player), records[0])?.extraLine).toBe('ועוד 5 חזרות בסבב השני');
  });

  it('[DENY] another user cannot read it, nor write timedBlocks on a doc they do not own', async () => {
    const other = env.authenticatedContext('user_b').firestore();
    await assertFails(getDoc(doc(other, 'workouts', 'w1')));
    await assertFails(setDoc(doc(other, 'workouts', 'w2'), workoutDoc('user_a', { timedBlocks: [amrapRecord()] })));
  });
});
