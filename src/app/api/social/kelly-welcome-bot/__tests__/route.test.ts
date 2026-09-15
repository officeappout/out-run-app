import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// Pins the fix (10.09.2026): the original client-side triggerKellyWelcomeBot
// could never succeed (DM-creation rule requires both participants to
// resolve to an adult users/{uid} doc — system_kelly_coach never existed —
// and message-creation requires the acting caller to BE the sender, never
// true for a "system bot"). Moved server-side (Admin SDK bypasses both
// rules) with everything — flag check, chat doc, message doc, flag flip —
// inside one transaction, specifically so two callers (the primary
// onboarding-completion trigger and the login-time catch-up hook) calling
// this concurrently can never produce two greetings: whichever transaction
// commits first flips the flag, and the second one's read of that flag
// inside its own transaction sees it already true.
//
// Hand-rolled mock (no shared Firestore test-utils helper anywhere in this
// repo — same convention as complete-profile/route.test.ts): a runTransaction
// that hands the callback a tx object backed by the same in-memory USERS/
// CHATS maps a plain get()/set() would use, so read-then-write ordering
// inside the transaction is exercised for real, not just individual calls.

const state = vi.hoisted(() => ({
  USERS: {} as Record<string, any>,
  CHATS: {} as Record<string, any>,
  writes: [] as Array<{ collection: string; id: string; op: 'set' | 'update'; data: Record<string, any> }>,
}));

vi.mock('server-only', () => ({}));

function makeDocRef(collectionPath: string, id: string): any {
  return {
    __collection: collectionPath,
    __id: id,
    collection: (subName: string) => ({
      doc: (subId?: string) => makeDocRef(`${collectionPath}/${id}/${subName}`, subId ?? 'auto_msg_id'),
    }),
  };
}

vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({
    verifyIdToken: vi.fn(async () => ({ uid: 'test-uid' })),
  }),
  getAdminDb: () => ({
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
    }),
    runTransaction: async (fn: (tx: any) => Promise<any>) => {
      const tx = {
        get: async (ref: any) => {
          const store = ref.__collection === 'users' ? state.USERS : ref.__collection === 'chats' ? state.CHATS : null;
          if (!store) throw new Error(`unexpected get on collection: ${ref.__collection}`);
          const data = store[ref.__id];
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: any, data: Record<string, any>) => {
          state.writes.push({ collection: ref.__collection, id: ref.__id, op: 'set', data });
          const store = ref.__collection === 'users' ? state.USERS : ref.__collection === 'chats' ? state.CHATS : null;
          if (store) store[ref.__id] = data;
        },
        update: (ref: any, data: Record<string, any>) => {
          state.writes.push({ collection: ref.__collection, id: ref.__id, op: 'update', data });
          const store = ref.__collection === 'users' ? state.USERS : ref.__collection === 'chats' ? state.CHATS : null;
          if (store) store[ref.__id] = { ...(store[ref.__id] ?? {}), ...data };
        },
      };
      return fn(tx);
    },
  }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'SERVER_TS' },
}));

import { POST } from '../route';

function fakeRequest(hasToken = true): NextRequest {
  return {
    headers: { get: (key: string) => (key === 'Authorization' && hasToken ? 'Bearer faketoken' : null) },
  } as unknown as NextRequest;
}

function writesFor(collection: string, id: string) {
  return state.writes.filter((w) => w.collection === collection && w.id === id);
}

beforeEach(() => {
  state.USERS = {};
  state.CHATS = {};
  state.writes = [];
});

describe('POST /api/social/kelly-welcome-bot', () => {
  it('missing auth token → 401, no writes', async () => {
    const res = await POST(fakeRequest(false));
    expect(res.status).toBe(401);
    expect(state.writes).toEqual([]);
  });

  it('fresh user, no prior flag, no existing chat → creates chat + message + flips flag, in one transaction', async () => {
    state.USERS['test-uid'] = { core: { name: 'דנה', gender: 'female' } };

    const res = await POST(fakeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(true);

    const chatId = ['test-uid', 'system_kelly_coach'].sort().join('_');

    const chatWrites = writesFor('chats', chatId);
    expect(chatWrites).toHaveLength(1);
    expect(chatWrites[0].op).toBe('set');
    expect(chatWrites[0].data.participants.sort()).toEqual(['system_kelly_coach', 'test-uid'].sort());
    expect(chatWrites[0].data.lastSenderId).toBe('system_kelly_coach');
    expect(chatWrites[0].data.unreadCount['test-uid']).toBe(1);
    expect(chatWrites[0].data.unreadCount['system_kelly_coach']).toBe(0);
    expect(chatWrites[0].data.lastMessage).toContain('דנה');

    const messageWrites = writesFor(`chats/${chatId}/messages`, 'auto_msg_id');
    expect(messageWrites).toHaveLength(1);
    expect(messageWrites[0].data.senderUid).toBe('system_kelly_coach');
    expect(messageWrites[0].data.text).toBe(chatWrites[0].data.lastMessage);

    const userWrites = writesFor('users', 'test-uid');
    expect(userWrites).toHaveLength(1);
    expect(userWrites[0].data.hasWelcomeBotTriggered).toBe(true);
  });

  it('hasWelcomeBotTriggered already true → no writes at all, sent:false', async () => {
    state.USERS['test-uid'] = { core: { name: 'דנה' }, hasWelcomeBotTriggered: true };

    const res = await POST(fakeRequest());
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.reason).toBe('already-triggered');
    expect(state.writes).toEqual([]);
  });

  it('calling twice — the transaction makes the second call a no-op (the concurrency guarantee this whole design exists for)', async () => {
    state.USERS['test-uid'] = { core: { name: 'דנה' } };

    const first = await POST(fakeRequest());
    const firstBody = await first.json();
    expect(firstBody.sent).toBe(true);

    const second = await POST(fakeRequest());
    const secondBody = await second.json();
    expect(secondBody.sent).toBe(false);
    expect(secondBody.reason).toBe('already-triggered');

    const chatId = ['test-uid', 'system_kelly_coach'].sort().join('_');
    // Exactly one chat doc write and one message write total, not two.
    expect(writesFor('chats', chatId).filter((w) => w.op === 'set')).toHaveLength(1);
    expect(writesFor(`chats/${chatId}/messages`, 'auto_msg_id')).toHaveLength(1);
  });

  it('defensive case: chat already exists but flag was never flipped → flips the flag without sending a second message', async () => {
    state.USERS['test-uid'] = { core: { name: 'דנה' } };
    const chatId = ['test-uid', 'system_kelly_coach'].sort().join('_');
    state.CHATS[chatId] = { participants: ['test-uid', 'system_kelly_coach'], lastMessage: 'already here' };

    const res = await POST(fakeRequest());
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.reason).toBe('chat-already-existed');

    // No new chat/message write — only the user flag flips.
    expect(writesFor('chats', chatId)).toEqual([]);
    expect(writesFor(`chats/${chatId}/messages`, 'auto_msg_id')).toEqual([]);
    const userWrites = writesFor('users', 'test-uid');
    expect(userWrites).toHaveLength(1);
    expect(userWrites[0].data.hasWelcomeBotTriggered).toBe(true);
  });

  it('user doc missing entirely → sent:false, no writes', async () => {
    const res = await POST(fakeRequest());
    const body = await res.json();
    expect(body.sent).toBe(false);
    expect(body.reason).toBe('user-not-found');
    expect(state.writes).toEqual([]);
  });
});
