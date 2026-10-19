/**
 * Unified Kelly (kelly_unified_v1) — storage writes (thread-store.server against an in-memory
 * Admin SDK fake), the handoff flag path, the admin reply route (auth + effects), the user
 * thread route, and the Kelly team admin guard. No network, synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  autoId: 0,
  flags: { kellyUnifiedV1: true } as Record<string, boolean>,
  verifyUid: 'u1' as string | null,
  identity: null as null | { uid: string; email: string | null; admin: boolean },
  session: null as null | { uid: string; email: string | null; admin: boolean },
}));

vi.mock('server-only', () => ({}));

vi.mock('firebase-admin/firestore', () => {
  const Timestamp = { fromMillis: (ms: number) => ({ __ms: ms, toMillis: () => ms }), now: () => ({ __ms: 0, toMillis: () => 0 }) };
  const FieldValue = {
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => ({ __ts: true }),
    delete: () => ({ __del: true }),
  };
  return { Timestamp, FieldValue };
});

function apply(prev: Record<string, unknown>, next: Record<string, unknown>, merge: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = merge ? { ...prev } : {};
  for (const [k, v] of Object.entries(next)) {
    if (v && typeof v === 'object' && '__inc' in (v as object)) out[k] = ((out[k] as number) ?? 0) + (v as { __inc: number }).__inc;
    else if (v && typeof v === 'object' && '__del' in (v as object)) delete out[k];
    else out[k] = v;
  }
  return out;
}

function write(r: { __path: string }, data: Record<string, unknown>, o?: { merge?: boolean }) {
  st.docs.set(r.__path, apply(st.docs.get(r.__path) ?? {}, data, !!o?.merge));
}

function makeDb() {
  const ref = (path: string): any => ({
    id: path.split('/').pop(),
    __path: path,
    get: async () => {
      const d = st.docs.get(path);
      return { id: path.split('/').pop(), exists: d !== undefined, data: () => d };
    },
    collection: (name: string) => col(`${path}/${name}`),
    set: async (d: Record<string, unknown>, o?: { merge?: boolean }) => write({ __path: path }, d, o),
  });
  const col = (path: string): any => ({
    doc: (id?: string) => ref(`${path}/${id ?? `auto${++st.autoId}`}`),
  });
  return {
    collection: col,
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: any, d: any, o?: any) => ops.push(() => write(r, d, o)),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        get: (r: any) => r.get(),
        set: (r: any, d: any, o?: any) => write(r, d, o),
        update: (r: any, d: any) => write(r, d, { merge: true }),
      }),
  };
}

const db = makeDb();

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => db,
  getAdminAuth: () => ({
    verifyIdToken: async () => {
      if (!st.verifyUid) throw new Error('bad token');
      return { uid: st.verifyUid };
    },
  }),
  resolveIdentity: async () => {
    if (!st.identity) throw new Error('bad token');
    return st.identity;
  },
}));
vi.mock('@/lib/admin-session', () => ({
  SESSION_COOKIE_NAME: 'out_admin_session',
  verifyAdminSession: async () => st.session,
}));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ ...st.flags }) }));

import {
  appendMessage,
  appendNonAiMessage,
  appendTeamOnlyUserMessage,
  appendAiPausedUserMessage,
  claimPending,
  markNeedsHuman,
  savePending,
  markThreadRead,
} from '../thread-store.server';
import { executeServerTool, type ServerToolContext } from '../server-tools.server';
import { TEAM_MSG_MAX_PER_WINDOW } from '../unified-thread';
import { requireKellyTeamAdmin } from '@/lib/api-auth';
import { POST as replyPOST } from '@/app/api/admin/ai-coach/kelly/reply/route';
import { POST as threadPOST } from '@/app/api/ai-coach/thread/route';
import { NextRequest, NextResponse } from 'next/server';

const T = 'ai_coach_threads/u1';
const msgs = () => Array.from(st.docs.entries()).filter(([k]) => k.startsWith(`${T}/messages/`)).map(([, v]) => v);

beforeEach(() => {
  st.docs.clear();
  st.autoId = 0;
  st.flags = { kellyUnifiedV1: true };
  st.verifyUid = 'u1';
  st.identity = null;
  st.session = null;
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('thread-store', () => {
  it('flag-off parity: appendMessage without source writes exactly the old shape', async () => {
    await appendMessage(db as any, 'u1', { role: 'assistant', text: 'היי' }, 1000);
    const [m] = msgs();
    expect(Object.keys(m).sort()).toEqual(['cards', 'createdAt', 'expireAt', 'role', 'text']);
    expect(Object.keys(st.docs.get(T)!).sort()).toEqual(['messageCount', 'updatedAt']);
  });

  it('unified AI turn: source + TTL + lastMessageAt/preview, no unread', async () => {
    await appendMessage(db as any, 'u1', { role: 'assistant', text: 'תשובה', source: 'ai' }, 1000);
    const [m] = msgs();
    expect(m).toMatchObject({ source: 'ai', role: 'assistant' });
    expect(m.expireAt).toBeDefined();
    expect(st.docs.get(T)).toMatchObject({ lastMessagePreview: 'תשובה', messageCount: 1 });
    expect(st.docs.get(T)!.unreadForUser).toBeUndefined();
  });

  it('team reply: no TTL, unread +1, needsHuman cleared, lastHumanReplyAt set', async () => {
    await markNeedsHuman(db as any, 'u1', '  רוצה   מאמן  ', 500);
    expect(st.docs.get(T)).toMatchObject({ needsHuman: true, needsHumanSummary: 'רוצה מאמן', needsHumanReason: 'handoff' });
    await appendNonAiMessage(db as any, 'u1', { source: 'human', text: 'היי מהצוות', senderName: 'קלי · צוות OUT' }, 1000);
    await appendNonAiMessage(db as any, 'u1', { source: 'human', text: 'עוד', senderName: 'קלי · צוות OUT' }, 1100);
    const team = msgs().find((m) => m.text === 'היי מהצוות')!;
    expect(team).toMatchObject({ source: 'human', role: 'assistant', senderName: 'קלי · צוות OUT' });
    expect(team.expireAt).toBeUndefined();
    const t = st.docs.get(T)!;
    expect(t).toMatchObject({ needsHuman: false, unreadForUser: 2, messageCount: 2 });
    expect(t.needsHumanSummary).toBeUndefined();
    expect(t.needsHumanReason).toBeUndefined();
    expect((t.lastHumanReplyAt as any).toMillis()).toBe(1100);
    await markThreadRead(db as any, 'u1');
    expect(st.docs.get(T)!.unreadForUser).toBe(0);
  });

  it('team-only user message: no TTL, needsHuman, flood guard', async () => {
    const r = await appendTeamOnlyUserMessage(db as any, 'u1', 'שאלה', 1000);
    expect(r.ok).toBe(true);
    expect(msgs()[0]).toMatchObject({ source: 'user', role: 'user', text: 'שאלה' });
    expect(msgs()[0].expireAt).toBeUndefined();
    expect(st.docs.get(T)).toMatchObject({ needsHuman: true, needsHumanReason: 'team_only', teamWindow: { startMs: 1000, count: 1 } });
    for (let i = 1; i < TEAM_MSG_MAX_PER_WINDOW; i++) await appendTeamOnlyUserMessage(db as any, 'u1', `q${i}`, 1000 + i);
    const refused = await appendTeamOnlyUserMessage(db as any, 'u1', 'one too many', 2000);
    expect(refused.ok).toBe(false);
    expect(msgs()).toHaveLength(TEAM_MSG_MAX_PER_WINDOW);
  });
});

describe('Kelly paused (appendAiPausedUserMessage)', () => {
  const NOW = Date.UTC(2026, 9, 19, 9, 0); // 12:00 in Israel
  const sorted = () => msgs().sort((a: any, b: any) => a.createdAt.toMillis() - b.createdAt.toMillis());

  it('rate limited chatter: message + ONE paused reply per window, not in the admin queue', async () => {
    const r1 = await appendAiPausedUserMessage(db as any, 'u1', 'ומה עם מתיחות?', { code: 'rate_limited', gender: 'female', retryAfterSec: 3 * 3600 }, NOW);
    expect(r1).toMatchObject({ ok: true, needsHuman: false });
    const [user, reply] = sorted();
    expect(user).toMatchObject({ source: 'user', role: 'user', text: 'ומה עם מתיחות?' });
    expect(user.expireAt).toBeUndefined();
    expect(reply).toMatchObject({ source: 'system', role: 'assistant', noPush: true });
    expect(reply.text).toBe('דיברנו המון היום. אני חוזר לענות בסביבות 15:00. אם זה דחוף, תכתבי לי שזה דחוף והצוות שלנו יענה לך כאן.');
    const t = st.docs.get(T)!;
    expect(t.needsHuman).toBeUndefined();
    expect(t.unreadForUser).toBeUndefined(); // the user is looking at it
    expect(t).toMatchObject({ aiPause: { code: 'rate_limited', untilMs: NOW + 3 * 3600_000 }, messageCount: 2 });

    // More chatter in the same window: stored, no second reply.
    const r2 = await appendAiPausedUserMessage(db as any, 'u1', 'ועוד משהו', { code: 'rate_limited', gender: 'female', retryAfterSec: 3 * 3600 - 60 }, NOW + 60_000);
    expect(r2).toMatchObject({ ok: true, replyId: null });
    expect(msgs()).toHaveLength(3);

    // "דחוף": into the queue, reason ai_rate_limited (still no second reply).
    const r3 = await appendAiPausedUserMessage(db as any, 'u1', 'זה דחוף, החיוב לא עבר', { code: 'rate_limited', gender: 'female', retryAfterSec: 3000 }, NOW + 120_000);
    expect(r3).toMatchObject({ ok: true, needsHuman: true, replyId: null });
    expect(st.docs.get(T)).toMatchObject({ needsHuman: true, needsHumanReason: 'ai_rate_limited' });

    // After the window: a new pause gets a new reply.
    const r4 = await appendAiPausedUserMessage(db as any, 'u1', 'שוב', { code: 'rate_limited', gender: 'female', retryAfterSec: 3600 }, NOW + 3 * 3600_000 + 1);
    expect(r4.ok && r4.replyId).toBeTruthy();
  });

  it('kill switch: every message enters the queue; a different pause reason replies again', async () => {
    await appendAiPausedUserMessage(db as any, 'u1', 'היי', { code: 'rate_limited', gender: 'male', retryAfterSec: 600 }, NOW);
    const r = await appendAiPausedUserMessage(db as any, 'u1', 'מה קורה', { code: 'kill_switch', gender: 'male' }, NOW + 1000);
    expect(r).toMatchObject({ ok: true, needsHuman: true, replyText: 'אני לא זמין כרגע. הצוות שלנו רואה את ההודעה שלך ויענה כאן בהקדם.' });
    expect(st.docs.get(T)).toMatchObject({ needsHuman: true, needsHumanReason: 'ai_kill_switch', aiPause: { code: 'kill_switch', untilMs: NOW + 1000 + 3600_000 } });
  });

  it('safety while paused: the fixed safety reply every time, queue reason safety', async () => {
    await appendAiPausedUserMessage(db as any, 'u1', 'היי', { code: 'rate_limited', gender: 'male', retryAfterSec: 600 }, NOW);
    const r = await appendAiPausedUserMessage(db as any, 'u1', 'לחץ בחזה', { code: 'rate_limited', gender: 'male', retryAfterSec: 600, safetyText: 'SAFE 101' }, NOW + 1000);
    expect(r).toMatchObject({ ok: true, needsHuman: true, replyText: 'SAFE 101' });
    expect(st.docs.get(T)).toMatchObject({ needsHumanReason: 'safety' });
  });

  it('shares the team flood guard', async () => {
    for (let i = 0; i < TEAM_MSG_MAX_PER_WINDOW; i++) {
      await appendAiPausedUserMessage(db as any, 'u1', `q${i}`, { code: 'rate_limited', gender: 'male', retryAfterSec: 600 }, NOW + i);
    }
    const refused = await appendAiPausedUserMessage(db as any, 'u1', 'over', { code: 'rate_limited', gender: 'male', retryAfterSec: 600 }, NOW + 100);
    expect(refused).toMatchObject({ ok: false });
  });
});

describe('claimPending', () => {
  it('a pending tool call can be resumed once, only by its own id, only while fresh', async () => {
    const turn = { toolUseId: 'gw1', toolName: 'generate_workout', state: { turnMessages: [], roundsUsed: 1, turnText: '' } as any, pendingResults: [], cards: [] };
    await savePending(db as any, 'u1', turn, 1000);
    expect(await claimPending(db as any, 'u1', 'other', 2000)).toBeNull();
    expect(await claimPending(db as any, 'u1', 'gw1', 2000)).toMatchObject({ toolUseId: 'gw1', toolName: 'generate_workout' });
    expect(await claimPending(db as any, 'u1', 'gw1', 2000)).toBeNull();

    await savePending(db as any, 'u1', turn, 1000);
    expect(await claimPending(db as any, 'u1', 'gw1', 1000 + 11 * 60_000)).toBeNull(); // expired
  });
});

describe('handoff_to_human', () => {
  const ctx = (unified: boolean): ServerToolContext => ({
    db: db as any,
    uid: 'u1',
    profile: { core: { name: 'דנה כהן' } },
    now: new Date(5000),
    knownCards: new Map(),
    turn: { handoffDone: false },
    ...(unified ? { unified: true } : {}),
  });

  it('flag on: flags the unified thread, writes nothing into chats/', async () => {
    const c = ctx(true);
    const r = await executeServerTool(c, 'handoff_to_human', { summary: 'רוצה תוכנית ריצה' });
    expect(JSON.parse(r.content)).toMatchObject({ sent: true });
    expect(st.docs.get(T)).toMatchObject({ needsHuman: true, needsHumanSummary: 'רוצה תוכנית ריצה' });
    expect(Array.from(st.docs.keys()).some((k) => k.startsWith('chats/'))).toBe(false);
    expect(c.turn.handoffDone).toBe(true);
    expect((await executeServerTool(c, 'handoff_to_human', { summary: 'שוב' })).isError).toBe(true);
  });

  it('flag off: the old DM write as the user', async () => {
    await executeServerTool(ctx(false), 'handoff_to_human', { summary: 'רוצה תוכנית ריצה' });
    const chatMsg = Array.from(st.docs.entries()).find(([k]) => k.startsWith('chats/') && k.includes('/messages/'));
    expect(chatMsg?.[1]).toMatchObject({ senderUid: 'u1', source: 'ai_coach_handoff' });
    expect(st.docs.get(T)).toBeUndefined();
  });
});

const adminReq = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }) =>
  new NextRequest('http://x/api/admin/ai-coach/kelly/reply', { method: 'POST', headers, body: JSON.stringify(body) });

describe('requireKellyTeamAdmin', () => {
  it('401 without credentials', async () => {
    const r = await requireKellyTeamAdmin(adminReq({}, {}));
    expect((r as NextResponse).status).toBe(401);
  });
  it('root admin email (verified token) passes without a user doc', async () => {
    st.identity = { uid: 'root1', email: 'office@appout.co.il', admin: true };
    expect(await requireKellyTeamAdmin(adminReq({}))).toEqual({ uid: 'root1' });
  });
  it('super admin passes; another admin is 403', async () => {
    st.identity = { uid: 'sa', email: 'sa@example.com', admin: true };
    st.docs.set('users/sa', { core: { isSuperAdmin: true } });
    expect(await requireKellyTeamAdmin(adminReq({}))).toEqual({ uid: 'sa' });
    st.identity = { uid: 'va', email: 'va@example.com', admin: true };
    st.docs.set('users/va', { core: { isVerticalAdmin: true } });
    expect(((await requireKellyTeamAdmin(adminReq({}))) as NextResponse).status).toBe(403);
  });
  it('admin session cookie works too', async () => {
    st.session = { uid: 'root2', email: 'david@appout.co.il', admin: true };
    expect(await requireKellyTeamAdmin(adminReq({}, { cookie: 'out_admin_session=abc' }))).toEqual({ uid: 'root2' });
  });
});

describe('POST /api/admin/ai-coach/kelly/reply', () => {
  beforeEach(() => {
    st.identity = { uid: 'root1', email: 'office@appout.co.il', admin: true };
    st.docs.set('users/user_000001', { core: { name: 'דנה' } });
  });
  const UT = 'ai_coach_threads/user_000001';

  it('auth passthrough (401) and validation (400)', async () => {
    st.identity = null;
    expect((await replyPOST(adminReq({ uid: 'user_000001', text: 'x' }))).status).toBe(401);
    st.identity = { uid: 'root1', email: 'office@appout.co.il', admin: true };
    expect((await replyPOST(adminReq({ uid: 'bad uid!', text: 'x' }))).status).toBe(400);
    expect((await replyPOST(adminReq({ uid: 'user_000001', text: '   ' }))).status).toBe(400);
  });

  it('409 while the flag is off; 404 for an unknown user', async () => {
    st.flags = { kellyUnifiedV1: false };
    expect((await replyPOST(adminReq({ uid: 'user_000001', text: 'היי' }))).status).toBe(409);
    st.flags = { kellyUnifiedV1: true };
    expect((await replyPOST(adminReq({ uid: 'user_404404', text: 'היי' }))).status).toBe(404);
    expect(Array.from(st.docs.keys()).some((k) => k.startsWith('ai_coach_threads/'))).toBe(false);
  });

  it('reply: team message in the unified thread + thread effects', async () => {
    st.docs.set(UT, { needsHuman: true, needsHumanSummary: 's', unreadForUser: 1 });
    const res = await replyPOST(adminReq({ uid: 'user_000001', text: '  היי, כאן הצוות  ' }));
    expect(res.status).toBe(200);
    const m = Array.from(st.docs.entries()).find(([k]) => k.startsWith(`${UT}/messages/`))![1];
    expect(m).toMatchObject({ source: 'human', role: 'assistant', text: 'היי, כאן הצוות', senderName: 'קלי · צוות OUT' });
    expect(JSON.stringify(m)).not.toContain('root1'); // the admin's uid is never on the user-readable message
    expect(st.docs.get(UT)).toMatchObject({ needsHuman: false, unreadForUser: 2 });
    expect(st.docs.get(UT)!.lastHumanReplyAt).toBeDefined();
  });

  it('resolve: out of the queue, no message', async () => {
    st.docs.set(UT, { needsHuman: true, needsHumanSummary: 's' });
    expect((await replyPOST(adminReq({ uid: 'user_000001', action: 'resolve' }))).status).toBe(200);
    expect(st.docs.get(UT)).toEqual({ needsHuman: false });
  });
});

const userReq = (body: unknown, auth = true) =>
  new Request('http://x/api/ai-coach/thread', {
    method: 'POST',
    headers: auth ? { Authorization: 'Bearer t', 'Content-Type': 'application/json' } : {},
    body: JSON.stringify(body),
  });

describe('POST /api/ai-coach/thread', () => {
  beforeEach(() => st.docs.set('users/u1', { core: { ageGroup: 'minor' } }));

  it('401 / 400 / 404 when the flag is off', async () => {
    expect((await threadPOST(userReq({ action: 'read' }, false))).status).toBe(401);
    expect((await threadPOST(userReq({ action: 'nope' }))).status).toBe(400);
    st.flags = { kellyUnifiedV1: false };
    expect((await threadPOST(userReq({ action: 'read' }))).status).toBe(404);
  });

  it('read zeroes unreadForUser for the token uid only', async () => {
    st.docs.set(T, { unreadForUser: 3 });
    expect((await threadPOST(userReq({ action: 'read', uid: 'someone_else' }))).status).toBe(200);
    expect(st.docs.get(T)!.unreadForUser).toBe(0);
  });

  it('team-only message (a minor, no AI): stored + queued; 429 past the flood guard', async () => {
    const res = await threadPOST(userReq({ action: 'message', message: 'יש לי שאלה' }));
    expect(res.status).toBe(200);
    expect(st.docs.get(T)).toMatchObject({ needsHuman: true });
    st.docs.set(T, { teamWindow: { startMs: Date.now(), count: TEAM_MSG_MAX_PER_WINDOW } });
    const limited = await threadPOST(userReq({ action: 'message', message: 'שוב' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });

  it('403 without a profile', async () => {
    st.docs.delete('users/u1');
    expect((await threadPOST(userReq({ action: 'message', message: 'x' }))).status).toBe(403);
  });
});
