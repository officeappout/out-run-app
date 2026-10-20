/**
 * applyReferralBonus — REAL emulator suite (port 8089). Proves: +50 on the
 * referrer's city + neighborhood (week + month) without touching the active
 * count, exactly once, no self-referral, the weekly cap, the counters on the
 * referrer's doc, and that a later workout keeps the bonus.
 *
 * Run alone: bash scripts/ci/run-emulator-suites.sh --only 8089 functions/src/__tests__/referralBonus.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { applyReferralBonus, MAX_BONUSES_PER_WEEK } from '../lib/apply-referral-bonus';
import { applyWorkoutToLeagueStats } from '../lib/apply-league-stats';

const PROJECT_ID = 'appout-1-referral-bonus-emulator-test';
const EMULATOR_HOST = '127.0.0.1:8089';
let app: App;
let db: Firestore;

async function clearEmulator() {
  const res = await fetch(`http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`emulator not reachable at ${EMULATOR_HOST}`);
}
const ts = () => FieldValue.serverTimestamp();
const inc = (n: number) => FieldValue.increment(n);
// Fri 16 Oct 2026, 10:00 Israel → weekly W2026-10-11, monthly M2026-10
const NOW = new Date('2026-10-16T07:00:00Z');
const FRI = Timestamp.fromDate(NOW);
const week = (g: string, id: string) => `league_scope_stats/weekly_W2026-10-11_${g}_${id}`;
const month = (g: string, id: string) => `league_scope_stats/monthly_M2026-10_${g}_${id}`;
const bonus = (id: string, invitee: string) =>
  applyReferralBonus(db, ts, inc, id, { referrerUid: 'r1', inviteeUid: invitee }, NOW);

beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  app = initializeApp({ projectId: PROJECT_ID }, `referral-bonus-${Date.now()}`);
  db = getFirestore(app);
  await clearEmulator();
});
afterAll(async () => {
  await clearEmulator().catch(() => {});
  await deleteApp(app);
});
beforeEach(async () => {
  await clearEmulator();
  await db.doc('users/r1').set({ core: { authorityId: 'tlv', neighborhoodId: 'n1', gender: 'female' }, social: { groupIds: ['g1'] } });
});

describe('applyReferralBonus', () => {
  it('+50 to the city and neighborhood, week and month — not to groups, not to the active count', async () => {
    expect(await bonus('r1_i1', 'i1')).toBe('applied');
    for (const path of [week('city', 'tlv'), week('neighborhood', 'n1'), month('city', 'tlv'), month('neighborhood', 'n1')]) {
      const d = (await db.doc(path).get()).data()!;
      expect(d.totalCredit).toBe(50);
      expect(d.bonusCredit).toBe(50);
      expect(d.activeMemberCount).toBeUndefined();
    }
    expect((await db.doc(week('group', 'g1')).get()).exists).toBe(false);
    const u = (await db.doc('users/r1').get()).data()!;
    expect(u.core.referralCount).toBe(1);
    expect(u.social.partnerCount).toBe(1);
  });

  it('exactly once per referral', async () => {
    await bonus('r1_i1', 'i1');
    expect(await bonus('r1_i1', 'i1')).toBe('already');
    expect((await db.doc(week('city', 'tlv')).get()).data()!.totalCredit).toBe(50);
  });

  it('demo world guard (20.10.2026): no bonus when the invitee or the referrer is a demo user', async () => {
    expect(await applyReferralBonus(db, ts, inc, 'r1_demo_c1', { referrerUid: 'r1', inviteeUid: 'demo_c1' }, NOW)).toBe('no-user');
    expect(await applyReferralBonus(db, ts, inc, 'demo_c1_x', { referrerUid: 'demo_c1', inviteeUid: 'x' }, NOW)).toBe('no-user');
    expect((await db.doc('league_scope_stats_processed/referral_r1_demo_c1').get()).exists).toBe(false);
  });

  it('no self-referral', async () => {
    expect(await applyReferralBonus(db, ts, inc, 'r1_r1', { referrerUid: 'r1', inviteeUid: 'r1' }, NOW)).toBe('self');
  });

  it(`at most ${MAX_BONUSES_PER_WEEK} bonuses a week, counters still move`, async () => {
    for (let i = 0; i < MAX_BONUSES_PER_WEEK; i++) expect(await bonus(`r1_i${i}`, `i${i}`)).toBe('applied');
    expect(await bonus('r1_extra', 'extra')).toBe('capped');
    expect((await db.doc(week('city', 'tlv')).get()).data()!.totalCredit).toBe(50 * MAX_BONUSES_PER_WEEK);
    expect((await db.doc('users/r1').get()).data()!.core.referralCount).toBe(MAX_BONUSES_PER_WEEK + 1);
  });

  it('a later workout keeps the bonus in the total and the tally', async () => {
    await bonus('r1_i1', 'i1');
    await applyWorkoutToLeagueStats(db, ts, 'w1', { userId: 'r1', category: 'strength', duration: 1800, date: FRI });
    const d = (await db.doc(week('neighborhood', 'n1')).get()).data()!;
    expect(d.totalCredit).toBe(50 + 60);
    expect(d.bonusCredit).toBe(50);
    expect(d.activeMemberCount).toBe(1);
  });
});
