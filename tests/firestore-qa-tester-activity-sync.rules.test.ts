/**
 * "[ActivityStore] Error syncing to Firestore: permission-denied" on the AI testers' boot
 * (runs of 21.10.2026: D05 / D06 / D07 — demo_qa_* accounts seeded by
 * scripts/qa/register-testers.ts). Which write is denied, and why it is NOT demo-specific:
 *
 *   - dailyActivity/{uid}_{today} (merge)            → allowed (no passive fields in the seed)
 *   - users/{uid} progression mirror (updateDoc)     → allowed (core.demo lock untouched — the
 *                                                      sync never rewrites `core`)
 *   - streaks/{uid}                                  → DENIED: the sync sent lastActivityDate =
 *     today while the count was unchanged (streak alive until yesterday, today not counted yet).
 *     No shape of the streaks rule (unchanged / +1 / gap reset / undo) matches — a real user
 *     with a live streak hits the same denial on their first sync of the day.
 *
 * Fix (no rules change): the sync keeps the server's date when nothing counted
 * (src/features/activity/utils/streak-sync.ts), and the tester seed never writes a null
 * lastActivityDate (scripts/qa/lib/seed/tester-state.ts).
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
 *   firebase emulators:exec --only firestore --config firebase-audit.json --project appout-1-audit-test \
 *     "npx vitest run tests/firestore-qa-tester-activity-sync.rules.test.ts"
 */
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, updateDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { buildTesterState } from '../scripts/qa/lib/seed/tester-state';
import { streakWriteDate } from '../src/features/activity/utils/streak-sync';

const PROJECT_ID = 'appout-1-audit-test';
let env: RulesTestEnvironment;

function dayStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = dayStr(0);
const TESTER = 'demo_qa_ds_str_play';
const WHO = { name: 'נועה', age: 31, gender: 'female' as const };

/** Seeds the tester exactly as register-testers does (Admin SDK = rules off). */
async function seedTester(uid: string, streakOverride?: Record<string, unknown>) {
  const docs = buildTesterState(uid, 'strength_plan', WHO, new Date(), null);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const d of docs) await setDoc(doc(db, d.path), d.data);
    if (streakOverride) await setDoc(doc(db, 'streaks', uid), { userId: uid, ...streakOverride });
  });
  return docs;
}

/** The writes syncToServer makes, in order (useActivityStore.ts). */
async function bootSync(db: Firestore, uid: string, streak: { currentStreak: number; longestStreak: number; lastActivityDate: string }) {
  const daily = await setDoc(
    doc(db, 'dailyActivity', `${uid}_${TODAY}`),
    { userId: uid, date: TODAY, steps: 1200, stepsGoal: 8000, stepsGoalMet: false, floors: 3, updatedAt: serverTimestamp() },
    { merge: true },
  ).then(() => 'ok', (e) => String(e?.code ?? e));
  const streakRes = await setDoc(doc(db, 'streaks', uid), { userId: uid, ...streak, updatedAt: serverTimestamp() }, { merge: true }).then(
    () => 'ok',
    (e) => String(e?.code ?? e),
  );
  return { daily, streak: streakRes };
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 } });
}, 30_000);

afterAll(async () => {
  if (env) await env.cleanup();
});

describe('AI tester boot sync (demo_qa_*, strength_plan seed)', () => {
  const live = { currentStreak: 3, longestStreak: 5, lastActivityDate: dayStr(-1) };

  it('[REPRO] old payload (today\'s date, count unchanged) → streak write DENIED; dailyActivity allowed', async () => {
    await seedTester(TESTER, live);
    const db = env.authenticatedContext(TESTER, { demo: true }).firestore();
    const r = await bootSync(db, TESTER, { currentStreak: 3, longestStreak: 5, lastActivityDate: TODAY });
    expect(r.daily).toBe('ok');
    expect(r.streak).toMatch(/permission-denied/i);
  });

  it('[REPRO] the same write by a REAL user is denied too — not a demo sandbox / core.demo issue', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'streaks', 'realUserA'), { userId: 'realUserA', ...live });
    });
    const db = env.authenticatedContext('realUserA').firestore();
    const r = await bootSync(db, 'realUserA', { currentStreak: 3, longestStreak: 5, lastActivityDate: TODAY });
    expect(r.daily).toBe('ok');
    expect(r.streak).toMatch(/permission-denied/i);
  });

  it('[FIX] the sync keeps the server date when nothing counted → allowed (tester and real user)', async () => {
    await seedTester(TESTER, live);
    const date = streakWriteDate({ currentStreak: 3, longestStreak: 5, todayDate: TODAY }, live);
    expect(date).toBe(dayStr(-1));
    for (const [uid, token] of [[TESTER, { demo: true }], ['realUserA', {}]] as const) {
      await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'streaks', uid), { userId: uid, ...live }));
      const r = await bootSync(env.authenticatedContext(uid, token).firestore(), uid, { currentStreak: 3, longestStreak: 5, lastActivityDate: date });
      expect(r, uid).toEqual({ daily: 'ok', streak: 'ok' });
    }
  });

  it('[FIX] a real streak event still sends today: +1 advance from yesterday → allowed', async () => {
    await seedTester(TESTER, live);
    const date = streakWriteDate({ currentStreak: 4, longestStreak: 5, todayDate: TODAY }, live);
    const r = await bootSync(env.authenticatedContext(TESTER, { demo: true }).firestore(), TESTER, { currentStreak: 4, longestStreak: 5, lastActivityDate: date });
    expect(r).toEqual({ daily: 'ok', streak: 'ok' });
  });

  it('the users-doc streak mirror (progression only) is allowed for the seeded tester — core.demo untouched', async () => {
    await seedTester(TESTER, live);
    const db = env.authenticatedContext(TESTER, { demo: true }).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', TESTER), { 'progression.currentStreak': 3, 'progression.longestStreak': 5 }));
  });

  it('[SEED] the old null lastActivityDate made every streak write fail; the seed now writes a day key', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'streaks', 'demo_qa_null'), { userId: 'demo_qa_null', currentStreak: 0, longestStreak: 2, lastActivityDate: null }));
    const db = env.authenticatedContext('demo_qa_null', { demo: true }).firestore();
    await assertFails(setDoc(doc(db, 'streaks', 'demo_qa_null'), { userId: 'demo_qa_null', currentStreak: 0, longestStreak: 2, lastActivityDate: TODAY }, { merge: true }));

    const docs = await seedTester(TESTER);
    const seeded = docs.find((d) => d.path === `streaks/${TESTER}`)!.data as { currentStreak: number; longestStreak: number; lastActivityDate: string };
    expect(seeded.lastActivityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The boot sync with no streak event goes through on the fresh seed, whatever the seeded streak is.
    const date = streakWriteDate({ currentStreak: seeded.currentStreak, longestStreak: seeded.longestStreak, todayDate: TODAY }, seeded);
    const r = await bootSync(env.authenticatedContext(TESTER, { demo: true }).firestore(), TESTER, { currentStreak: seeded.currentStreak, longestStreak: seeded.longestStreak, lastActivityDate: date });
    expect(r).toEqual({ daily: 'ok', streak: 'ok' });
  });
});
