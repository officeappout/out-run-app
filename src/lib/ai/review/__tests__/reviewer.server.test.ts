/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Firestore / SDK fakes */
/**
 * runAiCoachReview end to end on an in-memory Firestore stand-in (synthetic data): gates,
 * cursors, opt-out, settle window, budget stop, dryRun, and what gets written. The grader
 * is a mock — no Anthropic call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const st = vi.hoisted(() => ({
  config: { dailyBudgetUsd: 5, killSwitch: false, rateLimitPerHour: 20, rateLimitPerDay: 40, reviewBudgetUsd: 2 },
  budgetError: null as null | { reason: string },
  usage: [] as any[],
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => {
  const ts = (ms: number) => ({ __ms: ms, toMillis: () => ms });
  return {
    Timestamp: { fromMillis: ts },
    FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => ({ __ts: true }), delete: () => ({ __del: true }) },
  };
});
vi.mock('@/lib/ai/anthropic.server', () => {
  class AiUnavailableError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  }
  return {
    AiUnavailableError,
    aiDayKey: () => '2026-10-18',
    loadAiConfig: async () => st.config,
    assertAiBudget: async () => {
      if (st.budgetError) throw new AiUnavailableError(st.budgetError.reason);
    },
    getAiModel: (tier: string) => (tier === 'smart' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'),
    getAnthropicClient: () => {
      throw new Error('no real client in tests');
    },
    recordAiUsage: async (...a: unknown[]) => {
      st.usage.push(a);
      return { costUsd: 0 };
    },
    withPromptCaching: ({ system }: { system: string }) => ({ system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] }),
  };
});

import { runAiCoachReview } from '../reviewer.server';

// ─── Tiny Firestore stand-in ─────────────────────────────────────────────────

type Data = Record<string, any>;
const msOf = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);
const cmpVal = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);

function resolve(prev: any, next: any): any {
  if (next && typeof next === 'object' && '__inc' in next) return (typeof prev === 'number' ? prev : 0) + next.__inc;
  if (next && typeof next === 'object' && '__ts' in next) return { toMillis: () => 0 };
  if (next && typeof next === 'object' && !Array.isArray(next) && typeof next.toMillis !== 'function') {
    const out: Data = { ...(prev && typeof prev === 'object' ? prev : {}) };
    for (const [k, v] of Object.entries(next)) out[k] = resolve(out[k], v);
    return out;
  }
  return next;
}

function createDb(seed: Record<string, Data>) {
  const docs = new Map<string, Data>(Object.entries(seed));
  const writes: string[] = [];
  const docRef = (path: string): any => ({
    id: path.split('/').pop(),
    __path: path,
    get: async () => ({ id: path.split('/').pop(), exists: docs.has(path), data: () => docs.get(path) }),
    set: async (data: Data, o?: { merge?: boolean }) => {
      writes.push(path);
      docs.set(path, o?.merge ? resolve(docs.get(path) ?? {}, data) : resolve({}, data));
    },
    collection: (name: string) => col(`${path}/${name}`),
  });
  const col = (path: string): any => {
    const q = (filters: Array<[string, string, any]>, order: [string, string] | null, lim: number | null): any => ({
      where: (f: string, op: string, v: any) => q([...filters, [f, op, v]], order, lim),
      orderBy: (f: string, dir = 'asc') => q(filters, [f, dir], lim),
      limit: (n: number) => q(filters, order, n),
      get: async () => {
        const depth = path.split('/').length + 1;
        let rows = Array.from(docs.entries())
          .filter(([p]) => p.startsWith(`${path}/`) && p.split('/').length === depth)
          .map(([p, d]) => ({ id: p.split('/').pop()!, ref: docRef(p), data: () => d }));
        for (const [f, op, v] of filters) {
          rows = rows.filter((r) => {
            const a = cmpVal(r.data()[f]);
            const b = cmpVal(v);
            return op === '>' ? a > b : op === '>=' ? a >= b : op === '==' ? a === b : true;
          });
        }
        if (order) rows.sort((x, y) => (msOf(x.data()[order[0]]) - msOf(y.data()[order[0]])) * (order[1] === 'desc' ? -1 : 1));
        if (lim !== null) rows = rows.slice(0, lim);
        return { docs: rows, empty: rows.length === 0, size: rows.length };
      },
    });
    return { doc: (id: string) => docRef(`${path}/${id}`), ...q([], null, null) };
  };
  const db = {
    docs,
    writes,
    collection: (name: string) => col(name),
    getAll: async (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      return {
        set: (ref: any, data: Data, o?: { merge?: boolean }) => ops.push(() => ref.set(data, o)),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
  };
  return db;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-18T03:00:00Z'); // 06:00 Israel
const H = 3_600_000;
const T = (hoursAgo: number) => ({ toMillis: () => NOW.getTime() - hoursAgo * H });

function seed(): Record<string, Data> {
  return {
    'ai_coach_threads/u1': { updatedAt: T(2) },
    'ai_coach_threads/u1/messages/m1': { role: 'user', text: 'תבנה לי אימון בטן', createdAt: T(3) },
    'ai_coach_threads/u1/messages/m2': {
      role: 'assistant',
      text: 'בניתי לך אימון.',
      createdAt: T(2.9),
      cards: [{ workoutId: 'ai-1', title: 'אימון', minutes: 20, exerciseCount: 5, location: 'home' }],
      log: { model: 'claude-haiku-5-5', toolCalls: [{ name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2, domains: [] }, resultSummary: null }], guards: [] },
    },
    'ai_coach_threads/u1/messages/m3': { role: 'user', text: 'רגע יש לך זכרון?', createdAt: T(2.5) },
    'ai_coach_threads/u1/messages/m4': { role: 'assistant', text: 'כן, אני זוכרת.', createdAt: T(2.4) },
    // a user message still waiting for its reply (inside the run window) — not reviewed now
    'ai_coach_threads/u1/messages/m5': { role: 'user', text: 'עוד שאלה', createdAt: T(2) },
    'users/u1': { core: { name: 'דוד כהן', gender: 'male', email: 'secret@example.com' } },

    // opted out
    'ai_coach_threads/u2': { updatedAt: T(1) },
    'ai_coach_threads/u2/messages/m1': { role: 'user', text: 'שלום', createdAt: T(1.5) },
    'ai_coach_threads/u2/messages/m2': { role: 'assistant', text: 'היי', createdAt: T(1.4) },
    'users/u2': { core: { name: 'נועה', aiReviewOptOut: true } },

    // already reviewed up to its last message
    'ai_coach_threads/u3': { updatedAt: T(5) },
    'ai_coach_threads/u3/messages/m1': { role: 'user', text: 'שלום', createdAt: T(6) },
    'ai_coach_threads/u3/messages/m2': { role: 'assistant', text: 'היי', createdAt: T(5) },
    'ai_coach_review_cursors/u3': { reviewedUntil: T(5) },
    'users/u3': { core: { name: 'רון' } },
  };
}

function graderReply(): Anthropic.Message {
  return {
    id: 'g',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          issues: [
            { turnIndex: 0, category: 'request_mismatch', severity: 2, evidence: 'תבנה לי אימון בטן', expected: 'core', likelyRootCause: 'tool_mapping', suggestedFix: 'map בטן→core' },
            { turnIndex: 1, category: 'unhelpful', severity: 1, evidence: 'כן, אני זוכרת.', expected: 'explain memory', likelyRootCause: 'prompt', suggestedFix: 'x' },
          ],
          score: 2,
          summary: 'Abs request mapped wrong; feminine voice.',
        }),
        citations: null,
      },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 4000, output_tokens: 800, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

beforeEach(() => {
  st.config = { dailyBudgetUsd: 5, killSwitch: false, rateLimitPerHour: 20, rateLimitPerDay: 40, reviewBudgetUsd: 2 };
  st.budgetError = null;
  st.usage = [];
});

describe('runAiCoachReview', () => {
  it('reviews due threads, skips opted-out / up-to-date ones, writes review + stats + cursor', async () => {
    const db = createDb(seed());
    const grader = vi.fn().mockResolvedValue(graderReply());
    const r = await runAiCoachReview(db as any, { now: NOW }, { callGrader: grader });

    expect(r).toMatchObject({ reviewed: 1, skippedOptOut: 1, failed: 0, remaining: false, stoppedBy: null });
    expect(grader).toHaveBeenCalledTimes(1);
    const params = grader.mock.calls[0][0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config.format.type).toBe('json_schema');
    const sent = params.messages[0].content as string;
    expect(sent).toContain('User first name: דוד;');
    expect(sent).not.toContain('כהן');
    expect(sent).not.toContain('secret@example.com');
    expect(sent).not.toContain('עוד שאלה'); // the dangling user message waits for its reply

    const docId = r.reviewDocIds[0];
    expect(docId.startsWith('u1_2026-10-18-')).toBe(true);
    const review = db.docs.get(`ai_coach_reviews/${docId}`)!;
    expect(review.turns).toHaveLength(2);
    expect(review.score).toBe(2);
    // pre-check tone_gender + request_mismatch from the pre-check (domains) win their slots; grader adds unhelpful
    expect(review.issues.map((i: any) => `${i.source}:${i.turnIndex}:${i.category}`).sort()).toEqual([
      'llm:1:unhelpful',
      'precheck:0:request_mismatch',
      'precheck:1:tone_gender',
    ]);
    expect(review.expireAt.toMillis() - NOW.getTime()).toBe(90 * 24 * H);

    const stats = db.docs.get('ai_coach_review_stats/2026-10-18')!;
    expect(stats).toMatchObject({ reviews: 1, turns: 2, issues: 3, scoreSum: 2, scoreCount: 1 });
    expect(stats.byCategory).toEqual({ request_mismatch: 1, tone_gender: 1, unhelpful: 1 });
    expect(stats.costUsd).toBeCloseTo((4000 * 2 + 800 * 10) / 1e6);

    expect(msOf(db.docs.get('ai_coach_review_cursors/u1')!.reviewedUntil)).toBe(NOW.getTime() - 2.4 * H);
    expect(db.docs.get('ai_coach_review_cursors/u2')!.optedOut).toBe(true);
    expect(st.usage).toHaveLength(1);
    expect(st.usage[0][0]).toBe('_system_ai_coach_review');

    // nothing written to the coach's own collections
    expect(db.writes.filter((p) => p.startsWith('ai_coach_threads') || p.startsWith('users'))).toEqual([]);

    // second run: nothing new
    const again = await runAiCoachReview(db as any, { now: NOW }, { callGrader: grader });
    expect(again.reviewed).toBe(0);
    expect(grader).toHaveBeenCalledTimes(1);
  });

  it('demo world: a demo_ uid and a core.demo user are never graded; real users unchanged', async () => {
    const demoThread = (uid: string): Record<string, Data> => ({
      [`ai_coach_threads/${uid}`]: { updatedAt: T(1) },
      [`ai_coach_threads/${uid}/messages/m1`]: { role: 'user', text: 'שלום', createdAt: T(1.5) },
      [`ai_coach_threads/${uid}/messages/m2`]: { role: 'assistant', text: 'היי', createdAt: T(1.4) },
    });
    const db = createDb({
      ...seed(),
      ...demoThread('demo_p1'),
      'users/demo_p1': { core: { name: 'דמו' } },
      ...demoThread('u9'),
      'users/u9': { core: { name: 'דמו', demo: { tenantId: 'demo-city', personaId: 'p9', v: 1 } } },
    });
    const grader = vi.fn().mockResolvedValue(graderReply());
    const r = await runAiCoachReview(db as any, { now: NOW }, { callGrader: grader });
    expect(r).toMatchObject({ reviewed: 1, skippedOptOut: 1, skippedDemo: 2, failed: 0 });
    expect(grader).toHaveBeenCalledTimes(1);
    expect(r.reviewDocIds.every((id) => id.startsWith('u1_'))).toBe(true);
    // the core.demo thread's cursor moves (no slot every morning); the demo_ one is never touched
    expect(db.docs.get('ai_coach_review_cursors/u9')!.demo).toBe(true);
    expect(db.docs.has('ai_coach_review_cursors/demo_p1')).toBe(false);
    expect(st.usage).toHaveLength(1);
  });

  it('demo_kelly on: demo users are graded and their calls counted in demo_registry usage; real users never are', async () => {
    const demoThread = (uid: string): Record<string, Data> => ({
      [`ai_coach_threads/${uid}`]: { updatedAt: T(1) },
      [`ai_coach_threads/${uid}/messages/m1`]: { role: 'user', text: 'שלום', createdAt: T(1.5) },
      [`ai_coach_threads/${uid}/messages/m2`]: { role: 'assistant', text: 'היי', createdAt: T(1.4) },
    });
    const db = createDb({
      ...seed(),
      'system_config/feature_flags': { demo_kelly: true },
      ...demoThread('demo_p1'),
      'users/demo_p1': { core: { name: 'דמו' } },
      ...demoThread('u9'),
      'users/u9': { core: { name: 'דמו', demo: { tenantId: 'demo-city', personaId: 'p9', v: 1 } } },
    });
    const grader = vi.fn().mockResolvedValue(graderReply());
    const r = await runAiCoachReview(db as any, { now: NOW }, { callGrader: grader });
    expect(r).toMatchObject({ reviewed: 3, skippedDemo: 0, demoLlmCalls: 2 });
    expect(grader).toHaveBeenCalledTimes(3);
    const usage = db.docs.get('demo_registry/usage/days/2026-10-18')!;
    // only the two demo users' calls (4000 in / 800 out each); u1's call is not here
    expect(usage).toMatchObject({ llmCalls: 2, inputTokens: 8000, outputTokens: 1600 });
    expect(usage.bySource.kelly).toMatchObject({ llmCalls: 2, inputTokens: 8000, outputTokens: 1600, model: 'claude-sonnet-5-5' });
  });

  it('demo_kelly off: no usage doc is ever written', async () => {
    const db = createDb({ ...seed(), 'system_config/feature_flags': { demo_kelly: false } });
    await runAiCoachReview(db as any, { now: NOW }, { callGrader: vi.fn().mockResolvedValue(graderReply()) });
    expect(db.writes.filter((p) => p.startsWith('demo_registry'))).toEqual([]);
  });

  it('dryRun writes nothing', async () => {
    const db = createDb(seed());
    const r = await runAiCoachReview(db as any, { now: NOW, dryRun: true }, { callGrader: vi.fn().mockResolvedValue(graderReply()) });
    expect(r.reviewed).toBe(1);
    expect(r.dryRunDocs).toHaveLength(1);
    expect(db.writes).toEqual([]);
    expect(st.usage).toEqual([]);
  });

  it('gates: review off, kill switch, review budget spent', async () => {
    const grader = vi.fn();
    st.config = { ...st.config, reviewBudgetUsd: 0 };
    expect((await runAiCoachReview(createDb(seed()) as any, { now: NOW }, { callGrader: grader })).stoppedBy).toBe('review_off');
    st.config = { ...st.config, reviewBudgetUsd: 2 };
    st.budgetError = { reason: 'kill_switch' };
    expect((await runAiCoachReview(createDb(seed()) as any, { now: NOW }, { callGrader: grader })).stoppedBy).toBe('kill_switch');
    st.budgetError = null;
    const spent = createDb({ ...seed(), 'ai_coach_review_stats/2026-10-18': { costUsd: 2.5 } });
    expect((await runAiCoachReview(spent as any, { now: NOW }, { callGrader: grader })).stoppedBy).toBe('review_budget');
    expect(grader).not.toHaveBeenCalled();
  });

  it('a grader API failure stores nothing and keeps the cursor (retried next run)', async () => {
    const db = createDb(seed());
    const r = await runAiCoachReview(db as any, { now: NOW }, { callGrader: vi.fn().mockRejectedValue(new Error('529 overloaded')) });
    expect(r).toMatchObject({ reviewed: 0, failed: 1 });
    expect(Array.from(db.docs.keys()).some((k) => k.startsWith('ai_coach_reviews/'))).toBe(false);
    expect(db.docs.has('ai_coach_review_cursors/u1')).toBe(false);
  });

  it('an invalid grader answer still stores the pre-checks, with graderError', async () => {
    const db = createDb(seed());
    const bad = { ...graderReply(), content: [{ type: 'text', text: '{"score": 9}', citations: null }] } as Anthropic.Message;
    const r = await runAiCoachReview(db as any, { now: NOW }, { callGrader: vi.fn().mockResolvedValue(bad) });
    const review = db.docs.get(`ai_coach_reviews/${r.reviewDocIds[0]}`)!;
    expect(review.graderError).toMatch(/^schema/);
    expect(review.score).toBeNull();
    expect(review.issues.every((i: any) => i.source === 'precheck')).toBe(true);
    expect(db.docs.get('ai_coach_review_stats/2026-10-18')!.graderErrors).toBe(1);
  });

  it('maxThreads caps the slice and reports remaining', async () => {
    const r = await runAiCoachReview(createDb(seed()) as any, { now: NOW, maxThreads: 1 }, { callGrader: vi.fn().mockResolvedValue(graderReply()) });
    expect(r.remaining).toBe(true);
    expect(r.stoppedBy).toBe('cap');
  });
});
