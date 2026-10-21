import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * reminderSweepScheduler — deploy readiness (push-lifecycle audit, item B;
 * owner-approved 21.10.2026). Unit-level, in-memory Firestore + the REAL
 * push.service (quiet hours, prefs, rate cap). The query shapes themselves
 * are also covered against a real emulator in
 * reminderSweepScheduler.emulator.test.ts.
 *
 * The "כן, תזכיר לי X דק׳ לפני" screen (ReminderOptInStep →
 * reminderSlotsFor) writes lifestyle.reminders.schedule slots at
 * (workout time − lead) on the 5-minute grid; pass 1 must fire exactly then.
 */

vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => unknown) => handler,
}));
vi.mock('../services/push-events.service', () => ({ writePushSentEvent: vi.fn(async () => {}) }));

import { store, sentMessages } from './helpers/fake-firestore';
import { reminderSweepScheduler } from '../reminderSweepScheduler';
// The client util that writes the slots — the server must agree with it.
import { reminderSlotsFor } from '../../../src/features/schedule/utils/reminderOptIn';

const run = () => (reminderSweepScheduler as unknown as () => Promise<void>)();

/** 2026-09-10 is a Thursday (DST, UTC+3). */
function setIsraelTime(hour: number, minute = 0) {
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 10, hour - 3, minute, 0)));
}

function seedUser(uid: string, schedule: Array<{ day: string; time: string }>) {
  store.set(`users/${uid}`, {
    fcmTokens: [`tok-${uid}`],
    settings: { pushEnabled: true, notificationPrefs: { training_reminder: true } },
    lifestyle: { reminders: { schedule } },
  });
}

describe('reminderSweepScheduler — pass 1 (the opt-in screen\'s "X min before" slots)', () => {
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('fires at (19:00 − 30 min) for the slot the opt-in screen wrote, once', async () => {
    // Thursday = dow 4; the screen's default lead is 30 minutes.
    const slots = reminderSlotsFor([{ dow: 4, time: '19:00' }], 30);
    expect(slots).toEqual([{ day: 'thursday', time: '18:30' }]);
    store.set('app_config/feature_flags', { enableReminderSweepPush: true });
    seedUser('u1', slots);

    setIsraelTime(18, 30);
    await run();
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-u1']]);

    // A retried / overlapping tick in the same slot does not send again.
    await run();
    expect(sentMessages).toHaveLength(1);
  });

  it('does nothing at another time or another weekday', async () => {
    store.set('app_config/feature_flags', { enableReminderSweepPush: true });
    seedUser('u2', [{ day: 'thursday', time: '18:30' }]);
    seedUser('u3', [{ day: 'friday', time: '18:35' }]);

    setIsraelTime(18, 35);
    await run();
    expect(sentMessages).toHaveLength(0);
  });

  it('master flag off (the production state until the owner flips it) → nothing at all', async () => {
    seedUser('u4', [{ day: 'thursday', time: '18:30' }]);
    setIsraelTime(18, 30);
    await run();
    expect(sentMessages).toHaveLength(0);
    expect(Array.from(store.keys()).some((k) => k.startsWith('reminder_fired/'))).toBe(false);
  });

  it('a slot inside quiet hours (06:30 for a 07:00 workout) is suppressed, not rerouted', async () => {
    store.set('app_config/feature_flags', { enableReminderSweepPush: true });
    seedUser('u5', reminderSlotsFor([{ dow: 4, time: '07:00' }], 30));
    setIsraelTime(6, 30);
    await run();
    expect(sentMessages).toHaveLength(0);
  });

  it('demo users are never reminded', async () => {
    store.set('app_config/feature_flags', { enableReminderSweepPush: true });
    seedUser('demo_x', [{ day: 'thursday', time: '18:30' }]);
    setIsraelTime(18, 30);
    await run();
    expect(sentMessages).toHaveLength(0);
  });
});

describe('reminderSweepScheduler — pass 2 (workout entries, sub-flag)', () => {
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function seedEntry(uid: string, startTime: string) {
    store.set(`users/${uid}`, {
      fcmTokens: [`tok-${uid}`],
      settings: { pushEnabled: true, notificationPrefs: { training_reminder: true } },
    });
    store.set(`userSchedule/${uid}_2026-09-10`, {
      userId: uid,
      date: '2026-09-10',
      entries: [{ entryId: 'e1', type: 'training', source: 'recurring', completed: false, startTime }],
    });
  }

  it('fires leadMinutes (default 10) before startTime when both flags are on', async () => {
    store.set('app_config/feature_flags', { enableReminderSweepPush: true, reminderSweepWorkoutEntriesEnabled: true });
    seedEntry('w1', '19:00');
    setIsraelTime(18, 50);
    await run();
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-w1']]);
  });

  it('sub-flag off → pass 2 is silent even with the master flag on', async () => {
    store.set('app_config/feature_flags', { enableReminderSweepPush: true });
    seedEntry('w2', '19:00');
    setIsraelTime(18, 50);
    await run();
    expect(sentMessages).toHaveLength(0);
  });
});
