import { describe, it, expect, vi } from 'vitest';

/**
 * Retention "days away" fix, 18.10.2026 — hermetic (no emulator, no network).
 *
 * The bug: retentionScheduler read users.lastActive alone, which is written
 * only at signup/onboarding, so every user onboarded > 7 days ago got
 * "פספסת כמה ימים?" every 48h even if they trained yesterday, and lapsed users
 * got it forever. These tests pin:
 *   - daysAway from the REAL last activity (doc signals + latest workout)
 *   - the owner-approved milestone cadence (d4 / d7 / d14 / d30, then stop)
 *   - the lapsed-user suppression rule for reminders / step nudges
 *   - the copy: no day count, no guilt, milestone rows only under the cadence
 */

vi.mock('firebase-admin', () => {
  const firestoreFn = () => ({});
  (firestoreFn as any).Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  (firestoreFn as any).FieldValue = {};
  return { apps: [{}], initializeApp: vi.fn(), firestore: firestoreFn, messaging: () => ({}) };
});
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));

import {
  activityFlagsFrom,
  activityToMillis,
  daysAwayBetween,
  lapsedSuppressionReason,
  lastActivityFromUserData,
  nextRetentionMilestone,
  recordRetentionMilestone,
  resolveLastActivityMs,
  retentionMilestoneFor,
  retentionSentLogFrom,
  type RetentionSentLog,
} from '../lib/user-activity';
import {
  confirmRealInactivity,
  retentionCopyContext,
  retentionThresholdDays,
  toRetentionCandidate,
} from '../retentionScheduler';
import { PUSH_CATALOG_BY_TYPE, selectPushCopy, validatePushCopyDraft } from '../shared/push-library.core';

const DAY = 86_400_000;
// Wednesday 13.01.2027 10:00 Israel (08:00Z) — the scheduler's run time.
const NOW = Date.UTC(2027, 0, 13, 8);
const ts = (ms: number) => ({ toMillis: () => ms });

/** A fake Firestore whose workouts query returns `latest` (or throws). */
function fakeDb(latest: number | null | Error) {
  const q: any = {};
  for (const m of ['where', 'orderBy', 'limit', 'select']) q[m] = vi.fn(() => q);
  q.get = vi.fn(async () => {
    if (latest instanceof Error) throw latest;
    const docs = latest === null ? [] : [{ data: () => ({ date: ts(latest) }) }];
    return { empty: docs.length === 0, docs };
  });
  return { db: { collection: vi.fn(() => q) } as any, q };
}

const EMPTY_LOG: RetentionSentLog = { anchor: null, sent: [] };

// ─── daysAway ────────────────────────────────────────────────────────────────

