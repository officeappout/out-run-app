import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * streakRescueScheduler — in-memory Firestore + the REAL push.service and push library
 * defaults. Flag system_config/feature_flags.enable_streak_pushes, default off.
 * Standalone: the Kelly proactive ledger only ever SKIPS a slot (both paths tested).
 */
vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('../services/push-events.service', () => ({ writePushSentEvent: vi.fn(async () => {}) }));

import { store, sentMessages, fakeDb } from './helpers/fake-firestore';
import { runStreakPushPass, israelHHMM, candidateFor } from '../streakRescueScheduler';

// Wednesday 21.10.2026, Israel = UTC+3.
const TODAY = '2026-10-21';
const at = (hhmm: string, day = TODAY) => Date.parse(`${day}T${hhmm}:00+03:00`);
const run = (ms: number) => runStreakPushPass(fakeDb as never, ms);

function flags(extra: Record<string, unknown> = {}) {
  store.set('system_config/feature_flags', { enable_streak_pushes: true, ...extra });
}

function seedUser(uid: string, streak: { currentStreak: number; lastActivityDate: string; longestStreak?: number; [k: string]: unknown }) {
  store.set(`users/${uid}`, {
    fcmTokens: [`tok-${uid}`],
    settings: { pushEnabled: true },
    core: { name: 'דנה כהן' },
  });
  store.set(`streaks/${uid}`, { userId: uid, longestStreak: streak.currentStreak, ...streak });
}

