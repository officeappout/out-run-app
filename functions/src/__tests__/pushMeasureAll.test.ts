import { describe, it, expect, vi, beforeEach } from 'vitest';

/** enable_push_measure_all (default off) — pure resolver + the real sendPush on a fake Firestore. */
vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const writePushSentEvent = vi.fn(async (_opts: Record<string, unknown>) => {});
vi.mock('../services/push-events.service', () => ({
  writePushSentEvent: (opts: Record<string, unknown>) => writePushSentEvent(opts),
}));

import { store, sentMessages } from './helpers/fake-firestore';
import { sendPush, __resetPushPolicyFlagCache } from '../services/push.service';
import {
  PUSH_TYPE_IDS,
  __resetPushMeasureAllCache,
  accumulateUidDelivery,
  defaultMeasurement,
  isPushMeasureAllEnabled,
  resolveSendMeasurement,
} from '../services/push-measure-all';

const explicit = { variantId: 'row1', category: 'Daily_Goal', persona: 'p' };

describe('resolveSendMeasurement (pure)', () => {
  it('flag off → exactly the caller\'s measurement, never a typeId', () => {
    expect(resolveSendMeasurement(undefined, 'LevelUp', false)).toEqual({ measurement: undefined, typeId: undefined });
    const r = resolveSendMeasurement(explicit, 'X', false);
    expect(r.measurement).toBe(explicit);
    expect(r.typeId).toBeUndefined();
  });
  it('flag on + explicit → kept, typeId = its category', () => {
    const r = resolveSendMeasurement(explicit, 'Ignored', true);
    expect(r.measurement).toBe(explicit);
    expect(r.typeId).toBe('Daily_Goal');
  });
  it('flag on + type only → default measurement under that id', () => {
    expect(resolveSendMeasurement(undefined, 'Kudos', true)).toEqual({
      measurement: { variantId: 'default:Kudos', category: 'Kudos', persona: 'all' },
      typeId: 'Kudos',
    });
    expect(defaultMeasurement('X').category).toBe('X');
  });
  it('flag on + neither → nothing', () => {
    expect(resolveSendMeasurement(undefined, undefined, true)).toEqual({ measurement: undefined, typeId: undefined });
  });
  it('type ids are unique', () => {
    const ids = Object.entries(PUSH_TYPE_IDS).filter(([k]) => k !== 'retention').map(([, v]) => v);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('accumulateUidDelivery (pure)', () => {
  it('a uid is delivered if ANY token succeeded; a thrown batch marks unknown uids failed', () => {
    const m = new Map<string, boolean>();
    const owners = new Map([['t1', 'a'], ['t2', 'a'], ['t3', 'b']]);
    accumulateUidDelivery(m, ['t1', 't2', 't3'], owners, [false, true, false]);
    expect(Object.fromEntries(m)).toEqual({ a: true, b: false });
    accumulateUidDelivery(m, ['t3', 'tx'], owners, null);
    expect(Object.fromEntries(m)).toEqual({ a: true, b: false });
  });
});

describe('isPushMeasureAllEnabled', () => {
  beforeEach(() => { store.clear(); __resetPushMeasureAllCache(); });
  it('missing doc / key → off (fail-closed); true → on', async () => {
    expect(await isPushMeasureAllEnabled()).toBe(false);
    __resetPushMeasureAllCache();
    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    expect(await isPushMeasureAllEnabled()).toBe(true);
  });
});

describe('sendPush with enable_push_measure_all', () => {
  const push = (over: Record<string, unknown> = {}) =>
    sendPush({ toUids: ['u1'], channel: 'progression', title: 't', body: 'b', rateCapHours: 0, ...over } as never);

  beforeEach(() => {
    store.clear();
    sentMessages.length = 0;
    writePushSentEvent.mockClear();
    __resetPushMeasureAllCache();
    __resetPushPolicyFlagCache();
    store.set('users/u1', { fcmTokens: ['tok'], settings: { pushEnabled: true } });
  });

  it('flag off: a type-only sender sends the same payload as before, no push_events write', async () => {
    const before = await push();
    const payloadBefore = sentMessages[0].data;
    sentMessages.length = 0;
    const tagged = await push({ measurementTypeId: PUSH_TYPE_IDS.levelUp });
    expect(tagged.delivered).toBe(before.delivered);
    expect(sentMessages[0].data).toEqual(payloadBefore);
    expect(sentMessages[0].data?.messageId).toBeUndefined();
    expect(tagged.pushId).toBeUndefined();
    expect(writePushSentEvent).not.toHaveBeenCalled();
  });

  it('flag off: an explicitly measured sender writes exactly as before (no typeId)', async () => {
    await push({ measurement: explicit, measurementTypeId: 'Ignored' });
    expect(writePushSentEvent).toHaveBeenCalledTimes(1);
    expect(writePushSentEvent.mock.calls[0][0]).not.toHaveProperty('typeId');
    expect(writePushSentEvent.mock.calls[0][0]).toMatchObject({ category: 'Daily_Goal', uid: 'u1' });
  });

  it('flag on: a type-only sender is measured — messageId stamped, push_sent with typeId', async () => {
    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    const r = await push({ measurementTypeId: PUSH_TYPE_IDS.levelUp });
    expect(r.pushId).toBeTruthy();
    expect(sentMessages[0].data?.messageId).toBe(r.pushId);
    expect(writePushSentEvent).toHaveBeenCalledTimes(1);
    expect(writePushSentEvent.mock.calls[0][0]).toMatchObject({
      pushId: r.pushId,
      uid: 'u1',
      delivered: true,
      category: 'LevelUp',
      variantId: 'default:LevelUp',
      typeId: 'LevelUp',
      channel: 'progression',
    });
  });

  it('flag on: an explicitly measured sender also gets typeId = its category', async () => {
    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    await push({ measurement: explicit });
    expect(writePushSentEvent.mock.calls[0][0]).toMatchObject({ category: 'Daily_Goal', typeId: 'Daily_Goal' });
  });

  it('flag on: a sender carrying its own messageId (queue broadcast) keeps it as the pushId', async () => {
    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    const r = await push({ measurementTypeId: PUSH_TYPE_IDS.broadcast, data: { messageId: 'queue123' } });
    expect(r.pushId).toBe('queue123');
    expect(sentMessages[0].data?.messageId).toBe('queue123');
    expect(writePushSentEvent.mock.calls[0][0]).toMatchObject({ pushId: 'queue123', typeId: 'AdminBroadcast' });
  });

  it('flag on: an untagged sender stays unmeasured', async () => {
    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    const r = await push();
    expect(r.pushId).toBeUndefined();
    expect(writePushSentEvent).not.toHaveBeenCalled();
  });
});
