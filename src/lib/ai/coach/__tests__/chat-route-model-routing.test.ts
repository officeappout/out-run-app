/* eslint-disable @typescript-eslint/no-explicit-any -- mocked SDK / thread-store shapes */
/**
 * POST /api/ai-coach/chat — Kelly model routing (model-routing.ts) end to end, every
 * dependency mocked: flags off = byte-identical request and ledger label; the audience gate;
 * smart turns on the smart model with adaptive thinking; the client-tool continuation stays
 * smart and drops stale thinking blocks when the prefix changed; follow-ups of a smart turn;
 * ai_coach_fast_thinking; the per-tier usage label.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createSseParser, type CoachStreamEvent } from '../protocol';

const st = vi.hoisted(() => ({
  auth: null as any,
  script: [] as any[],
  streamCalls: [] as any[],
  thread: { summary: null as string | null, summarizedUntilMs: 0, pending: null as any, recent: [] as any[] },
  appended: [] as any[],
  recordAiUsage: null as any,
  loadSheet: null as any,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/ai/verify-ai-request.server', () => ({
  verifyAiRequest: async () => st.auth,
  aiDenialResponse: (d: any) => new Response(JSON.stringify({ error: d.code }), { status: d.status }),
}));
vi.mock('@/lib/ai/anthropic.server', () => ({
  getAiModel: (tier: string) => (tier === 'smart' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'),
  withPromptCaching: ({ system, tools }: any) => ({
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools,
  }),
  recordAiUsage: (...a: any[]) => st.recordAiUsage(...a),
  createAiMessage: vi.fn(),
  getAnthropicClient: () => ({
    messages: {
      stream: (params: any) => {
        st.streamCalls.push(JSON.parse(JSON.stringify(params)));
        const next = st.script.shift();
        const listeners: Array<(d: string) => void> = [];
        return {
          on: (ev: string, cb: (d: string) => void) => {
            if (ev === 'text') listeners.push(cb);
          },
          finalMessage: async () => {
            if (!next) throw new Error('script exhausted');
            for (const b of next.content) if (b.type === 'text') listeners.forEach((l) => l(b.text));
            return next;
          },
        };
      },
    },
  }),
}));
vi.mock('@/lib/ai/coach/thread-store.server', () => ({
  loadThread: async () => JSON.parse(JSON.stringify(st.thread)),
  appendMessage: async (_db: any, _uid: string, m: any) => {
    st.appended.push(m);
    return `m${st.appended.length}`;
  },
  savePending: async (_db: any, _uid: string, p: any) => {
    st.thread.pending = JSON.parse(JSON.stringify({ ...p, createdAtMs: Date.now() }));
  },
  claimPending: async (_db: any, _uid: string, id: string) => {
    const p = st.thread.pending;
    if (!p || p.toolUseId !== id) return null;
    st.thread.pending = null;
    return JSON.parse(JSON.stringify(p));
  },
  clearPending: async () => {
    st.thread.pending = null;
  },
  maybeRollSummary: async () => false,
  appendAiPausedUserMessage: async () => ({ ok: true, id: 'pm1' }),
}));
vi.mock('@/lib/ai/coach/server-tools.server', () => ({
  executeServerTool: async () => ({ content: '{"ok":true}' }),
  loadUserContextSheet: (...a: any[]) => st.loadSheet(...a),
}));

import { POST } from '@/app/api/ai-coach/chat/route';

function msg(model: string, stop: Anthropic.StopReason, ...content: any[]) {
  return { id: 'm', type: 'message', role: 'assistant', model, stop_reason: stop, stop_sequence: null, content, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
}
const text = (t: string) => ({ type: 'text', text: t, citations: null });
const THINK = { type: 'thinking', thinking: '', signature: 'sig-1' };

const req = (body: unknown) =>
  new Request('http://x/api/ai-coach/chat', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function events(res: Response): Promise<CoachStreamEvent[]> {
  return createSseParser()(await res.text());
}

const SHEET = {
  firstName: 'דוד', gender: 'male', ageBand: null, goals: { mainGoal: null, selected: [] }, primaryTrack: null,
  programs: [{ id: 'full_body', name: 'גוף מלא', level: 15, percentToNext: 40 }], injuries: [], streakDays: 3,
  lastWorkouts: [], today: [], thisWeek: [], preferredTrainingTime: null,
  equipment: { home: ['mat'], office: [], outdoor: [] }, area: null,
};
const OWNER = { core: { name: 'דוד', gender: 'male', ageGroup: 'adult', isSuperAdmin: true }, equipment: { home: ['mat'], office: [], outdoor: [] } };
const USER = { core: { name: 'דנה', gender: 'female', ageGroup: 'adult' }, equipment: { home: ['mat'], office: [], outdoor: [] } };
const ROUTING_ON = { aiCoachSmartRouting: true };

/** Exactly the request Kelly sent before model routing existed (keys in the same order). */
function expectLegacyParams(p: any) {
  expect(Object.keys(p)).toEqual(['model', 'max_tokens', 'system', 'tools', 'tool_choice', 'thinking', 'output_config', 'messages']);
  expect(p.model).toBe('claude-haiku-5-5');
  expect(p.max_tokens).toBe(600);
  expect(p.thinking).toEqual({ type: 'disabled' });
  expect(p.output_config).toEqual({ effort: 'low' });
}

