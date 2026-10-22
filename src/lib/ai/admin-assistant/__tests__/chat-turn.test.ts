/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({
  decision: { kind: 'model' } as any,
  routerCalls: 0,
  sonnetCalls: 0,
  audits: [] as any[],
  appended: [] as any[],
  reply: 'תשובה',
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('../router.server', () => ({
  routeQuestion: async () => {
    st.routerCalls += 1;
    return { decision: st.decision, costUsd: 0.00003 };
  },
}));
vi.mock('../quick-metrics.server', () => ({
  computeQuickCard: async (_db: unknown, metric: string) => ({ metric, title: 't', rows: [{ label: 'סה״כ', value: '7' }], href: '/admin/approval-center', asOf: '2026-10-22', caveats: [] }),
}));
vi.mock('../audit.server', () => ({
  writeAdminAudit: async (_db: unknown, row: any) => {
    st.audits.push(row);
    return `audit${st.audits.length}`;
  },
}));
vi.mock('../thread-store.server', () => ({
  loadAdminThread: async () => ({ summary: null, summarizedUntilMs: 0, recent: [] }),
  historyMessages: () => [],
  appendAdminMessage: async (_db: unknown, _uid: string, m: any) => {
    st.appended.push(m);
    return 'm1';
  },
  maybeRollAdminSummary: async () => undefined,
}));
vi.mock('../model-call.server', () => ({
  streamAdminModelCall: async (_c: unknown, _u: string, _p: unknown, onText: (d: string) => void) => {
    st.sonnetCalls += 1;
    onText(st.reply);
    return { message: { content: [{ type: 'text', text: st.reply }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, costUsd: 0.01 };
  },
}));

import { runChatTurn, NAV_FOUND_TEXT_HE, OUT_OF_SCOPE_TEXT_HE } from '../chat-turn.server';

const grant = { client: {} as any, model: 'claude-sonnet-5-5', config: {} as any };
const run = async (question: string, localKind: any = 'no_match', role: 'root' | 'super' = 'root') => {
  const events: any[] = [];
  await runChatTurn({} as any, grant, { uid: 'u1', role, question, localKind, currentPath: '/admin' }, (e) => events.push(e), new Date('2026-10-22T10:00:00Z'));
  return events;
};

beforeEach(() => {
  st.decision = { kind: 'model' };
  st.routerCalls = 0;
  st.sonnetCalls = 0;
  st.audits = [];
  st.appended = [];
  st.reply = 'תשובה';
});

describe('runChatTurn — cheapest path first', () => {
  it('router says nav → page buttons, NO Sonnet call, audit route router_nav', async () => {
    st.decision = { kind: 'nav' };
    const ev = await run('איפה עמוד העלויות של המערכת');
    expect(st.sonnetCalls).toBe(0);
    expect(ev[0]).toEqual({ type: 'text', delta: NAV_FOUND_TEXT_HE });
    expect(ev.some((e) => e.type === 'link' && e.href === '/admin/costs')).toBe(true);
    expect(ev.at(-1)).toMatchObject({ type: 'done', route: 'router_nav' });
    expect(st.audits[0].route).toBe('router_nav');
  });
  it('router says quick → the chip card, NO Sonnet call', async () => {
    st.decision = { kind: 'quick', metric: 'pending_approvals' };
    const ev = await run('תן לי את מספר הממתינים');
    expect(st.sonnetCalls).toBe(0);
    expect(ev[0].type).toBe('quick');
    expect(st.audits[0].route).toBe('router_quick');
  });
  it('out of scope → a fixed line', async () => {
    st.decision = { kind: 'out_of_scope' };
    const ev = await run('מה מזג האוויר');
    expect(ev[0]).toEqual({ type: 'text', delta: OUT_OF_SCOPE_TEXT_HE });
    expect(st.sonnetCalls).toBe(0);
  });
  it('a data question skips the router and goes to Sonnet; both messages are stored', async () => {
    const ev = await run('כמה ממתינים לאישור?', 'data_question');
    expect(st.routerCalls).toBe(0);
    expect(st.sonnetCalls).toBe(1);
    expect(ev.at(-1)).toMatchObject({ type: 'done', route: 'model', costUsd: 0.01 });
    expect(st.appended.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(st.audits[0]).toMatchObject({ route: 'model', model: 'claude-sonnet-5-5', question: 'כמה ממתינים לאישור?' });
  });
  it('router nav with nothing found falls through to Sonnet', async () => {
    st.decision = { kind: 'nav' };
    await run('קקקקקק זזזזזז');
    expect(st.sonnetCalls).toBe(1);
  });
});

describe('runChatTurn — the evidence guard (wave 4)', () => {
  it('a number no tool returned → done.unverified, audit guardFailed, stored message flagged', async () => {
    st.reply = 'יש 340 משתמשים פעילים השבוע.';
    const ev = await run('כמה פעילים?', 'data_question');
    expect(ev.at(-1)).toMatchObject({ type: 'done', unverified: true });
    expect(st.audits[0].guardFailed).toBe(true);
    expect(st.appended[1].unverified).toBe(true);
  });
  it('an answer without numbers is not checked (guardFailed null)', async () => {
    const ev = await run('מה זה WAE?', 'data_question');
    expect(ev.at(-1)).toMatchObject({ unverified: false });
    expect(st.audits[0].guardFailed).toBeNull();
  });
});