describe('streakRescueScheduler', () => {
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('Israel clock → slot', () => {
    expect(israelHHMM(at('19:30'))).toBe('19:30');
    expect(israelHHMM(at('21:15'))).toBe('21:15');
  });

  it('flag off (default) → nothing; a non-slot run → nothing', async () => {
    vi.setSystemTime(at('19:30'));
    seedUser('u1', { currentStreak: 5, lastActivityDate: '2026-10-20' });
    expect((await run(at('19:30'))).delivered).toBe(0);
    flags();
    expect((await run(at('19:45'))).slot).toBeNull();
    expect(sentMessages).toHaveLength(0);
  });

  it('19:30 rescue: streak ≥2 and today open → one push, once a day; closed or streak 1 → none', async () => {
    vi.setSystemTime(at('19:30'));
    flags();
    seedUser('open', { currentStreak: 5, lastActivityDate: '2026-10-20' });
    seedUser('one', { currentStreak: 1, lastActivityDate: '2026-10-20' });
    seedUser('counted', { currentStreak: 6, lastActivityDate: TODAY });
    seedUser('steps', { currentStreak: 4, lastActivityDate: '2026-10-20' });
    store.set(`dailyActivity/steps_${TODAY}`, { steps: 9000, stepsGoal: 8000, categories: {} });
    seedUser('worked', { currentStreak: 4, lastActivityDate: '2026-10-20' });
    store.set('workouts/w1', { userId: 'worked', date: at('08:00'), duration: 15 * 60 });
    seedUser('broken', { currentStreak: 9, lastActivityDate: '2026-10-18' });

    const stats = await run(at('19:30'));
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-open']]);
    expect(stats.closed).toBe(2);
    expect(sentMessages[0].notification?.title).toBeTruthy();
    expect(store.get('push_rate/open')?.streakPush?.rescue).toBe(TODAY);

    await run(at('19:30'));
    expect(sentMessages).toHaveLength(1);
  });

  it('Kelly coordination: a Kelly proactive message today skips our slot; otherwise ours sends', async () => {
    vi.setSystemTime(at('19:30'));
    flags();
    seedUser('kelly_today', { currentStreak: 5, lastActivityDate: '2026-10-20' });
    store.set('ai_coach_proactive/kelly_today', { lastSentDate: TODAY });
    seedUser('kelly_yesterday', { currentStreak: 5, lastActivityDate: '2026-10-20' });
    store.set('ai_coach_proactive/kelly_yesterday', { lastSentDate: '2026-10-20' });
    seedUser('no_kelly', { currentStreak: 5, lastActivityDate: '2026-10-20' });

    const stats = await run(at('19:30'));
    expect(stats.skippedKelly).toBe(1);
    expect(sentMessages.map((m) => m.tokens[0]).sort()).toEqual(['tok-kelly_yesterday', 'tok-no_kelly']);
  });

  it('daily cap: the 19:30 rescue is counted but has priority; the 21:15 one respects the cap', async () => {
    vi.setSystemTime(at('19:30'));
    flags();
    seedUser('full', { currentStreak: 8, lastActivityDate: '2026-10-20' });
    store.set('push_rate/full', { dailyEngagementDate: TODAY, dailyEngagementCount: 3 });
    await run(at('19:30'));
    expect(sentMessages).toHaveLength(1);
    expect(store.get('push_rate/full')?.dailyEngagementCount).toBe(4);

    vi.setSystemTime(at('21:15'));
    await run(at('21:15'));
    expect(sentMessages).toHaveLength(1);
  });

  it('21:15: only streak ≥7, only when the 19:30 push was not opened', async () => {
    vi.setSystemTime(at('21:15'));
    flags();
    seedUser('short', { currentStreak: 5, lastActivityDate: '2026-10-20' });
    seedUser('opened', { currentStreak: 8, lastActivityDate: '2026-10-20' });
    store.set('push_rate/opened', { streakPush: { rescue: TODAY, rescuePushId: 'p1' } });
    store.set('push_events/p1_opened_push_opened', { eventType: 'push_opened' });
    seedUser('ignored', { currentStreak: 8, lastActivityDate: '2026-10-20' });
    store.set('push_rate/ignored', { streakPush: { rescue: TODAY, rescuePushId: 'p2' } });

    await run(at('21:15'));
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-ignored']]);
  });

  it('10:00 broken: once, only for a streak of 7+ that broke yesterday, not when yesterday was closed by data', async () => {
    vi.setSystemTime(at('10:00'));
    flags();
    seedUser('long', { currentStreak: 12, longestStreak: 20, lastActivityDate: '2026-10-19' });
    seedUser('short', { currentStreak: 4, lastActivityDate: '2026-10-19' });
    seedUser('stale', { currentStreak: 12, lastActivityDate: '2026-10-16' }); // broke days ago
    seedUser('bg_steps', { currentStreak: 12, lastActivityDate: '2026-10-19' });
    store.set('dailyActivity/bg_steps_2026-10-20', { steps: 10000, stepsGoal: 8000, categories: {} });

    await run(at('10:00'));
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-long']]);
    expect(sentMessages[0].notification?.body).toContain('20');
    await run(at('10:00'));
    expect(sentMessages).toHaveLength(1);
  });

  it('Saturday rule (enable_shabbat_free_streak): a missed Saturday is not "broken", and no rescue on Saturday', async () => {
    // Sunday 25.10 10:00 (Israel is UTC+2 after 25.10 03:00).
    const sun = Date.parse('2026-10-25T10:00:00+02:00');
    vi.setSystemTime(sun);
    flags({ enable_shabbat_free_streak: true });
    seedUser('fri', { currentStreak: 10, lastActivityDate: '2026-10-23' });
    await run(sun);
    expect(sentMessages).toHaveLength(0);

    const policy = { shabbatFree: true, shields: false };
    expect(candidateFor('rescue', 'x', { currentStreak: 5, lastActivityDate: '2026-10-23' }, '2026-10-24', policy)).toBeNull();
    expect(candidateFor('rescue', 'x', { currentStreak: 5, lastActivityDate: '2026-10-23' }, '2026-10-24', { shabbatFree: false, shields: false })).not.toBeNull();
  });

  it('shields (enable_streak_shields): a shield keeps the streak alive → rescue, not broken', () => {
    const policy = { shabbatFree: false, shields: true };
    const doc = { currentStreak: 9, lastActivityDate: '2026-10-19', shields: 1 };
    expect(candidateFor('broken', 'x', doc, TODAY, policy)).toBeNull();
    expect(candidateFor('rescue', 'x', doc, TODAY, policy)).not.toBeNull();
    expect(candidateFor('broken', 'x', { ...doc, shields: 0 }, TODAY, policy)).not.toBeNull();
  });

  it('20:00 milestone: reached today and not seen in the app → push; seen → none', async () => {
    vi.setSystemTime(at('20:00'));
    flags();
    seedUser('m7', { currentStreak: 7, lastActivityDate: TODAY });
    seedUser('seen', { currentStreak: 30, lastActivityDate: TODAY, milestoneSeen: 30 });
    seedUser('plain', { currentStreak: 8, lastActivityDate: TODAY });

    await run(at('20:00'));
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-m7']]);
    expect(sentMessages[0].notification?.title).toBe('שבוע שלם');
  });
});
