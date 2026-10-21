/**
 * streaks/{uid} — the Saturday rule / shield bridge needs NO rules change (streak pushes,
 * 21.10.2026). The activity store writes a kept gap day as +1 (date → that day) then −1
 * (same date), then today's plain +1 (src/features/activity/store/streak-policy.ts
 * bridgeWrites). This proves the existing rule accepts exactly that sequence, the extra
 * optional fields (shields, shieldsEarnedAt, shieldUsedOn, milestoneSeen), and still rejects
 * a direct jump that keeps the count over a gap.
 *
 * Run: isolated emulator on 127.0.0.1:8089 —
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 */
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'appout-1-audit-test';
let env: RulesTestEnvironment;

function dayStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const UID = 'streak_user';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8089 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'streaks', UID), {
      userId: UID,
      currentStreak: 6,
      longestStreak: 6,
      lastActivityDate: dayStr(-3),
    });
  });
});

const ref = () => doc(env.authenticatedContext(UID).firestore(), 'streaks', UID);

describe('streaks rule — kept-gap bridge', () => {
  it('two kept days (+1/−1 each) then today +1 → all ALLOWED, with the shield fields', async () => {
    const writes = [
      { currentStreak: 7, longestStreak: 7, lastActivityDate: dayStr(-2) },
      { currentStreak: 6, longestStreak: 7, lastActivityDate: dayStr(-2) },
      { currentStreak: 7, longestStreak: 7, lastActivityDate: dayStr(-1) },
      { currentStreak: 6, longestStreak: 7, lastActivityDate: dayStr(-1) },
    ];
    for (const w of writes) await assertSucceeds(setDoc(ref(), { userId: UID, ...w }, { merge: true }));
    await assertSucceeds(
      setDoc(
        ref(),
        { userId: UID, currentStreak: 7, longestStreak: 7, lastActivityDate: dayStr(0), shields: 1, shieldsEarnedAt: 7, shieldUsedOn: [dayStr(-1)] },
        { merge: true },
      ),
    );
  });

  it('milestoneSeen alone (merge) → ALLOWED (the "unchanged" branch)', async () => {
    await assertSucceeds(setDoc(ref(), { milestoneSeen: 3 }, { merge: true }));
  });

  it('keeping the count across a gap in ONE write → DENIED (why the bridge exists)', async () => {
    await assertFails(setDoc(ref(), { userId: UID, currentStreak: 7, longestStreak: 7, lastActivityDate: dayStr(0) }, { merge: true }));
  });
});
