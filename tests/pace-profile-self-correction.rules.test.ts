/**
 * Pace self-correction write path (18.10.2026) — a finished planned quality
 * run updates users/{uid}.running.paceProfile through
 * writeQualityRunToPaceProfile (one transaction, `running.paceProfile` only).
 * Checks the REAL firestore.rules allow it for the owner (running.* is in no
 * protected group) and deny it for anyone else. firestore.rules unchanged.
 *
 * Run: scripts/ci/run-emulator-suites.sh --only 8089 tests/pace-profile-self-correction.rules.test.ts
 */
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { writeQualityRunToPaceProfile } from '@/features/workout-engine/core/services/pace-profile-write.service';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';

const PROJECT_ID = 'appout-1-audit-test';
const rules = readFileSync('firestore.rules', 'utf8');
let env: RulesTestEnvironment;

const RUNNER = 'runner_uid';
const NO_PROFILE = 'no_pace_uid';
const OTHER = 'other_uid';

const SUMMARY = { ok: true as const, avgPaceSecPerKm: 318, targetZone: 'tempo' as const, qualitySeconds: 1200, qualityMeters: 3770 };
const day = (d: number) => new Date(2026, 9, d, 18, 0, 0);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: '127.0.0.1', port: 8089 },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', RUNNER), {
      core: { name: 'Runner' },
      running: {
        isUnlocked: true,
        // legacy shape: no history / count fields
        paceProfile: { basePace: 300, profileType: 1 },
        generatedProgramTemplate: { targetDistance: '5k' },
      },
    });
    await setDoc(doc(db, 'users', NO_PROFILE), { core: { name: 'NoPace' }, running: { isUnlocked: false } });
    await setDoc(doc(db, 'users', OTHER), { core: { name: 'Other' } });
  });
});

afterAll(async () => {
  if (env) await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid, { email: `${uid}@example.com` }).firestore() as unknown as Firestore;

describe('running.paceProfile self-correction write', () => {
  it('owner: 3 quality runs on 3 days move basePace by the engine rule; other fields untouched', async () => {
    const db = as(RUNNER);
    for (const d of [1, 3, 5]) {
      const res = await assertSucceeds(writeQualityRunToPaceProfile(db, RUNNER, 'tempo_w2', SUMMARY, DEFAULT_PACE_MAP_CONFIG, day(d)));
      expect(res.written).toBe(true);
    }
    const snap = await getDoc(doc(db, 'users', RUNNER));
    const running = snap.data()?.running;
    expect(running.paceProfile.basePace).toBe(295);
    expect(running.paceProfile.qualityWorkoutCount).toBe(3);
    expect(running.paceProfile.qualityWorkoutsHistory).toHaveLength(3);
    expect(running.paceProfile.lastSelfCorrectionDate).toBe(day(5).toISOString());
    expect(running.isUnlocked).toBe(true);
    expect(running.generatedProgramTemplate.targetDistance).toBe('5k');
    expect(snap.data()?.core.name).toBe('Runner');
  });

  it('owner: a second run the same day is not written', async () => {
    const res = await writeQualityRunToPaceProfile(as(RUNNER), RUNNER, 'tempo_w2', SUMMARY, DEFAULT_PACE_MAP_CONFIG, day(5));
    expect(res).toEqual({ written: false, reason: 'already_recorded_today' });
  });

  it('owner without a basePace: nothing written', async () => {
    const res = await writeQualityRunToPaceProfile(as(NO_PROFILE), NO_PROFILE, 'tempo_w2', SUMMARY, DEFAULT_PACE_MAP_CONFIG, day(1));
    expect(res).toEqual({ written: false, reason: 'no_pace_profile' });
  });

  it('[DENY] another signed-in user cannot write the runner’s paceProfile', async () => {
    await assertFails(writeQualityRunToPaceProfile(as(OTHER), RUNNER, 'tempo_w2', SUMMARY, DEFAULT_PACE_MAP_CONFIG, day(9)));
  });
});
