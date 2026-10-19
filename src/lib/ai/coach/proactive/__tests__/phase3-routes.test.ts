/**
 * Kelly phase 3 — server writes and routes against an in-memory Admin SDK fake:
 * the one-a-day proactive message (send.server), the "איך היה?" route (auth, ownership,
 * once), the memory route (auth by token, own facts only, delete one / all), and flag-off
 * parity (the run reads and writes nothing). No network, synthetic data only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  flags: { aiCoachProactive: true, kellyUnifiedV1: true, aiCoachMemory: true } as Record<string, boolean>,
  tokens: { 'tok-u1': 'u1', 'tok-u2': 'u2' } as Record<string, string>,
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ms: ms, toMillis: () => ms }) },
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => ({ __ts: true }), delete: () => ({ __del: true }) },
}));

function setPath(obj: Record<string, unknown>, key: string, v: unknown) {
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] = { ...((cur[p] as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
  const last = parts[parts.length - 1];
  if (v && typeof v === 'object' && '__del' in (v as object)) delete cur[last];
  else if (v && typeof v === 'object' && '__inc' in (v as object)) cur[last] = ((cur[last] as number) ?? 0) + (v as { __inc: number }).__inc;
  else if (v && typeof v === 'object' && !Array.isArray(v) && !('__ms' in (v as object)) && !('__ts' in (v as object))) {
    const inner = { ...((cur[last] as Record<string, unknown>) ?? {}) };
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) setPath(inner, k, x);
    cur[last] = inner;
  } else cur[last] = v;
}
function write(path: string, data: Record<string, unknown>, merge: boolean) {
  const out = merge ? { ...(st.docs.get(path) ?? {}) } : {};
  for (const [k, v] of Object.entries(data)) setPath(out, k, v);
  st.docs.set(path, out);
}
const ref = (path: string): any => ({
  id: path.split('/').pop(),
  __path: path,
  get: async () => {
    const d = st.docs.get(path);
    return { id: path.split('/').pop(), exists: d !== undefined, data: () => d, get: (k: string) => (d as any)?.[k] };
  },
  set: async (d: Record<string, unknown>, o?: { merge?: boolean }) => write(path, d, !!o?.merge),
  collection: (n: string) => col(`${path}/${n}`),
});
const col = (path: string): any => ({ doc: (id: string) => ref(`${path}/${id}`) });
const db: any = {
  collection: col,
  runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
    fn({ get: (r: any) => r.get(), set: (r: any, d: any, o?: any) => write(r.__path, d, !!o?.merge), update: (r: any, d: any) => write(r.__path, d, true) }),
};

vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => db,
  getAdminAuth: () => ({
    verifyIdToken: async (t: string) => {
      if (!st.tokens[t]) throw new Error('bad');
      return { uid: st.tokens[t] };
    },
  }),
}));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ ...st.flags }) }));

import { writeProactiveMessage } from '../send.server';
import { renderProactive } from '../templates';
import { runProactiveSlice } from '../run.server';
import { POST as feedbackPOST } from '@/app/api/ai-coach/proactive/feedback/route';
import { GET as memoryGET, POST as memoryPOST } from '@/app/api/ai-coach/memory/route';

const clock = { dateKey: '2026-10-20', hour: 18, minute: 30, dow: 2, ms: Date.parse('2026-10-20T15:30:00Z') };
const req = (token: string | null, body?: unknown, method = 'POST') =>
  new Request('http://x/api', { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  st.docs.clear();
  st.flags = { aiCoachProactive: true, kellyUnifiedV1: true, aiCoachMemory: true };
});

describe('send.server — one proactive message a day', () => {
  const rendered = renderProactive({ templateKey: 'post_workout', vars: { workoutId: 'w1', minutes: 30 }, gender: 'male', firstName: '' });
  it('writes the message as Kelly (system) with chips + the proactive field, bumps unread, ledger and stats', async () => {
    const r = await writeProactiveMessage(db, { uid: 'u1', clock, trigger: 'post_workout', templateKey: 'post_workout', vars: { workoutId: 'w1', minutes: 30 }, rendered, llm: false });
    expect(r).toEqual({ written: true, messageId: 'proactive_2026-10-20' });
    const msg = st.docs.get('ai_coach_threads/u1/messages/proactive_2026-10-20')!;
    expect(msg).toMatchObject({ role: 'assistant', source: 'system', actions: ['rate_easy', 'rate_right', 'rate_hard'], proactive: { trigger: 'post_workout', workoutId: 'w1', llm: false } });
    expect(msg.noPush).toBeUndefined();
    expect(msg.expireAt).toBeUndefined();
    expect(st.docs.get('ai_coach_threads/u1')).toMatchObject({ unreadForUser: 1, messageCount: 1 });
    expect(st.docs.get('ai_coach_proactive/u1')).toMatchObject({ askedWorkoutIds: ['w1'], lastTrigger: 'post_workout' });
    expect(st.docs.get('ai_coach_proactive_stats/2026-10-20')).toMatchObject({ total: 1, sent: { post_workout: 1 } });
  });
  it('a second write the same day is refused (the doc id is the lock)', async () => {
    const w = { uid: 'u1', clock, trigger: 'post_workout' as const, templateKey: 'post_workout' as const, vars: { workoutId: 'w1' }, rendered, llm: false };
    await writeProactiveMessage(db, w);
    expect((await writeProactiveMessage(db, w)).written).toBe(false);
    expect(st.docs.get('ai_coach_threads/u1')).toMatchObject({ unreadForUser: 1 });
  });
  it('a silent message carries noPush; a test send has its own id and no ledger', async () => {
    const silent = renderProactive({ templateKey: 'morning', vars: { silent: 1 }, gender: 'male', firstName: '' });
    await writeProactiveMessage(db, { uid: 'u1', clock, trigger: 'morning', templateKey: 'morning', vars: {}, rendered: silent, llm: false });
    expect(st.docs.get('ai_coach_threads/u1/messages/proactive_2026-10-20')).toMatchObject({ noPush: true });
    const t = await writeProactiveMessage(db, { uid: 'u2', clock, trigger: 'weekly', templateKey: 'weekly', vars: {}, rendered, llm: false, test: true });
    expect(t.messageId).toBe(`proactive_test_${clock.ms}`);
    expect(st.docs.get(`ai_coach_threads/u2/messages/${t.messageId}`)).toMatchObject({ proactive: { test: true } });
    expect(st.docs.get('ai_coach_proactive/u2')).toBeUndefined();
  });
});

describe('POST /api/ai-coach/proactive/feedback', () => {
  const seed = (uid = 'u1', workoutOwner = 'u1') => {
    st.docs.set(`ai_coach_threads/${uid}/messages/proactive_2026-10-20`, { proactive: { trigger: 'post_workout', workoutId: 'w1' }, actions: ['rate_easy', 'rate_right', 'rate_hard'] });
    st.docs.set('workouts/w1', { userId: workoutOwner });
  };
  const body = { messageId: 'proactive_2026-10-20', rating: 'hard' };
  it('401 without or with a bad token', async () => {
    expect((await feedbackPOST(req(null, body))).status).toBe(401);
    expect((await feedbackPOST(req('nope', body))).status).toBe(401);
  });
  it('404 while the flag is off', async () => {
    seed();
    st.flags.aiCoachProactive = false;
    expect((await feedbackPOST(req('tok-u1', body))).status).toBe(404);
    expect(st.docs.get('workout_feedback/w1')).toBeUndefined();
  });
  it('stores the answer once, server-side, and removes the chips', async () => {
    seed();
    expect((await feedbackPOST(req('tok-u1', body))).status).toBe(200);
    expect(st.docs.get('workout_feedback/w1')).toMatchObject({ uid: 'u1', workoutId: 'w1', rating: 'hard', source: 'kelly_proactive' });
    const msg = st.docs.get('ai_coach_threads/u1/messages/proactive_2026-10-20')!;
    expect(msg.actions).toBeUndefined();
    expect((msg.proactive as Record<string, unknown>).feedback).toBe('hard');
    expect((await feedbackPOST(req('tok-u1', { ...body, rating: 'easy' }))).status).toBe(409);
  });
  it('another user cannot answer, and a workout of someone else is refused', async () => {
    seed();
    expect((await feedbackPOST(req('tok-u2', body))).status).toBe(404); // u2 has no such message
    st.docs.clear();
    seed('u1', 'u2');
    expect((await feedbackPOST(req('tok-u1', body))).status).toBe(404);
    expect(st.docs.get('workout_feedback/w1')).toBeUndefined();
  });
  it('400 on a malformed body', async () => {
    expect((await feedbackPOST(req('tok-u1', { messageId: '../x', rating: 'hard' }))).status).toBe(400);
    expect((await feedbackPOST(req('tok-u1', { messageId: 'proactive_x', rating: 'meh' }))).status).toBe(400);
  });
});

describe('/api/ai-coach/memory', () => {
  const facts = (texts: string[]) => texts.map((t, k) => ({ id: `m_${k}`, category: 'preference', text: t, sourceMsgIds: [], confidence: 0.9, createdAt: 1, updatedAt: 1 }));
  beforeEach(() => {
    st.docs.set('ai_coach_memory/u1', { facts: facts(['לא אוהב ריצה', 'מעדיף אימונים קצרים']), extractedUntil: 5 });
    st.docs.set('ai_coach_memory/u2', { facts: facts(['רוצה לרוץ חמישה קילומטר']), extractedUntil: 5 });
  });
  it('401 without a valid token', async () => {
    expect((await memoryGET(req(null, undefined, 'GET'))).status).toBe(401);
    expect((await memoryPOST(req('nope', { action: 'delete_all' }))).status).toBe(401);
  });
  it('GET returns only the caller\'s own facts; 404 when the flag is off', async () => {
    const r = await memoryGET(req('tok-u1', undefined, 'GET'));
    const j = await r.json();
    expect(j.facts.map((f: { text: string }) => f.text)).toEqual(['לא אוהב ריצה', 'מעדיף אימונים קצרים']);
    expect(JSON.stringify(j)).not.toContain('חמישה');
    st.flags.aiCoachMemory = false;
    expect((await memoryGET(req('tok-u1', undefined, 'GET'))).status).toBe(404);
  });
  it('deletes one fact of the caller only; another user\'s fact id does nothing to them', async () => {
    expect((await memoryPOST(req('tok-u1', { action: 'delete', id: 'm_0' }))).status).toBe(200);
    expect((st.docs.get('ai_coach_memory/u1')!.facts as unknown[]).length).toBe(1);
    expect((await memoryPOST(req('tok-u1', { action: 'delete', id: 'm_9' }))).status).toBe(404);
    expect((st.docs.get('ai_coach_memory/u2')!.facts as unknown[]).length).toBe(1);
  });
  it('delete_all clears every fact (works even with the flag off) and moves the cursor', async () => {
    st.flags.aiCoachMemory = false;
    expect((await memoryPOST(req('tok-u1', { action: 'delete_all' }))).status).toBe(200);
    const d = st.docs.get('ai_coach_memory/u1')!;
    expect(d.facts).toEqual([]);
    expect(d.extractedUntil as number).toBeGreaterThan(5);
    expect((st.docs.get('ai_coach_memory/u2')!.facts as unknown[]).length).toBe(1);
  });
  it('400 on a bad id', async () => {
    expect((await memoryPOST(req('tok-u1', { action: 'delete', id: 'users/u2' }))).status).toBe(400);
  });
});

describe('flag-off parity', () => {
  it('the proactive run reads and writes nothing while ai_coach_proactive or kelly_unified_v1 is off', async () => {
    const throwing: any = { collection: () => { throw new Error('must not read'); }, runTransaction: () => { throw new Error('must not write'); } };
    for (const flags of [{ aiCoachProactive: false, kellyUnifiedV1: true }, { aiCoachProactive: true, kellyUnifiedV1: false }]) {
      const r = await runProactiveSlice(throwing, { flags: flags as any, now: new Date('2026-10-20T05:00:00Z') });
      expect(r).toMatchObject({ stoppedBy: 'flag_off', sent: 0, candidates: 0 });
    }
  });
});