describe('daysAway — computed from the real last activity', () => {
  it('parses every activity format the user doc carries', () => {
    expect(activityToMillis(ts(123))).toBe(123);
    expect(activityToMillis({ seconds: 2 })).toBe(2000);
    expect(activityToMillis(new Date(5))).toBe(5);
    expect(activityToMillis('2027-01-10T18:00:00.000Z')).toBe(Date.UTC(2027, 0, 10, 18));
    // progression.lastActiveDate is a UTC calendar day → noon UTC, same Israel day
    expect(activityToMillis('2027-01-10')).toBe(Date.UTC(2027, 0, 10, 12));
    expect(activityToMillis('')).toBeNull();
    expect(activityToMillis(undefined)).toBeNull();
    expect(activityToMillis('not a date')).toBeNull();
  });

  it('takes the LATEST signal on the doc, not lastActive', () => {
    const data = {
      lastActive: ts(NOW - 40 * DAY), // signup, long ago
      progression: { lastActiveDate: '2027-01-12' }, // trained yesterday
      running: { lastWorkoutDate: new Date(NOW - 5 * DAY).toISOString() },
      fcmTokenMeta: { a: { lastSeenAt: ts(NOW - 3 * DAY) }, b: { platform: 'ios' } },
    };
    expect(daysAwayBetween(lastActivityFromUserData(data)!, NOW)).toBe(1);
  });

  it('counts the last app open (fcmTokenMeta.*.lastSeenAt)', () => {
    const data = { lastActive: ts(NOW - 40 * DAY), fcmTokenMeta: { t1: { lastSeenAt: ts(NOW - 2 * DAY) } } };
    expect(daysAwayBetween(lastActivityFromUserData(data)!, NOW)).toBe(2);
  });

  it('no signal at all → null (never "inactive forever")', () => {
    expect(lastActivityFromUserData({ core: { name: 'a' } })).toBeNull();
  });

  it('counts Israel calendar days (late-night workout = that day)', () => {
    // Trained Tuesday 23:30 Israel (21:30Z) → Wednesday 10:00 is 1 day, not 0.
    expect(daysAwayBetween(Date.UTC(2027, 0, 12, 21, 30), NOW)).toBe(1);
    // Trained 00:30 Israel Wednesday (22:30Z Tuesday) → same day.
    expect(daysAwayBetween(Date.UTC(2027, 0, 12, 22, 30), NOW)).toBe(0);
    expect(daysAwayBetween(NOW - 7 * DAY, NOW)).toBe(7);
    expect(daysAwayBetween(NOW + DAY, NOW)).toBe(0); // never negative
  });

  it('a workout newer than every doc signal wins (resolveLastActivityMs)', async () => {
    const { db } = fakeDb(NOW - 1 * DAY);
    const last = await resolveLastActivityMs(db, 'u', { lastActive: ts(NOW - 20 * DAY) }, NOW, 7);
    expect(daysAwayBetween(last!, NOW)).toBe(1);
  });

  it('skips the workouts query when the doc alone shows recent activity', async () => {
    const { db, q } = fakeDb(new Error('should not be called'));
    const last = await resolveLastActivityMs(db, 'u', { progression: { lastActiveDate: '2027-01-12' } }, NOW, 7);
    expect(daysAwayBetween(last!, NOW)).toBe(1);
    expect(q.get).not.toHaveBeenCalled();
  });

  it('uses the indexed query shape (userId == uid, date desc, limit 1)', async () => {
    const { db, q } = fakeDb(null);
    await resolveLastActivityMs(db, 'u9', { lastActive: ts(NOW - 20 * DAY) }, NOW, 7);
    expect(db.collection).toHaveBeenCalledWith('workouts');
    expect(q.where).toHaveBeenCalledWith('userId', '==', 'u9');
    expect(q.orderBy).toHaveBeenCalledWith('date', 'desc');
    expect(q.limit).toHaveBeenCalledWith(1);
  });
});

// ─── scheduler guard ─────────────────────────────────────────────────────────

describe('retentionScheduler — active users get nothing', () => {
  const stale = { core: { name: 'דנה' }, lastActive: ts(NOW - 30 * DAY) };

  it('a user who trained yesterday (doc signal) is not a candidate, despite an old lastActive', () => {
    expect(toRetentionCandidate('u1', { ...stale, progression: { lastActiveDate: '2027-01-12' } }, NOW)).toBeNull();
  });

  it('the legacy lastActive-only check (guard off) still sees them as inactive — the bug', () => {
    const c = toRetentionCandidate(
      'u1',
      { ...stale, progression: { lastActiveDate: '2027-01-12' } },
      NOW,
      false,
      { useAllSignals: false },
    );
    expect(c?.daysSince).toBe(30);
  });

  it('a workout yesterday (workouts collection only) → dropped by confirmRealInactivity', async () => {
    const c = toRetentionCandidate('u1', stale, NOW)!;
    expect(c).not.toBeNull();
    const { db } = fakeDb(NOW - DAY);
    expect(await confirmRealInactivity(db, c, stale, NOW, 7)).toBeNull();
  });

  it('really away → kept, with the real days away', async () => {
    const c = toRetentionCandidate('u1', stale, NOW)!;
    const { db } = fakeDb(NOW - 9 * DAY);
    expect(await confirmRealInactivity(db, c, stale, NOW, 7)).toMatchObject({ uid: 'u1', daysSince: 9 });
  });

  it('a failed workouts lookup throws (the scheduler then skips the user — fail safe)', async () => {
    const c = toRetentionCandidate('u1', stale, NOW)!;
    const { db } = fakeDb(new Error('unavailable'));
    await expect(confirmRealInactivity(db, c, stale, NOW, 7)).rejects.toThrow('unavailable');
  });

  it('threshold: 7 days by default, 4 under the milestone cadence', () => {
    expect(retentionThresholdDays(activityFlagsFrom({}))).toBe(7);
    expect(retentionThresholdDays(activityFlagsFrom({ retentionMilestoneCadence: true }))).toBe(4);
  });
});

