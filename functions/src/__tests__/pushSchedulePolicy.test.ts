import { describe, it, expect, vi } from 'vitest';

/**
 * Push schedule fixes, 17.10.2026 — the pure decision helpers of three
 * triggers (no Firestore/FCM involved; module-level admin/functions calls
 * are stubbed just so the files can be imported):
 *   - retentionScheduler: each user gets THEIR OWN name/days in the copy
 *     (was: one title from group[0].name multicast to the whole group), and
 *     a user with no lastActive is skipped (was: "inactive forever")
 *   - onboardingDropoffDispatcher: dropoffNotifyCount is enforced (max 2)
 *   - chatMessageNotification: only a person-to-person DM counts as 1:1
 *     for the Shabbat exemption
 *   - stepGoalNudgeScheduler: the morning-only 'start' copy isn't used at 18:00
 */

vi.mock('firebase-admin', () => {
  const firestoreFn = () => ({});
  (firestoreFn as any).Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  (firestoreFn as any).FieldValue = {};
  return { apps: [{}], initializeApp: vi.fn(), firestore: firestoreFn, messaging: () => ({}) };
});
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));

import { buildRetentionMessage, toRetentionCandidate } from '../retentionScheduler';
import { dropoffCapSkipReason, MAX_DROPOFF_NOTIFICATIONS } from '../onboardingDropoffDispatcher';
import { isDirectPersonMessage } from '../chatMessageNotification';
import { isMorningOnlyBucketAtThisHour } from '../stepGoalNudgeScheduler';

const DAY = 86_400_000;
const NOW = Date.UTC(2027, 0, 13, 10);

describe('retentionScheduler — per-user message', () => {
  it("uses each user's own name and days, never another user's", () => {
    // Same uid hash bucket is irrelevant — the name/days come from the user.
    const a = buildRetentionMessage({ uid: 'u-a', name: 'דנה', daysSince: 9 });
    const b = buildRetentionMessage({ uid: 'u-b', name: 'יוסי', daysSince: 30 });
    expect(`${a.title} ${a.body}`).not.toContain('יוסי');
    expect(`${b.title} ${b.body}`).not.toContain('דנה');
    expect(`${a.title} ${a.body}`).toContain('9');
    expect(`${b.title} ${b.body}`).toContain('30');
  });

  it('puts the name in the title for every variant that has {name}', () => {
    // Find uids that land on each of the 4 variants, then check.
    const seen = new Map<number, string>();
    for (let i = 0; seen.size < 4 && i < 500; i++) {
      const uid = `uid-${i}`;
      const v = buildRetentionMessage({ uid, name: 'x', daysSince: 7 }).variant;
      if (!seen.has(v)) seen.set(v, uid);
    }
    expect(seen.size).toBe(4);
    for (const [variant, uid] of seen) {
      const { title } = buildRetentionMessage({ uid, name: 'מיכל', daysSince: 7 });
      if (variant !== 3) expect(title).toContain('מיכל'); // variant 3's title has no {name}
    }
  });

  it("falls back to 'חבר' when the user has no name (no leftover placeholder)", () => {
    for (let i = 0; i < 20; i++) {
      const { title, body } = buildRetentionMessage({ uid: `n-${i}`, name: '  ', daysSince: 8 });
      expect(`${title}${body}`).not.toMatch(/\{\w+\}/);
    }
  });
});

describe('retentionScheduler — candidate filter', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });

  it('skips a user with no lastActive', () => {
    expect(toRetentionCandidate('u1', { core: { name: 'a' } }, NOW)).toBeNull();
  });

  it('keeps a user inactive for >= 7 days, with their own daysSince', () => {
    const c = toRetentionCandidate('u2', { core: { name: 'a' }, lastActive: ts(NOW - 10 * DAY) }, NOW);
    expect(c).toEqual({ uid: 'u2', name: 'a', daysSince: 10 });
  });

  it('skips a recently active user and opted-out users', () => {
    expect(toRetentionCandidate('u3', { lastActive: ts(NOW - 2 * DAY) }, NOW)).toBeNull();
    expect(
      toRetentionCandidate('u4', { lastActive: ts(NOW - 10 * DAY), settings: { pushEnabled: false } }, NOW),
    ).toBeNull();
    expect(
      toRetentionCandidate(
        'u5',
        { lastActive: ts(NOW - 10 * DAY), settings: { notificationPrefs: { retention: false } } },
        NOW,
      ),
    ).toBeNull();
  });
});

describe('onboardingDropoffDispatcher — lifetime cap', () => {
  it('allows a never-notified user', () => {
    expect(dropoffCapSkipReason({}, NOW)).toBeNull();
  });

  it('allows a second send after the cooldown', () => {
    expect(
      dropoffCapSkipReason({ dropoffNotifyCount: 1, dropoffNotifiedAt: { toMillis: () => NOW - 72 * 3600_000 } }, NOW),
    ).toBeNull();
  });

  it('blocks inside the cooldown', () => {
    expect(
      dropoffCapSkipReason({ dropoffNotifyCount: 1, dropoffNotifiedAt: { toMillis: () => NOW - 3600_000 } }, NOW),
    ).toMatch(/cooldown/);
  });

  it(`stops after ${MAX_DROPOFF_NOTIFICATIONS} sends, even long after the cooldown`, () => {
    expect(MAX_DROPOFF_NOTIFICATIONS).toBe(2);
    expect(
      dropoffCapSkipReason({ dropoffNotifyCount: 2, dropoffNotifiedAt: { toMillis: () => NOW - 60 * DAY } }, NOW),
    ).toMatch(/lifetime cap/);
    expect(dropoffCapSkipReason({ dropoffNotifyCount: 5 }, NOW)).toMatch(/lifetime cap/);
  });
});

describe('chatMessageNotification — 1:1 person-to-person', () => {
  it('a dm between two people is direct', () => {
    expect(isDirectPersonMessage('a_b', { type: 'dm', participants: ['a', 'b'] }, 'a')).toBe(true);
  });
  it('a group chat is not', () => {
    expect(isDirectPersonMessage('group_g1', { type: 'group', participants: ['a', 'b'] }, 'a')).toBe(false);
  });
  it('a bot dm (system_* sender, e.g. Kelly) is not', () => {
    expect(
      isDirectPersonMessage('a_system_kelly_coach', { type: 'dm', participants: ['a', 'system_kelly_coach'] }, 'system_kelly_coach'),
    ).toBe(false);
  });
  it('a legacy doc with no type: two participants and not group_ → direct', () => {
    expect(isDirectPersonMessage('a_b', { participants: ['a', 'b'] }, 'a')).toBe(true);
    expect(isDirectPersonMessage('group_x', { participants: ['a', 'b'] }, 'a')).toBe(false);
    expect(isDirectPersonMessage('abc', { participants: ['a', 'b', 'c'] }, 'a')).toBe(false);
  });
});

describe('stepGoalNudgeScheduler — morning-only bucket', () => {
  it("skips the 'start' (morning copy) bucket at the 18:00 run", () => {
    expect(isMorningOnlyBucketAtThisHour('start', 18)).toBe(true);
  });
  it("keeps 'start' in the morning, and other buckets at 18:00", () => {
    expect(isMorningOnlyBucketAtThisHour('start', 8)).toBe(false);
    expect(isMorningOnlyBucketAtThisHour('mid', 18)).toBe(false);
    expect(isMorningOnlyBucketAtThisHour('close', 18)).toBe(false);
  });
});
