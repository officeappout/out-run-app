import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * retentionScheduler under firstWorkoutPushEnabled (push-lifecycle audit,
 * gaps 7 + 8; owner-approved 21.10.2026): a user who never trained gets the
 * first-workout copy instead of "מוכן לחזור?", and the legacy 48h cadence
 * stops after RETENTION_LEGACY_MAX_SENDS per absence. Flag off = unchanged.
 */
vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
vi.mock('../services/push-events.service', () => ({ writePushSentEvent: vi.fn(async () => {}) }));

import { store, sentMessages } from './helpers/fake-firestore';
import { retentionScheduler } from '../retentionScheduler';
import { RETENTION_LEGACY_MAX_SENDS } from '../lib/push-lifecycle';

const DAY = 86_400_000;
// Thursday 2026-09-10 10:00 Israel.
const NOW = Date.UTC(2026, 8, 10, 7, 0, 0);
const ts = (ms: number) => ({ toMillis: () => ms });
const run = () => (retentionScheduler as unknown as () => Promise<void>)();

function seedLapsed(uid: string, extra: Record<string, unknown> = {}) {
  store.set(`users/${uid}`, {
    onboardingStatus: 'COMPLETED',
    lastActive: ts(NOW - 9 * DAY),
    fcmTokens: [`tok-${uid}`],
    settings: { pushEnabled: true },
    core: { name: 'דנה', gender: 'female' },
    progression: { domains: { full_body: { currentLevel: 2 } } },
    ...extra,
  });
}

const text = () => sentMessages.map((m) => `${m.notification?.title} ${m.notification?.body}`);

describe('retentionScheduler — lifecycle flag', () => {
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('flag off: a never-trained user still gets the regular retention copy (today\'s behaviour)', async () => {
    seedLapsed('n1');
    await run();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].data?.pushType).toBe('retention_lapse');
  });

  it('flag on: a never-trained user gets first-workout copy, never "לחזור"', async () => {
    store.set('app_config/feature_flags', { firstWorkoutPushEnabled: true });
    seedLapsed('n2');
    await run();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].data?.pushType).toBe('first_workout');
    expect(text()[0]).not.toMatch(/לחזור|חוזרים/);
  });

  it('flag on: a user who trained before still gets retention copy, and the cadence stops after the cap', async () => {
    store.set('app_config/feature_flags', { firstWorkoutPushEnabled: true });
    seedLapsed('t1');
    store.set('workouts/w1', { userId: 't1', date: ts(NOW - 9 * DAY) });

    await run();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].data?.pushType).toBe('retention_lapse');
    const anchor = store.get('push_rate/t1')?.retention_legacyAnchor;
    expect(store.get('push_rate/t1')?.retention_legacyCount).toBe(1);

    // Same absence, cap reached → nothing more.
    store.set('push_rate/t1', { retention_legacyAnchor: anchor, retention_legacyCount: RETENTION_LEGACY_MAX_SENDS });
    await run();
    expect(sentMessages).toHaveLength(1);
  });
});