beforeEach(() => {
  st.auth = { ok: true, uid: 'u1', profile: OWNER, entitlement: null, config: {} };
  st.script = [];
  st.streamCalls = [];
  st.thread = { summary: null, summarizedUntilMs: 0, pending: null, recent: [] };
  st.appended = [];
  st.recordAiUsage = vi.fn(async () => ({ costUsd: 0 }));
  st.loadSheet = vi.fn(async () => SHEET);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Kelly model routing — flags off / audience', () => {
  it('flags off (super admin too): legacy request params, legacy label, no tier in the log', async () => {
    st.script = [msg('claude-haiku-5-5', 'end_turn', text('בונה.'))];
    await events(await POST(req({ message: 'תבנה לי אימון בטן' })));
    expect(st.streamCalls).toHaveLength(1);
    expectLegacyParams(st.streamCalls[0]);
    expect(st.recordAiUsage).toHaveBeenCalledWith('u1', 'claude-haiku-5-5', expect.anything(), { feature: 'ai_coach_chat' });
    const saved = st.appended.at(-1);
    expect('tier' in saved.log).toBe(false);
    expect('tierReason' in saved.log).toBe(false);
  });

  it('flags on, all-users off: a regular user gets the legacy request', async () => {
    st.auth = { ok: true, uid: 'u2', profile: USER, entitlement: null, config: {}, flags: { ...ROUTING_ON, aiCoachFastThinking: true } };
    st.script = [msg('claude-haiku-5-5', 'end_turn', text('בונה.'))];
    await events(await POST(req({ message: 'תבנה לי אימון בטן' })));
    expectLegacyParams(st.streamCalls[0]);
    expect(st.recordAiUsage).toHaveBeenCalledWith('u2', 'claude-haiku-5-5', expect.anything(), { feature: 'ai_coach_chat' });
  });

  it('all-users on: a regular user is routed', async () => {
    st.auth = { ok: true, uid: 'u2', profile: USER, entitlement: null, config: {}, flags: { ...ROUTING_ON, aiCoachModelRoutingAllUsers: true } };
    st.script = [msg('claude-sonnet-5-5', 'end_turn', text('בונה.'))];
    await events(await POST(req({ message: 'תבנה לי אימון בטן' })));
    expect(st.streamCalls[0].model).toBe('claude-sonnet-5-5');
  });
});