// ─── milestone cadence ───────────────────────────────────────────────────────

describe('milestone selection (d4 / d7 / d14 / d30 days 30–35, then stop)', () => {
  const anchor = NOW - 100 * DAY;

  it.each([
    [0, null],
    [1, null],
    [3, null],
    [4, 'd4'],
    [5, 'd4'],
    [6, 'd4'],
    [7, 'd7'],
    [13, 'd7'],
    [14, 'd14'],
    [29, 'd14'],
    [30, 'd30'],
    [31, 'd30'],
    [35, 'd30'],
    [36, null],
    [45, null],
    [400, null],
  ])('%i days away → %s', (days, expected) => {
    expect(retentionMilestoneFor(days)).toBe(expected);
    expect(nextRetentionMilestone(days, anchor, EMPTY_LOG)).toBe(expected);
  });

  it('each milestone sends ONCE per absence', () => {
    let log = EMPTY_LOG;
    const sent: string[] = [];
    for (let day = 0; day <= 60; day++) {
      const m = nextRetentionMilestone(day, anchor, log);
      if (m) {
        sent.push(`${day}:${m}`);
        log = recordRetentionMilestone(anchor, log, m);
      }
    }
    expect(sent).toEqual(['4:d4', '7:d7', '14:d14', '30:d30']);
  });

  it('a d30 missed on day 30 (Shabbat, cap) still goes out by day 35, once; nothing after', () => {
    let log = recordRetentionMilestone(anchor, EMPTY_LOG, 'd14');
    expect(nextRetentionMilestone(33, anchor, log)).toBe('d30');
    log = recordRetentionMilestone(anchor, log, 'd30');
    expect(nextRetentionMilestone(34, anchor, log)).toBeNull();
    expect(nextRetentionMilestone(36, anchor, EMPTY_LOG)).toBeNull();
  });

  it('a milestone skipped on its first day (caps, Shabbat) goes out the next day in its window', () => {
    // d4 not recorded on day 4 (not delivered) → still due on day 5.
    expect(nextRetentionMilestone(5, anchor, EMPTY_LOG)).toBe('d4');
    const log = recordRetentionMilestone(anchor, EMPTY_LOG, 'd4');
    expect(nextRetentionMilestone(6, anchor, log)).toBeNull();
  });

  it('a new activity (new anchor) starts a fresh absence', () => {
    const log = recordRetentionMilestone(anchor, EMPTY_LOG, 'd4');
    const newAnchor = anchor + 20 * DAY;
    expect(nextRetentionMilestone(5, newAnchor, log)).toBe('d4');
    expect(recordRetentionMilestone(newAnchor, log, 'd4')).toEqual({ anchor: newAnchor, sent: ['d4'] });
  });

  it('reads the sent log from push_rate, ignoring junk', () => {
    expect(retentionSentLogFrom(undefined)).toEqual(EMPTY_LOG);
    expect(
      retentionSentLogFrom({ retention_absenceAnchor: 5, retention_milestonesSent: ['d4', 'x', 7, 'd7'] }),
    ).toEqual({ anchor: 5, sent: ['d4', 'd7'] });
  });
});

// ─── flags ───────────────────────────────────────────────────────────────────

describe('flags (app_config/feature_flags)', () => {
  it('guard defaults ON; cadence and suppression default OFF', () => {
    expect(activityFlagsFrom(undefined)).toEqual({
      realActivityGuard: true,
      milestoneCadence: false,
      lapsedSuppression: false,
    });
  });
  it('only an explicit false turns the guard off; only true turns the others on', () => {
    expect(activityFlagsFrom({ retentionRealActivityGuard: false }).realActivityGuard).toBe(false);
    expect(activityFlagsFrom({ retentionRealActivityGuard: 'no' }).realActivityGuard).toBe(true);
    expect(activityFlagsFrom({ retentionMilestoneCadence: 'true' }).milestoneCadence).toBe(false);
    expect(activityFlagsFrom({ lapsedPushSuppression: true }).lapsedSuppression).toBe(true);
  });
});

