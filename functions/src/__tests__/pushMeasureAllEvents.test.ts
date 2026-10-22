import { describe, it, expect, vi, beforeEach } from 'vitest';

/** enable_push_measure_all — the push_events side (real push-events.service + onPushOpened on a fake Firestore). */
vi.mock('firebase-admin', async () => {
  const mod = (await import('./helpers/fake-firestore')).fakeAdminModule();
  // The shared fake has no Timestamp.now — push-events.service stamps sentAt/checkedAt with it.
  mod.firestore.Timestamp = { ...mod.firestore.Timestamp, now: () => ({ toMillis: () => 0 }) };
  return mod;
});
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_o: unknown, h: unknown) => h,
}));

import { store, docRef, sentMessages } from './helpers/fake-firestore';
import {
  activateOutcomeWindowDetailed,
  writeLegacyPushSentEvents,
  writePostPushOutcomeEvent,
} from '../services/push-events.service';
import { __resetPushMeasureAllCache } from '../services/push-measure-all';
import { onPushOpened } from '../onPushOpened';
import { chatMessageNotification } from '../chatMessageNotification';

const handler = onPushOpened as unknown as (e: unknown) => Promise<void>;
const created = (path: string) => ({
  params: { eventId: path.split('/').pop() },
  data: { data: () => store.get(path), ref: docRef(path) },
});

function sent(pushId: string, uid: string, extra: Record<string, unknown> = {}) {
  store.set(`push_events/${pushId}_${uid}_push_sent`, {
    pushId, uid, eventType: 'push_sent', category: 'X', outcomeWindowHours: 6, outcomeChecked: false, ...extra,
  });
}

beforeEach(() => {
  store.clear();
  __resetPushMeasureAllCache();
});

describe('legacy push_sent writes', () => {
  it('one push_sent per attempted uid, default measurement + typeId', async () => {
    await writeLegacyPushSentEvents({
      pushId: 'p1',
      channel: 'chat',
      typeId: 'ChatMessage',
      uidDelivered: new Map([['a', true], ['b', false]]),
    });
    expect(store.get('push_events/p1_a_push_sent')).toMatchObject({
      eventType: 'push_sent', delivered: true, category: 'ChatMessage', variantId: 'default:ChatMessage', typeId: 'ChatMessage', channel: 'chat', checkAfter: null,
    });
    expect(store.get('push_events/p1_b_push_sent')).toMatchObject({ delivered: false, typeId: 'ChatMessage' });
  });
});

describe('typeId on open / outcome records', () => {
  it('activateOutcomeWindowDetailed returns the sibling typeId (null when absent)', async () => {
    sent('p1', 'u', { typeId: 'Kudos' });
    sent('p2', 'u');
    expect(await activateOutcomeWindowDetailed({ pushId: 'p1', uid: 'u', openedAtMillis: 1000 })).toEqual({ activated: true, typeId: 'Kudos' });
    expect(await activateOutcomeWindowDetailed({ pushId: 'p2', uid: 'u', openedAtMillis: 1000 })).toEqual({ activated: true, typeId: null });
    expect(await activateOutcomeWindowDetailed({ pushId: 'nope', uid: 'u', openedAtMillis: 1000 })).toEqual({ activated: false, typeId: null });
  });

  it('onPushOpened stamps typeId on push_opened only when push_sent has one (flag-off sends untouched)', async () => {
    const openedAt = { toMillis: () => 5000 };
    sent('p1', 'u', { typeId: 'LevelUp' });
    store.set('push_events/p1_u_push_opened', { pushId: 'p1', uid: 'u', eventType: 'push_opened', channel: 'progression', openedAt });
    await handler(created('push_events/p1_u_push_opened'));
    expect(store.get('push_events/p1_u_push_opened')?.typeId).toBe('LevelUp');

    sent('p2', 'u');
    const before = { pushId: 'p2', uid: 'u', eventType: 'push_opened', channel: 'progression', openedAt };
    store.set('push_events/p2_u_push_opened', before);
    await handler(created('push_events/p2_u_push_opened'));
    expect(store.get('push_events/p2_u_push_opened')).toEqual(before);
  });

  it('landing_screen: flag off → no read, no write; flag on → typeId stamped', async () => {
    sent('p1', 'u', { typeId: 'Kudos' });
    const landing = { pushId: 'p1', uid: 'u', eventType: 'landing_screen', channel: 'social', landingPath: '/x' };
    store.set('push_events/p1_u_landing_screen', { ...landing });
    await handler(created('push_events/p1_u_landing_screen'));
    expect(store.get('push_events/p1_u_landing_screen')).toEqual(landing);

    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    __resetPushMeasureAllCache();
    await handler(created('push_events/p1_u_landing_screen'));
    expect(store.get('push_events/p1_u_landing_screen')?.typeId).toBe('Kudos');
  });

  it('post_push_outcome carries typeId when push_sent has it, and no typeId key otherwise', async () => {
    sent('p1', 'u', { typeId: 'WeekStart' });
    sent('p2', 'u');
    for (const id of ['p1', 'p2']) {
      const path = `push_events/${id}_u_push_sent`;
      await writePostPushOutcomeEvent({
        pushSentDoc: { data: () => store.get(path), ref: docRef(path) } as never,
        outcomeAchieved: false,
        outcomeType: 'workout_started',
      });
    }
    expect(store.get('push_events/p1_u_post_push_outcome')?.typeId).toBe('WeekStart');
    expect(store.get('push_events/p2_u_post_push_outcome')).not.toHaveProperty('typeId');
  });
});

describe('legacy direct-FCM path (chat, pushRouting off)', () => {
  const chatHandler = chatMessageNotification as unknown as (e: unknown) => Promise<void>;
  const fire = () =>
    chatHandler({ params: { chatId: 'c1', messageId: 'm1' }, data: { data: () => ({ senderUid: 's', senderName: 'S', text: 'hi' }) } });
  const pushEventDocs = () => Array.from(store.keys()).filter((k) => k.startsWith('push_events/'));

  beforeEach(() => {
    sentMessages.length = 0;
    store.set('app_config/feature_flags', { chatNotificationsEnabled: true });
    store.set('chats/c1', { participants: ['s', 'r'], type: 'dm' });
    store.set('users/r', { fcmTokens: ['tok'], settings: {} });
  });

  it('flag off: same payload as before (no messageId), no push_events writes', async () => {
    await fire();
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].data).toEqual({ chatId: 'c1', deepLink: '/chat/c1', channel: 'chat' });
    expect(pushEventDocs()).toEqual([]);
  });

  it('flag on: messageId stamped and one push_sent for the recipient, with typeId', async () => {
    store.set('system_config/feature_flags', { enable_push_measure_all: true });
    await fire();
    const pushId = sentMessages[0].data?.messageId;
    expect(pushId).toBeTruthy();
    expect(store.get(`push_events/${pushId}_r_push_sent`)).toMatchObject({ typeId: 'ChatMessage', delivered: true, channel: 'chat' });
  });
});
