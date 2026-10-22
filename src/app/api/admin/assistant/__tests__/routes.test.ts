/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const st = vi.hoisted(() => ({
  gate: null as any,
  prepareError: null as any,
  turnEvents: [] as any[],
  quickCalls: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/ai/admin-assistant/gate.server', () => ({ requireAdminAiCaller: async () => st.gate }));
vi.mock('@/lib/ai/admin-assistant/budget.server', () => ({
  prepareAdminModelCall: async () => {
    if (st.prepareError) throw st.prepareError;
    return { client: {}, model: 'claude-sonnet-5-5', config: {} };
  },
  countAdminAiFreeRoute: async () => undefined,
}));
vi.mock('@/lib/ai/admin-assistant/chat-turn.server', () => ({
  runChatTurn: async (_db: unknown, _g: unknown, _r: unknown, emit: (e: any) => void) => st.turnEvents.forEach(emit),
}));
vi.mock('@/lib/ai/admin-assistant/audit.server', () => ({ writeAdminAudit: async () => 'a1' }));
vi.mock('@/lib/ai/admin-assistant/quick-metrics.server', () => ({
  isQuickMetricId: (m: string) => m === 'crm_pipeline',
  computeQuickCard: async () => {
    st.quickCalls += 1;
    return { metric: 'crm_pipeline', title: 't', rows: [], href: null, asOf: 'x', caveats: [] };
  },
}));

import { POST as chat } from '../chat/route';
import { GET as quick } from '../quick/[metric]/route';
import { AdminAiUnavailableError } from '@/lib/ai/admin-assistant/errors';

const post = (body: unknown) => new NextRequest('http://localhost/api/admin/assistant/chat', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  st.gate = { uid: 'u1', email: 'office@appout.co.il', role: 'root' };
  st.prepareError = null;
  st.turnEvents = [];
  st.quickCalls = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/admin/assistant/chat', () => {
  it('the gate answer is returned as-is (e.g. 403 flag off)', async () => {
    st.gate = NextResponse.json({ code: 'flag_off' }, { status: 403 });
    expect((await chat(post({ question: 'x' }))).status).toBe(403);
  });
  it('bad body → 400 (empty, too long, extra keys)', async () => {
    expect((await chat(post({ question: '' }))).status).toBe(400);
    expect((await chat(post({ question: 'א'.repeat(1001) }))).status).toBe(400);
    expect((await chat(post({ question: 'x', model: 'claude-opus-5-5' }))).status).toBe(400);
    expect((await chat(post({ question: 'x', currentPath: 'https://evil.example' }))).status).toBe(400);
  });
  it('fail closed with a Hebrew message: missing key / unpriced model → 503, rate limit → 429 + Retry-After', async () => {
    st.prepareError = new AdminAiUnavailableError('admin_key_missing');
    let res = await chat(post({ question: 'כמה?' }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('admin_key_missing');
    st.prepareError = new AdminAiUnavailableError('unpriced_model');
    expect((await chat(post({ question: 'כמה?' }))).status).toBe(503);
    st.prepareError = new AdminAiUnavailableError('admin_over_budget');
    expect((await chat(post({ question: 'כמה?' }))).status).toBe(503);
    st.prepareError = new AdminAiUnavailableError('rate_limited', { retryAfterSec: 120 });
    res = await chat(post({ question: 'כמה?' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('120');
  });
  it('streams the turn as SSE', async () => {
    st.turnEvents = [{ type: 'text', delta: 'שלום' }, { type: 'done', route: 'model', auditId: 'a', costUsd: 0.01, unverified: false }];
    const res = await chat(post({ question: 'כמה?', localKind: 'data_question', currentPath: '/admin/costs' }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const body = await res.text();
    expect(body).toContain('"delta":"שלום"');
    expect(body).toContain('"type":"done"');
  });
});

describe('GET /api/admin/assistant/quick/<metric>', () => {
  const get = (m: string) => quick(new NextRequest(`http://localhost/api/admin/assistant/quick/${m}`), { params: { metric: m } });
  it('same gate; unknown metric → 404 with zero computation', async () => {
    expect((await get('drop_tables')).status).toBe(404);
    expect(st.quickCalls).toBe(0);
    st.gate = NextResponse.json({}, { status: 401 });
    expect((await get('crm_pipeline')).status).toBe(401);
  });
  it('known metric → the card, no AI budget involved', async () => {
    const res = await get('crm_pipeline');
    expect(res.status).toBe(200);
    expect((await res.json()).card.metric).toBe('crm_pipeline');
  });
});