// ─── suppression ─────────────────────────────────────────────────────────────

describe('lapsed suppression for reminders / step nudges', () => {
  it('> 30 days away → held back; 30 or less → sent', () => {
    expect(lapsedSuppressionReason(NOW - 31 * DAY, undefined, NOW)).toBe('lapsed_30');
    expect(lapsedSuppressionReason(NOW - 30 * DAY, undefined, NOW)).toBeNull();
    expect(lapsedSuppressionReason(NOW - DAY, undefined, NOW)).toBeNull();
  });
  it('unknown activity is never suppressed', () => {
    expect(lapsedSuppressionReason(null, undefined, NOW)).toBeNull();
  });
  it('a retention push today holds back the day’s reminders; yesterday’s does not', () => {
    expect(lapsedSuppressionReason(NOW - DAY, { retention_lastSentAt: ts(NOW - 3600_000) }, NOW)).toBe('retention_today');
    expect(lapsedSuppressionReason(NOW - DAY, { retention_lastSentAt: ts(NOW - DAY) }, NOW)).toBeNull();
  });
});

// ─── copy ────────────────────────────────────────────────────────────────────

describe('retention copy — no day count, no guilt', () => {
  const entry = PUSH_CATALOG_BY_TYPE.retention_lapse;
  const cand = (uid: string, gender?: string) => ({
    uid,
    name: 'דנה',
    daysSince: 9,
    audience: gender ? { gender } : {},
  });

  it('the catalog no longer offers @ימים, and no default uses it or "פספסת"', () => {
    expect(entry.vars).not.toContain('@ימים');
    for (const d of entry.defaults) {
      expect(`${d.title} ${d.body}`).not.toMatch(/@ימים|פספסת/);
      expect(validatePushCopyDraft({ pushType: 'retention_lapse', title: d.title, body: d.body, deepLink: 'home', conditions: d.conditions })).toEqual([]);
    }
  });

  it('the context fills the name only', () => {
    const ctx = retentionCopyContext(cand('u1'), new Date(NOW));
    expect(ctx.vars).toEqual({ '@שם': 'דנה' });
    expect(ctx.conditions).toBeUndefined();
  });

  it('a library row still using @ימים never renders (skipped, not sent with a hole)', () => {
    const rows = [{ id: 'old', pushType: 'retention_lapse', title: 'עברו @ימים ימים', body: 'חוזרים?', active: true }];
    const c = selectPushCopy('retention_lapse', rows, retentionCopyContext(cand('u1'), new Date(NOW)));
    expect(c?.rowId).not.toBe('old');
  });

  it('cadence off: milestone rows are never picked', () => {
    for (let i = 0; i < 60; i++) {
      const c = selectPushCopy('retention_lapse', [], retentionCopyContext(cand(`u${i}`, 'female'), new Date(NOW)))!;
      const idx = Number(c.rowId.split(':').pop());
      expect(entry.defaults[idx].conditions).toBeUndefined();
    }
  });

  it.each(['d4', 'd7', 'd14', 'd30'] as const)('cadence on: %s picks that milestone’s copy, matching gender', (m) => {
    for (const g of ['male', 'female', undefined]) {
      const c = selectPushCopy('retention_lapse', [], retentionCopyContext(cand(`u-${m}`, g), new Date(NOW), m))!;
      const d = entry.defaults[Number(c.rowId.split(':').pop())];
      expect(d.conditions).toEqual({ milestone: [m] });
      expect(d.gender).toBe(g);
    }
  });

  it('d7 says "new week", d30 says the door is open', () => {
    const pick = (m: 'd7' | 'd30') =>
      selectPushCopy('retention_lapse', [], retentionCopyContext(cand('u1', 'male'), new Date(NOW), m))!;
    expect(pick('d7').title).toContain('שבוע חדש');
    expect(pick('d30').title).toContain('הדלת');
  });
});
