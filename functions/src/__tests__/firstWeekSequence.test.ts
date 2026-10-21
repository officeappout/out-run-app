import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * First-week sequence + second-workout push (firstWeekSequenceEnabled, default
 * off) — in-memory Firestore + the REAL push.service.
 */
vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));
const writePushSentEvent = vi.fn(async (_o: Record<string, unknown>) => {});
vi.mock('../services/push-events.service', () => ({ writePushSentEvent: (o: Record<string, unknown>) => writePushSentEvent(o) }));

import { store, sentMessages, fakeDb } from './helpers/fake-firestore';
import { runFirstWeekPass, runSecondWorkoutPass } from '../firstWeekSequence';
import { runFirstWorkoutTick } from '../firstWorkoutScheduler';
import { __resetEngagementFlagsCache } from '../services/push-tone.service';
import { __resetPushPolicyFlagCache } from '../services/push.service';

const H = 3_600_000;
const D = 24 * H;
// Wednesday 2026-10-21 17:00 Israel (UTC+3).
const AT17 = Date.UTC(2026, 9, 21, 14, 0, 0);
const AT18 = AT17 + H;
// Signed up Monday 2026-10-19 12:00 Israel → day 2 on the 21st.
const SIGNUP_D2 = Date.UTC(2026, 9, 19, 9, 0, 0);

function seedUser(uid: string, createdAt: number, extra: Record<string, unknown> = {}) {
  store.set(`users/${uid}`, {
    onboardingStatus: 'COMPLETED',
    createdAt,
    fcmTokens: [`tok-${uid}`],
    settings: { pushEnabled: true },
    core: { name: 'דנה כהן', gender: 'female', ageGroup: 'adult', birthDate: Date.UTC(1990, 0, 1) },
    ...extra,
  });
}

describe('first-week sequence', () => {
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    writePushSentEvent.mockClear();
    __resetEngagementFlagsCache();
    __resetPushPolicyFlagCache();
    vi.useFakeTimers();
    vi.setSystemTime(AT17);
  });
  afterEach(() => vi.useRealTimers());

  it('flag off → the tick runs only the legacy pass (17:00), nothing from the sequence', async () => {
    seedUser('u1', SIGNUP_D2);
    expect(await runFirstWorkoutTick(fakeDb as never, AT17)).toBe('legacy');
    expect(await runFirstWorkoutTick(fakeDb as never, AT18)).toBe('idle');
    expect(sentMessages).toHaveLength(0); // firstWorkoutPushEnabled is off too
  });

  it('day 2 at 17:00: one low-bar push, tone + lever recorded, once per day', async () => {
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', SIGNUP_D2);
    expect(await runFirstWorkoutTick(fakeDb as never, AT17)).toBe('sequence');
    expect(sentMessages.map((m) => m.tokens)).toEqual([['tok-u1']]);
    expect(sentMessages[0].data?.day).toBe('d2');
    expect(sentMessages[0].data?.lever).toBe('low_bar');
    expect(['cute', 'personal', 'curious', 'friendly']).toContain(sentMessages[0].data?.tone);
    expect(store.get('push_rate/u1')?.firstWeek_sent).toEqual(['d2']);
    expect(writePushSentEvent.mock.calls[0][0]).toMatchObject({ pushType: 'first_week', lever: 'low_bar' });
    expect(writePushSentEvent.mock.calls[0][0].tone).toBe(sentMessages[0].data?.tone);

    await runFirstWeekPass(fakeDb as never, AT17);
    expect(sentMessages).toHaveLength(1);
  });

  it('not at another hour; stops on the first workout', async () => {
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', SIGNUP_D2);
    await runFirstWeekPass(fakeDb as never, AT18);
    expect(sentMessages).toHaveLength(0);
    store.set('workouts/w1', { userId: 'u1', date: AT17 - 5 * H });
    const stats = await runFirstWeekPass(fakeDb as never, AT17);
    expect(sentMessages).toHaveLength(0);
    expect(stats.skipped.trained).toBe(1);
  });

  it('Kelly wrote a proactive message today → our slot is skipped', async () => {
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', SIGNUP_D2);
    store.set('ai_coach_proactive/u1', { lastSentDate: '2026-10-21' });
    const stats = await runFirstWeekPass(fakeDb as never, AT17);
    expect(sentMessages).toHaveLength(0);
    expect(stats.skipped.kelly_today).toBe(1);
  });

  it('no Kelly (minor, no entitlement, AI off) or Kelly yesterday → ours sends', async () => {
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', SIGNUP_D2);
    seedUser('u2', SIGNUP_D2);
    store.set('ai_coach_proactive/u2', { lastSentDate: '2026-10-20' });
    await runFirstWeekPass(fakeDb as never, AT17);
    expect(sentMessages.map((m) => m.tokens[0]).sort()).toEqual(['tok-u1', 'tok-u2']);
  });

  it('day 3 social without a real park count → no push (in-app card only)', async () => {
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', SIGNUP_D2 - D);
    const stats = await runFirstWeekPass(fakeDb as never, AT17);
    expect(sentMessages).toHaveLength(0);
    expect(stats.skipped.no_social_data).toBe(1);
  });

  it('a 60+ user never gets the casual tone', async () => {
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    for (let i = 0; i < 8; i++) {
      seedUser(`old${i}`, SIGNUP_D2, { core: { name: 'משה', gender: 'male', ageGroup: 'adult', birthDate: Date.UTC(1950, 0, 1) } });
    }
    await runFirstWeekPass(fakeDb as never, AT17);
    expect(sentMessages).toHaveLength(8);
    for (const m of sentMessages) expect(m.data?.tone).not.toBe('friendly');
  });

  it('second workout: one workout 24–48h ago → one push at 18:00, once', async () => {
    vi.setSystemTime(AT18);
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', AT18 - 10 * D, { progression: { workoutCount: 1 } });
    store.set('workouts/w1', { userId: 'u1', date: AT18 - 30 * H });
    seedUser('u2', AT18 - 10 * D, { progression: { workoutCount: 2 } });
    await runFirstWorkoutTick(fakeDb as never, AT18);
    expect(sentMessages.filter((m) => m.data?.triggerType === 'SecondWorkout').map((m) => m.tokens)).toEqual([['tok-u1']]);
    expect(store.get('push_rate/u1')?.secondWorkout_sentFor).toBe(AT18 - 30 * H);
    await runSecondWorkoutPass(fakeDb as never, AT18 + 10 * 60_000);
    expect(sentMessages.filter((m) => m.data?.triggerType === 'SecondWorkout')).toHaveLength(1);
  });

  it('second workout: skipped when Kelly already wrote today', async () => {
    vi.setSystemTime(AT18);
    store.set('app_config/feature_flags', { firstWeekSequenceEnabled: true });
    seedUser('u1', AT18 - 10 * D, { progression: { workoutCount: 1 } });
    store.set('workouts/w1', { userId: 'u1', date: AT18 - 30 * H });
    store.set('ai_coach_proactive/u1', { lastSentDate: '2026-10-21' });
    await runSecondWorkoutPass(fakeDb as never, AT18);
    expect(sentMessages).toHaveLength(0);
  });
});
