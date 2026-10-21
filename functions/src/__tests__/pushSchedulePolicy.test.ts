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

import { retentionCopyContext, toRetentionCandidate } from '../retentionScheduler';
import { selectPushCopy } from '../shared/push-library.core';

/** The retention copy a user would get from the code defaults (empty library). */
function buildRetentionMessage(c: { uid: string; name: string; daysSince: number }, track: 'strength' | 'run' | 'walk' | null = 'strength') {
  // 21.10.2026: row 1 ("@שם, הגינה עדיין שם") is strength-track copy.
  const copy = selectPushCopy('retention_lapse', [], retentionCopyContext(c, new Date(NOW), null, track));
  if (!copy) throw new Error('retention copy missing');
  return copy;
}
import { dropoffCapSkipReason, dropoffPrefSkipReason, MAX_DROPOFF_NOTIFICATIONS } from '../onboardingDropoffDispatcher';
import { isDirectPersonMessage } from '../chatMessageNotification';
import { isMorningOnlyBucketAtThisHour } from '../stepGoalNudgeScheduler';

const DAY = 86_400_000;
const NOW = Date.UTC(2027, 0, 13, 10);

describe('retentionScheduler — per-user message (push library)', () => {
  it("uses each user's own name, never another user's", () => {
    for (let i = 0; i < 40; i++) {
      const a = buildRetentionMessage({ uid: `a-${i}`, name: 'דנה', daysSince: 9 });
      const b = buildRetentionMessage({ uid: `b-${i}`, name: 'יוסי', daysSince: 30 });
      expect(`${a.title} ${a.body}`).not.toContain('יוסי');
      expect(`${b.title} ${b.body}`).not.toContain('דנה');
    }
  });

  it('puts the name in the copy that has @שם', () => {
    const named = Array.from({ length: 200 }, (_, i) =>
      buildRetentionMessage({ uid: `uid-${i}`, name: 'מיכל', daysSince: 7 }),
    ).filter((c) => c.rowId === 'default:retention_lapse:1');
    expect(named.length).toBeGreaterThan(0);
    for (const c of named) expect(c.title).toContain('מיכל');
  });

  it('runners and walkers never get "the park" copy; they get their own track rows (21.10.2026)', () => {
    for (const track of ['run', 'walk', null] as const) {
      for (let i = 0; i < 60; i++) {
        const c = buildRetentionMessage({ uid: `t-${track}-${i}`, name: 'מיכל', daysSince: 8 }, track);
        expect(`${c.title} ${c.body}`).not.toContain('הגינה');
      }
    }
    const run = buildRetentionMessage({ uid: 'r1', name: 'מיכל', daysSince: 8 }, 'run');
    expect(`${run.title} ${run.body}`).toMatch(/ריצ|לרוץ|הנעליים/);
  });

  it('a user with no name never gets the @שם copy, and nothing is left unfilled', () => {
    for (let i = 0; i < 50; i++) {
      const c = buildRetentionMessage({ uid: `n-${i}`, name: '  ', daysSince: 8 });
      expect(c.rowId).not.toBe('default:retention_lapse:1');
      expect(`${c.title}${c.body}`).not.toMatch(/\{\w+\}|@[\u05D0-\u05EA_]+/);
      expect(c.deepLink).toBe('/home');
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
    expect(c).toMatchObject({ uid: 'u2', name: 'a', daysSince: 10 });
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

describe('onboardingDropoffDispatcher — channel opt-out (21.10.2026)', () => {
  it('muting training reminders does NOT silence the signup nudge', () => {
    expect(dropoffPrefSkipReason({ settings: { notificationPrefs: { training_reminder: false } } })).toBeNull();
  });
  it('its own channel opt-out does', () => {
    expect(dropoffPrefSkipReason({ settings: { notificationPrefs: { onboarding_dropoff: false } } })).toBe('onboarding_dropoff opt-out');
    expect(dropoffPrefSkipReason({})).toBeNull();
  });
});
