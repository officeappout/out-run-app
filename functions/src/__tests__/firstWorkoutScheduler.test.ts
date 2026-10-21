import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * firstWorkoutScheduler (push-lifecycle audit, gap 7) — in-memory Firestore
 * + the REAL push.service. Flag firstWorkoutPushEnabled, default off.
 */
vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('../services/push-events.service', () => ({ writePushSentEvent: vi.fn(async () => {}) }));

import { store, sentMessages, fakeDb } from './helpers/fake-firestore';
import { runFirstWorkoutPass } from '../firstWorkoutScheduler';

const H = 3_600_000;
// Thursday 2026-09-10 17:00 Israel (UTC+3).
const NOW = Date.UTC(2026, 8, 10, 14, 0, 0);

function seedUser(uid: string, hoursAgo: number, extra: Record<string, unknown> = {}) {
  store.set(`users/${uid}`, {
    onboardingStatus: 'COMPLETED',
    createdAt: NOW - hoursAgo * H,
    fcmTokens: [`tok-${uid}`],
    settings: { pushEnabled: true },
    core: { name: 'דנה כהן' },
    ...extra,
  });
}

const run = () => runFirstWorkoutPass(fakeDb as never, NOW);

describe('firstWorkoutScheduler', () => {
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('flag off (default) → nothing', async () => {
    seedUser('u1', 30);
    await run();
    expect(sentMessages).toHaveLength(0);
  });

  it('day 1 and day 2 after signup, no workout yet → one push each, track-aware, then never again', async () => {
    store.set('app_config/feature_flags', { firstWorkoutPushEnabled: true });
    seedUser('run1', 30, { running: { isUnlocked: true } });

    await run();
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-run1']]);
    expect(sentMessages[0].notification?.title).toContain('ריצה');
    expect(store.get('push_rate/run1')?.firstWorkout_sent).toEqual(['day1']);

    // Same window again (a re-run the same day) → nothing.
    await run();
    expect(sentMessages).toHaveLength(1);

    // Day 2: the user doc's createdAt moves back 24h.
    seedUser('run1', 54, { running: { isUnlocked: true } });
    store.set('push_rate/run1', { firstWorkout_sent: ['day1'] }); // the rate cap is not what stops it
    await run();
    expect(sentMessages).toHaveLength(2);
    expect(store.get('push_rate/run1')?.firstWorkout_sent).toEqual(['day1', 'day2']);
  });

  it('not before 24h, not after 72h, not after a workout, not for demo users', async () => {
    store.set('app_config/feature_flags', { firstWorkoutPushEnabled: true });
    seedUser('fresh', 10);
    seedUser('old', 100);
    seedUser('trained', 30);
    store.set('workouts/w1', { userId: 'trained', date: NOW - 5 * H });
    seedUser('ranlog', 30, { running: { isUnlocked: true, lastWorkoutDate: '2026-09-09' } });
    seedUser('demo_x', 30);

    const stats = await run();
    expect(sentMessages).toHaveLength(0);
    expect(stats.trained).toBe(1);
  });

  it('respects the user turning push off', async () => {
    store.set('app_config/feature_flags', { firstWorkoutPushEnabled: true });
    seedUser('off', 30, { settings: { pushEnabled: false } });
    await run();
    expect(sentMessages).toHaveLength(0);
    expect(store.get('push_rate/off')?.firstWorkout_sent).toBeUndefined();
  });
});
