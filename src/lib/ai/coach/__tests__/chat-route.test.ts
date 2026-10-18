/**
 * POST /api/ai-coach/chat with every dependency mocked (no network, no Firestore, no
 * Anthropic key): denial passthrough, the safety short-circuit, and the full client_tool
 * round trip across two requests (pending saved → toolResult resumes → card + done).
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
  executeServerTool: null as any,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/ai/verify-ai-request.server', () => ({
  verifyAiRequest: async () => st.auth,
  aiDenialResponse: (d: any) =>
    new Response(JSON.stringify({ error: d.code }), {
      status: d.status,
      headers: d.retryAfterSec ? { 'Retry-After': String(d.retryAfterSec) } : {},
    }),
}));
vi.mock('@/lib/ai/anthropic.server', () => ({
  getAiModel: () => 'claude-haiku-5-5',
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
  clearPending: async () => {
    st.thread.pending = null;
  },
  maybeRollSummary: async () => false,
}));
vi.mock('@/lib/ai/coach/server-tools.server', () => ({
  executeServerTool: (...a: any[]) => st.executeServerTool(...a),
}));

import { POST } from '@/app/api/ai-coach/chat/route';

function msg(stop: Anthropic.StopReason, ...content: any[]) {
  return { id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: stop, stop_sequence: null, content, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 80, cache_creation_input_tokens: 0 } };
}

const req = (body: unknown) =>
  new Request('http://x/api/ai-coach/chat', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function events(res: Response): Promise<CoachStreamEvent[]> {
  return createSseParser()(await res.text());
}

const PROFILE = { core: { name: 'דנה כהן', gender: 'female', ageGroup: 'adult' }, equipment: { home: ['mat'], office: [], outdoor: [] } };

beforeEach(() => {
  st.auth = { ok: true, uid: 'u1', profile: PROFILE, entitlement: null, config: {} };
  st.script = [];
  st.streamCalls = [];
  st.thread = { summary: null, summarizedUntilMs: 0, pending: null, recent: [] };
  st.appended = [];
  st.recordAiUsage = vi.fn(async () => ({ costUsd: 0 }));
  st.executeServerTool = vi.fn(async () => ({ content: '{"firstName":"דנה"}' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/ai-coach/chat', () => {
  it('passes gate denials through as JSON (429 + Retry-After) without touching the model', async () => {
    st.auth = { ok: false, status: 429, code: 'rate_limited', retryAfterSec: 3600 };
    const res = await POST(req({ message: 'היי' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(st.streamCalls).toHaveLength(0);
  });

  it('rejects malformed bodies with 400', async () => {
    expect((await POST(req({ message: '' }))).status).toBe(400);
    expect((await POST(req({ nope: 1 }))).status).toBe(400);
  });

  it('safety trigger: fixed reply, saved, no model call', async () => {
    const ev = await events(await POST(req({ message: 'יש לי לחץ בחזה, אפשר אימון קל?' })));
    expect(st.streamCalls).toHaveLength(0);
    expect(ev[0].type).toBe('text');
    expect((ev[0] as any).delta).toContain('101');
    expect((ev[0] as any).delta).toContain('התקשרי');
    expect(ev.at(-1)).toEqual({ type: 'done', messageId: 'm2' });
    expect(st.appended.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('client tool round trip across two requests', async () => {
    // Request 1: context tool + generate_workout in one message → client_tool event.
    st.script = [
      msg(
        'tool_use',
        { type: 'text', text: 'בונה לך אימון.', citations: null },
        { type: 'tool_use', id: 'ctx', name: 'get_user_context', input: {} },
        { type: 'tool_use', id: 'gw1', name: 'generate_workout', input: { durationMin: 25, location: 'home', difficulty: 2, domains: ['core', 'legs'], equipment: ['mat', 'not_mine'] } },
      ),
    ];
    const ev1 = await events(await POST(req({ message: 'אימון בטן ורגליים בבית' })));
    expect(ev1.map((e) => e.type)).toEqual(['text', 'tool_status', 'client_tool']);
    const call = ev1[2] as Extract<CoachStreamEvent, { type: 'client_tool' }>;
    expect(call).toMatchObject({ id: 'gw1', name: 'generate_workout' });
    expect((call.input as any).equipment).toEqual(['mat']); // stripped to the user's own gear
    expect(st.thread.pending.toolUseId).toBe('gw1');
    expect(st.appended).toHaveLength(1); // only the user message so far

    // Prompt caching: system has the cached stable block + a volatile session block.
    const p1 = st.streamCalls[0];
    expect(p1.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(p1.system[1].cache_control).toBeUndefined();
    expect(p1.system[1].text).toContain('feminine');
    expect(p1.model).toBe('claude-haiku-5-5');
    expect(st.recordAiUsage).toHaveBeenCalledWith('u1', 'claude-haiku-5-5', expect.objectContaining({ inputTokens: 100, cacheReadTokens: 80 }), { feature: 'ai_coach_chat' });

    // A stale / forged tool id is refused.
    expect((await POST(req({ toolResult: { id: 'other', outcome: { ok: false, error: 'offline' } } }))).status).toBe(409);

    // Request 2: the device posts the compact workout.
    st.script = [msg('end_turn', { type: 'text', text: 'הנה אימון של 25 דקות. לחצי על הכרטיס כדי להתחיל.', citations: null })];
    const ev2 = await events(
      await POST(
        req({
          toolResult: {
            id: 'gw1',
            outcome: {
              ok: true,
              result: {
                workoutId: 'ai-abc-123456',
                title: 'אימון בטן ורגליים',
                minutes: 25,
                location: 'home',
                exercises: Array.from({ length: 6 }, (_, i) => ({ name: `תרגיל ${i}`, sets: 3, reps: 12, seconds: null })),
                decisionRecord: { v: 1, seed: 3, reasons: [], expect: { exercisesCount: 6 } },
              },
            },
          },
        }),
      ),
    );
    expect(ev2.map((e) => e.type)).toEqual(['card', 'text', 'done']);
    expect((ev2[0] as any).card).toEqual({ type: 'workout', workoutId: 'ai-abc-123456', title: 'אימון בטן ורגליים', minutes: 25, exerciseCount: 6, location: 'home' });

    // The continuation replays the stored assistant turn + both tool results in ONE user message.
    const msgs = st.streamCalls[1].messages;
    expect(msgs.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[2].content.map((b: any) => b.tool_use_id)).toEqual(['ctx', 'gw1']);

    // One assistant message for the whole turn, with the card (and its decision record).
    const saved = st.appended.at(-1);
    expect(saved.role).toBe('assistant');
    expect(saved.text).toBe('בונה לך אימון.\nהנה אימון של 25 דקות. לחצי על הכרטיס כדי להתחיל.');
    expect(saved.cards[0]).toMatchObject({ workoutId: 'ai-abc-123456', decisionRecord: { v: 1 } });
    expect(st.thread.pending).toBeNull();
  });

  it('model errors after the stream started become an error event', async () => {
    st.script = []; // exhausted → throws
    const ev = await events(await POST(req({ message: 'מה בתוכנית השבוע?' })));
    expect(ev.at(-1)).toEqual({ type: 'error', code: 'internal' });
  });
});