describe('Kelly model routing — super admin, ai_coach_smart_routing on', () => {
  beforeEach(() => {
    st.auth = { ...st.auth, flags: ROUTING_ON };
  });

  it('a workout ask runs on the smart model: adaptive thinking, effort medium, room for thinking, smart label + cost', async () => {
    st.script = [msg('claude-sonnet-5-5', 'end_turn', THINK, text('בונה לך משהו.'))];
    await events(await POST(req({ message: 'מתח ופלאנץ׳' })));
    const p = st.streamCalls[0];
    expect(p.model).toBe('claude-sonnet-5-5');
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p.max_tokens).toBe(6000);
    expect(p.tool_choice).toEqual({ type: 'auto' });
    expect(st.recordAiUsage).toHaveBeenCalledWith('u1', 'claude-sonnet-5-5', expect.anything(), { feature: 'ai_coach_chat_smart', featureCost: true });
    const saved = st.appended.at(-1);
    expect(saved.log).toMatchObject({ model: 'claude-sonnet-5-5', tier: 'smart', tierReason: 'workout_combo' });
    expect(saved.text).toBe('בונה לך משהו.');
  });

  it('a lookup stays on the fast model with the legacy params, fast label', async () => {
    st.script = [msg('claude-haiku-5-5', 'end_turn', text('היום: גוף מלא.'))];
    await events(await POST(req({ message: 'מה יש לי היום' })));
    expectLegacyParams(st.streamCalls[0]);
    expect(st.recordAiUsage).toHaveBeenCalledWith('u1', 'claude-haiku-5-5', expect.anything(), { feature: 'ai_coach_chat_fast', featureCost: true });
    expect(st.appended.at(-1).log).toMatchObject({ tier: 'fast', tierReason: 'factual_lookup' });
  });

  it('a short follow-up of a smart answer stays smart', async () => {
    st.thread.recent = [
      { id: 'a', role: 'user', text: 'תבנה לי שבוע', cards: [], createdAtMs: 1 },
      { id: 'b', role: 'assistant', text: 'מציע שינוי', cards: [], createdAtMs: 2, tier: 'smart' },
    ];
    st.script = [msg('claude-sonnet-5-5', 'end_turn', text('מעולה.'))];
    await events(await POST(req({ message: 'כן' })));
    expect(st.streamCalls[0].model).toBe('claude-sonnet-5-5');
    expect(st.appended.at(-1).log.tierReason).toBe('follow_up');
  });

  it('client-tool round trip: the continuation stays smart and replays its thinking block (same prefix)', async () => {
    st.script = [msg('claude-sonnet-5-5', 'tool_use', THINK, { type: 'tool_use', id: 'gw1', name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2, domains: ['core'] } })];
    const ev1 = await events(await POST(req({ message: 'תבנה לי אימון בטן' })));
    expect(ev1.at(-1)?.type).toBe('client_tool');
    expect(st.thread.pending.state).toMatchObject({ tier: 'smart' });
    expect(typeof st.thread.pending.state.prefixKey).toBe('string');

    st.script = [msg('claude-sonnet-5-5', 'end_turn', text('הנה האימון.'))];
    await events(await POST(req({ toolResult: { id: 'gw1', outcome: { ok: false, error: 'offline' } } })));
    const p2 = st.streamCalls[1];
    expect(p2.model).toBe('claude-sonnet-5-5');
    expect(p2.thinking).toEqual({ type: 'adaptive' });
    expect(p2.messages[1].content.map((b: any) => b.type)).toEqual(['thinking', 'tool_use']);
    expect(st.appended.at(-1).log).toMatchObject({ tier: 'smart', tierReason: 'continuation' });
  });

  it('client-tool round trip: a changed prefix (new user sheet) drops the stale thinking block', async () => {
    st.script = [msg('claude-sonnet-5-5', 'tool_use', THINK, { type: 'tool_use', id: 'gw1', name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2, domains: ['core'] } })];
    await events(await POST(req({ message: 'תבנה לי אימון בטן' })));

    st.loadSheet = vi.fn(async () => ({ ...SHEET, streakDays: 4 }));
    st.script = [msg('claude-sonnet-5-5', 'end_turn', text('הנה האימון.'))];
    await events(await POST(req({ toolResult: { id: 'gw1', outcome: { ok: false, error: 'offline' } } })));
    expect(st.streamCalls[1].messages[1].content.map((b: any) => b.type)).toEqual(['tool_use']);
    expect(st.appended.at(-1).log.guards).toContainEqual({ type: 'model_routing', action: 'dropped_stale_thinking_blocks' });
  });

  it('routing switched off mid-turn: the continuation runs fast with the legacy params and no thinking blocks', async () => {
    st.script = [msg('claude-sonnet-5-5', 'tool_use', THINK, { type: 'tool_use', id: 'gw1', name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2, domains: ['core'] } })];
    await events(await POST(req({ message: 'תבנה לי אימון בטן' })));

    st.auth = { ...st.auth, flags: {} };
    st.script = [msg('claude-haiku-5-5', 'end_turn', text('הנה.'))];
    await events(await POST(req({ toolResult: { id: 'gw1', outcome: { ok: false, error: 'offline' } } })));
    expectLegacyParams(st.streamCalls[1]);
    expect(st.streamCalls[1].messages[1].content.map((b: any) => b.type)).toEqual(['tool_use']);
  });
});

describe('Kelly model routing — ai_coach_fast_thinking', () => {
  it('fast turns think: Haiku adaptive, effort medium, room for thinking', async () => {
    st.auth = { ...st.auth, flags: { aiCoachFastThinking: true } };
    st.script = [msg('claude-haiku-5-5', 'end_turn', THINK, text('היי דוד!'))];
    await events(await POST(req({ message: 'תבנה לי אימון בטן' }))); // smart routing off → fast
    const p = st.streamCalls[0];
    expect(p.model).toBe('claude-haiku-5-5');
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p.max_tokens).toBe(4000);
    expect(st.recordAiUsage).toHaveBeenCalledWith('u1', 'claude-haiku-5-5', expect.anything(), { feature: 'ai_coach_chat_fast', featureCost: true });
  });
});
