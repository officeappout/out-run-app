import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Push policy v2 (flag pushPolicyV2, default off) — pure rules + the real sendPush on a fake Firestore. */
vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../services/push-events.service', () => ({ writePushSentEvent: vi.fn(async () => {}) }));

import { store, sentMessages } from './helpers/fake-firestore';
import { sendPush, __resetPushPolicyFlagCache } from '../services/push.service';
import {
  appendPolicyLog,
  isPolicyQuietTime,
  policyBlockReason,
  policyDailyCap,
  type PolicyLogEntry,
} from '../lib/push-policy-v2';

const H = 3_600_000;
const D = 24 * H;
// Wednesday 2026-10-21 12:00 Israel (UTC+3).
const NOON = Date.UTC(2026, 9, 21, 9, 0, 0);
const atIsrael = (h: number, m = 0) => Date.UTC(2026, 9, 21, h - 3, m, 0);

describe('policy rules (pure)', () => {
  const base = { nowMs: NOON, dailyCap: 2, signupMs: NOON - 30 * D };
  it('daily cap 2 by default (min 1, high 3)', () => {
    expect(policyDailyCap(undefined)).toBe(2);
    expect(policyDailyCap({ notificationFrequency: 'min' })).toBe(1);
    expect(policyDailyCap({ notificationFrequency: 'high' })).toBe(3);
    const log: PolicyLogEntry[] = [{ t: NOON - 5 * H, k: 'proactive' }, { t: NOON - 4 * H, k: 'proactive' }];
    expect(policyBlockReason({ ...base, log, kind: 'proactive' })).toBe('daily_cap');
  });
  it('≥ 3 hours between proactive pushes', () => {
    expect(policyBlockReason({ ...base, log: [{ t: NOON - 2 * H, k: 'proactive' }], kind: 'proactive' })).toBe('spacing');
    expect(policyBlockReason({ ...base, log: [{ t: NOON - 3 * H, k: 'proactive' }], kind: 'proactive' })).toBeNull();
  });
  it('8 a week', () => {
    const log = Array.from({ length: 8 }, (_, i) => ({ t: NOON - (i + 1) * D + H, k: 'proactive' as const }));
    expect(policyBlockReason({ ...base, log: log.slice(0, 7), kind: 'proactive' })).toBeNull();
    expect(policyBlockReason({ ...base, log: [...log.slice(0, 7), { t: NOON - 6 * D, k: 'proactive' }], kind: 'proactive' })).toBe('weekly_cap');
  });
  it('first week: one push a day of any kind, except a streak rescue', () => {
    const fw = { ...base, signupMs: NOON - 2 * D };
    const log: PolicyLogEntry[] = [{ t: NOON - 4 * H, k: 'requested' }];
    expect(policyBlockReason({ ...fw, log, kind: 'proactive' })).toBe('first_week_daily');
    expect(policyBlockReason({ ...fw, log, kind: 'requested' })).toBe('first_week_daily');
    expect(policyBlockReason({ ...fw, log, kind: 'streak_rescue' })).toBeNull();
  });
  it('requested reminders are exempt from the proactive caps', () => {
    const log: PolicyLogEntry[] = [{ t: NOON - H, k: 'proactive' }, { t: NOON - 2 * H, k: 'proactive' }];
    expect(policyBlockReason({ ...base, log, kind: 'requested' })).toBeNull();
  });
  it('quiet hours: proactive 21:30–08:00, requested from 06:00', () => {
    expect(isPolicyQuietTime(atIsrael(7, 30), 'proactive')).toBe(true);
    expect(isPolicyQuietTime(atIsrael(8), 'proactive')).toBe(false);
    expect(isPolicyQuietTime(atIsrael(21, 29), 'proactive')).toBe(false);
    expect(isPolicyQuietTime(atIsrael(21, 30), 'proactive')).toBe(true);
    expect(isPolicyQuietTime(atIsrael(6), 'requested')).toBe(false);
    expect(isPolicyQuietTime(atIsrael(5, 59), 'requested')).toBe(true);
  });
  it('the log keeps 8 days', () => {
    const out = appendPolicyLog([{ t: NOON - 9 * D, k: 'proactive' }, { t: NOON - D, k: 'proactive' }], 'requested', NOON);
    expect(out).toEqual([{ t: NOON - D, k: 'proactive' }, { t: NOON, k: 'requested' }]);
  });
});

describe('sendPush with pushPolicyV2', () => {
  const push = (over: Record<string, unknown> = {}) =>
    sendPush({ toUids: ['u1'], channel: 'retention', title: 't', body: 'b', rateCapHours: 0, ...over } as never);
  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    __resetPushPolicyFlagCache();
    vi.useFakeTimers();
    store.set('users/u1', { fcmTokens: ['tok'], settings: { pushEnabled: true }, createdAt: NOON - 30 * D });
  });
  afterEach(() => vi.useRealTimers());

  it('flag off: the old rules (3 a day, quiet 22–07) — unchanged', async () => {
    vi.setSystemTime(atIsrael(7, 30));
    expect((await push()).delivered).toBe(1);
    vi.setSystemTime(atIsrael(8));
    expect((await push()).delivered).toBe(1);
    expect(store.get('push_rate/u1')?.policyLog).toBeUndefined();
  });

  it('flag on: 07:30 is quiet for proactive, open for a requested reminder; spacing and the log apply', async () => {
    store.set('app_config/feature_flags', { pushPolicyV2: true });
    vi.setSystemTime(atIsrael(7, 30));
    expect((await push()).skippedQuietHours).toBe(1);
    expect((await push({ channel: 'training_reminder', policyKind: 'requested' })).delivered).toBe(1);
    vi.setSystemTime(atIsrael(9));
    expect((await push()).delivered).toBe(1);
    vi.setSystemTime(atIsrael(10));
    const r = await push();
    expect(r.delivered).toBe(0);
    expect(r.skippedPolicy).toBe(1);
    expect(store.get('push_rate/u1')?.policyLog.map((e: PolicyLogEntry) => e.k)).toEqual(['requested', 'proactive']);
  });

  it('flag on, first week: the second push of the day is held; a streak rescue still goes', async () => {
    store.set('app_config/feature_flags', { pushPolicyV2: true });
    store.set('users/u1', { fcmTokens: ['tok'], settings: { pushEnabled: true }, createdAt: NOON - 2 * D });
    vi.setSystemTime(atIsrael(9));
    expect((await push()).delivered).toBe(1);
    vi.setSystemTime(atIsrael(19));
    expect((await push()).skippedPolicy).toBe(1);
    expect((await push({ policyKind: 'streak_rescue' })).delivered).toBe(1);
  });
});
