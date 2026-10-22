/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@/lib/admin-analytics/ops-metrics.server', () => ({
  getPendingApprovals: async () => ({ value: null, meta: { definitionId: 'pending_approvals', period: { from: null, to: '2026-10-22', tz: 'Asia/Jerusalem' }, n: null, minSample: null, belowThreshold: false, caveats: ['x'] }, error: 'unavailable' }),
}));

import { parseRouterReply } from '../router.server';
import { capToolResult, TOOL_RESULT_MAX_CHARS, numbersIn, wrapToolData } from '../tool-result';
import { encodeSse, parseSseChunk, type AdminAssistantEvent } from '../sse';
import { computeQuickCard } from '../quick-metrics.server';
import { adminToolDefinitions, ADMIN_TOOLS } from '../tools';
import { adminAssistantSystemPrompt, sessionContextText } from '../prompt';
import { historyMessages } from '../thread-store.server';
import { applyAssistantEvent } from '@/features/admin/components/assistant/assistant-events';
import { QUICK_CHIPS } from '@/features/admin/components/assistant/quick-chips';
import type { AssistantMessage } from '@/features/admin/components/assistant/useAdminAssistantStore';
import { QUICK_METRICS } from '../quick-metrics.server';

describe('router reply parsing', () => {
  it('one token → decision; anything else → the main model', () => {
    expect(parseRouterReply('nav')).toEqual({ kind: 'nav' });
    expect(parseRouterReply(' quick:crm_pipeline\n')).toEqual({ kind: 'quick', metric: 'crm_pipeline' });
    expect(parseRouterReply('quick:drop_tables')).toEqual({ kind: 'model' });
    expect(parseRouterReply('out')).toEqual({ kind: 'out_of_scope' });
    expect(parseRouterReply('')).toEqual({ kind: 'model' });
  });
});

describe('tool results: capped, wrapped, numbers extracted', () => {
  it('small results pass untouched', () => {
    expect(capToolResult({ a: 1 })).toEqual({ json: '{"a":1}', truncated: false });
  });
  it('big results are cut to the cap and marked truncated', () => {
    const big = { rows: Array.from({ length: 500 }, (_, i) => ({ name: `שורה ארוכה מאוד ${i}`, v: i })) };
    const r = capToolResult(big);
    expect(r.truncated).toBe(true);
    expect(r.json.length).toBeLessThanOrEqual(TOOL_RESULT_MAX_CHARS);
    expect(JSON.parse(r.json).truncated).toBe(true);
  });
  it('data is wrapped as <tool_data>', () => {
    expect(wrapToolData('{}')).toBe('<tool_data>{}</tool_data>');
  });
  it('numbersIn walks nested values', () => {
    expect(numbersIn({ a: 1, b: [2, { c: 3.5 }], d: 'x', e: null })).toEqual([1, 2, 3.5]);
  });
});

describe('SSE encode / parse round trip + the drawer reducer', () => {
  it('splits complete events and keeps the remainder', () => {
    const evs: AdminAssistantEvent[] = [{ type: 'text', delta: 'שלום' }, { type: 'link', href: '/admin/costs', title: 'עלויות', pageId: 'admin/costs' }];
    const raw = evs.map(encodeSse).join('') + 'data: {"type":"te';
    const { events, rest } = parseSseChunk(raw);
    expect(events).toEqual(evs);
    expect(rest).toBe('data: {"type":"te');
  });
  it('reducer: text appends, links dedupe, done clears pending', () => {
    let m: AssistantMessage = { id: 'a', role: 'assistant', text: '', links: [], pending: true };
    m = { ...m, ...applyAssistantEvent(m, { type: 'text', delta: 'א' }) };
    m = { ...m, ...applyAssistantEvent(m, { type: 'link', href: '/admin', title: 'בית', pageId: 'admin' }) };
    m = { ...m, ...applyAssistantEvent(m, { type: 'link', href: '/admin', title: 'בית', pageId: 'admin' }) };
    m = { ...m, ...applyAssistantEvent(m, { type: 'done', route: 'model', auditId: 'x', costUsd: 0.01, unverified: false }) };
    expect(m).toMatchObject({ text: 'א', links: [{ href: '/admin' }], pending: false, costUsd: 0.01 });
  });
});

describe('quick chips', () => {
  it('the drawer shows exactly the six server metrics, in order', () => {
    expect(QUICK_CHIPS.map((c) => c.metric)).toEqual([...QUICK_METRICS]);
    expect(QUICK_CHIPS).toHaveLength(6);
  });
  it('signup failures is root-only: a super admin gets an "unavailable" card with zero reads', async () => {
    const c = await computeQuickCard({} as any, 'signup_failures_week', 'super');
    expect(c.unavailable).toBe(true);
    expect(c.href).toBeNull();
  });
  it('an uncomputable number shows "לא זמין", never 0', async () => {
    const c = await computeQuickCard({} as any, 'pending_approvals', 'root');
    expect(c.unavailable).toBe(true);
    expect(c.rows[0].value).toContain('לא זמין');
  });
});

describe('prompt + tools (cache-friendly)', () => {
  it('the system prompt is stable (no date / per-user data) and carries the metric dictionary', () => {
    const a = adminAssistantSystemPrompt();
    expect(a).toBe(adminAssistantSystemPrompt());
    expect(a).not.toMatch(/2026-\d\d-\d\d/);
    expect(a).toContain('pending_approvals');
    expect(sessionContextText({ todayKey: '2026-10-22', role: 'root', currentPath: null, summary: null })).toContain('2026-10-22');
  });
  it('tool definitions are strict, in a fixed order, read-only names', () => {
    const defs = adminToolDefinitions();
    expect(defs.every((d) => d.strict === true)).toBe(true);
    expect(defs.map((d) => d.name)).toEqual(ADMIN_TOOLS.map((t) => t.name));
    expect(defs.map((d) => d.name).some((n) => /set|update|write|delete|send/.test(n))).toBe(false);
  });
  it('rough size: rules + dictionary + tools ≈ the plan\'s lean prefix (< 20K chars)', () => {
    expect(adminAssistantSystemPrompt().length + JSON.stringify(adminToolDefinitions()).length).toBeLessThan(20_000);
  });
});

describe('rolling history', () => {
  const m = (role: 'user' | 'assistant', text: string, t: number) => ({ id: `${t}`, role, text, links: [], createdAtMs: t });
  it('last 3 turns verbatim, alternating from a user turn, cache breakpoint on the last block', () => {
    const recent = [m('assistant', 'orphan', 1), m('user', 'q1', 2), m('assistant', 'a1', 3), m('user', 'q2', 4), m('assistant', 'a2', 5), m('user', 'q3', 6), m('assistant', 'a3', 7), m('user', 'q4', 8), m('assistant', 'a4', 9)];
    const h = historyMessages({ summary: null, summarizedUntilMs: 0, recent });
    expect(h.map((x) => x.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
    expect((h[0].content as any[])[0].text).toBe('q2');
    const lastBlocks = h[h.length - 1].content as any[];
    expect(lastBlocks[lastBlocks.length - 1].cache_control).toEqual({ type: 'ephemeral' });
  });
  it('a dangling unanswered question is dropped; summarized messages are skipped', () => {
    const recent = [m('user', 'old', 1), m('assistant', 'old a', 2), m('user', 'q', 3), m('assistant', 'a', 4), m('user', 'failed', 5)];
    const h = historyMessages({ summary: 'x', summarizedUntilMs: 2, recent });
    expect(h.map((x) => (x.content as any[])[0].text)).toEqual(['q', 'a']);
  });
});
