/**
 * Kelly phase 2 — the confirm card's API: auth (token → uid, own thread only), the flag,
 * the life cycle (claim once, idempotent applied / dismiss, stale schedule, expiry) and that
 * the route never writes a schedule (only the proposal's status fields). In-memory Admin SDK.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  flags: { aiCoachPhase2: true } as Record<string, boolean>,
  verifyUid: 'u1' as string | null,
  writes: [] as string[],
}));

vi.mock('server-only', () => ({}));

function setPath(obj: Record<string, unknown>, dotted: string, v: unknown) {
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    cur[p] = { ...((cur[p] as Record<string, unknown>) ?? {}) };
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = v;
}

vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string): any => ({
    __path: path,
    collection: (n: string) => ({ doc: (id: string) => ref(`${path}/${n}/${id}`) }),
  });
  const db = {
    collection: (n: string) => ({ doc: (id: string) => ref(`${n}/${id}`) }),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
      fn({
        get: async (r: any) => {
          const d = st.docs.get(r.__path);
          return { exists: d !== undefined, data: () => d };
        },
        update: (r: any, fields: Record<string, unknown>) => {
          st.writes.push(r.__path);
          const next = JSON.parse(JSON.stringify(st.docs.get(r.__path) ?? {}));
          for (const [k, v] of Object.entries(fields)) setPath(next, k, v);
          st.docs.set(r.__path, next);
        },
      }),
  };
  return {
    getAdminDb: () => db,
    getAdminAuth: () => ({
      verifyIdToken: async () => {
        if (!st.verifyUid) throw new Error('bad token');
        return { uid: st.verifyUid };
      },
    }),
  };
});
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ ...st.flags }) }));

import { POST } from '@/app/api/ai-coach/schedule-proposal/route';
import { scheduleFingerprint } from '../fingerprint';
import { decideTransition } from '../lifecycle';
import type { StoredProposal } from '../types';

const PROFILE = { lifestyle: { recurringTemplate: { א: ['push'], ג: ['legs'] } } };
const MSG = 'ai_coach_threads/u1/messages/m1';
const proposal = (over: Partial<StoredProposal> = {}): StoredProposal => ({
  id: 'p1',
  status: 'pending',
  scope: 'from_now',
  title: 'שינוי בלו״ז, מעכשיו והלאה',
  lines: ['האימון של יום שלישי עובר ליום רביעי'],
  plan: {
    scope: 'from_now',
    recurringTemplate: { א: ['push'], ד: ['legs'] },
    lifestyleScheduleDays: ['א', 'ד'],
    runningScheduleDays: null,
    runningFrequency: null,
    runningSkipped: null,
    dayOverrides: [],
    prefs: { availableDayCount: 2, focus: 35 },
  },
  fingerprint: scheduleFingerprint(PROFILE),
  createdAtMs: Date.now() - 1000,
  expiresAtMs: Date.now() + 3_600_000,
  ...over,
});

const call = (body: unknown, token = 'tok') =>
  POST(new Request('http://x/api/ai-coach/schedule-proposal', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }));
const confirm = { messageId: 'm1', proposalId: 'p1', action: 'confirm' };

beforeEach(() => {
  st.docs.clear();
  st.writes = [];
  st.flags = { aiCoachPhase2: true };
  st.verifyUid = 'u1';
  st.docs.set('users/u1', JSON.parse(JSON.stringify(PROFILE)));
  st.docs.set(MSG, { role: 'assistant', text: 'הכנתי הצעה', proposal: proposal() });
});

describe('POST /api/ai-coach/schedule-proposal', () => {
  it('auth: no token / bad token → 401; flag off → 404', async () => {
    expect((await call(confirm, '')).status).toBe(401);
    st.verifyUid = null;
    expect((await call(confirm)).status).toBe(401);
    st.verifyUid = 'u1';
    st.flags = { aiCoachPhase2: false };
    expect((await call(confirm)).status).toBe(404);
    expect(st.writes).toEqual([]);
  });

  it("another user's message is never found (the uid comes from the token)", async () => {
    st.verifyUid = 'u2';
    const res = await call(confirm);
    expect(res.status).toBe(404);
    expect(st.writes).toEqual([]);
  });

  it('confirm releases the plan ONCE; a double tap is in_progress; applied is idempotent', async () => {
    const r1 = await call(confirm);
    expect(r1.status).toBe(200);
    const b1 = await r1.json();
    expect(b1.status).toBe('applying');
    expect(b1.plan.recurringTemplate).toEqual({ א: ['push'], ד: ['legs'] });
    const r2 = await call(confirm);
    expect(r2.status).toBe(409);
    expect((await r2.json()).error).toBe('in_progress');
    expect((await (await call({ ...confirm, action: 'applied' })).json()).status).toBe('applied');
    const again = await (await call(confirm)).json();
    expect(again).toMatchObject({ status: 'applied', already: true });
    expect(again.plan).toBeUndefined();
    expect((await call({ ...confirm, action: 'applied' })).status).toBe(200);
    // Only the message's proposal fields were ever written — never a schedule document.
    expect(new Set(st.writes)).toEqual(new Set([MSG]));
    expect((st.docs.get(MSG)!.proposal as StoredProposal).status).toBe('applied');
  });

  it('failed puts it back to pending (the user can tap again); dismiss after applied is refused', async () => {
    await call(confirm);
    expect((await (await call({ ...confirm, action: 'failed' })).json()).status).toBe('pending');
    expect((await call(confirm)).status).toBe(200);
    await call({ ...confirm, action: 'applied' });
    expect((await call({ ...confirm, action: 'dismiss' })).status).toBe(409);
  });

  it('a schedule changed since the proposal → stale, nothing released', async () => {
    st.docs.set('users/u1', { lifestyle: { recurringTemplate: { ב: ['push'] } } });
    const r = await call(confirm);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('stale');
    expect(st.writes).toEqual([]);
  });

  it('expired → 410; dismissed → confirm refused; wrong proposal id → 404; bad body → 400', async () => {
    st.docs.set(MSG, { role: 'assistant', proposal: proposal({ expiresAtMs: Date.now() - 1 }) });
    expect((await call(confirm)).status).toBe(410);
    st.docs.set(MSG, { role: 'assistant', proposal: proposal() });
    expect((await (await call({ ...confirm, action: 'dismiss' })).json()).status).toBe('dismissed');
    expect((await call(confirm)).status).toBe(409);
    expect((await call({ ...confirm, proposalId: 'other' })).status).toBe(404);
    expect((await call({ messageId: '../x', proposalId: 'p1', action: 'confirm' })).status).toBe(400);
  });
});

describe('decideTransition (pure)', () => {
  const ctx = { nowMs: Date.now(), todayKey: '2026-10-19', fingerprint: scheduleFingerprint(PROFILE) };
  it('a stale "applying" claim (device died) can be claimed again', () => {
    const p = proposal({ status: 'applying', claimedAtMs: Date.now() - 5 * 60_000 });
    expect(decideTransition(p, 'p1', 'confirm', ctx)).toMatchObject({ ok: true, status: 'applying' });
  });
  it('a this-week plan whose day already passed is expired', () => {
    const p = proposal({ plan: { ...proposal().plan, scope: 'this_week', recurringTemplate: null, dayOverrides: [{ date: '2026-10-18', strengthProgramIds: null }] } });
    expect(decideTransition(p, 'p1', 'confirm', ctx)).toMatchObject({ ok: false, error: 'expired' });
  });
});
