/* eslint-disable @typescript-eslint/no-explicit-any -- mocked dependencies */
/**
 * POST /api/insights/workout with every dependency mocked (no network, Firestore or Anthropic):
 * denial passthrough (entitlement / minors / budget), the flag gate, the cache, the rate limit,
 * a model timeout → empty lines, and a good answer cached.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({
  auth: null as any,
  verifyOpts: [] as any[],
  cache: new Map<string, any>(),
  writes: [] as any[],
  rate: { limited: false } as any,
  rateCalls: 0,
  create: null as any,
  usage: [] as any[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/ai/verify-ai-request.server', () => ({
  verifyAiRequest: async (_r: Request, opts: any) => {
    st.verifyOpts.push(opts);
    return st.auth;
  },
  isAiRateLimitExempt: (_e: unknown, p: any) => p?.core?.isSuperAdmin === true,
  aiDenialResponse: (d: any) => new Response(JSON.stringify({ error: d.code }), { status: d.status }),
}));
vi.mock('@/lib/ai/anthropic.server', () => ({
  getAiModel: () => 'claude-haiku-5-5',
  withPromptCaching: ({ system }: any) => ({ system: [{ type: 'text', text: system }] }),
  recordAiUsage: async (...a: any[]) => {
    st.usage.push(a);
    return { costUsd: 0 };
  },
  getAnthropicClient: () => ({ messages: { create: (...a: any[]) => st.create(...a) } }),
  checkAiRateLimit: async () => {
    st.rateCalls++;
    return st.rate;
  },
}));
vi.mock('@/lib/ai/insights/cache.server', () => ({
  readCachedInsight: async (_db: any, uid: string, key: string) => st.cache.get(`${uid}_${key}`) ?? null,
  writeCachedInsight: async (_db: any, uid: string, key: string, lines: any) => {
    st.writes.push({ uid, key, lines });
  },
}));

import { POST } from '@/app/api/insights/workout/route';

const BODY = {
  key: 's:abc:def',
  kind: 'strength',
  durationSec: 1800,
  exercises: [{ name: 'מתח', unit: 'reps', sets: [10, 10] }],
};
const req = (body: unknown = BODY) =>
  new Request('http://x/api/insights/workout', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer t' } });
const grant = (over: Record<string, unknown> = {}, flagOn = true) => ({
  ok: true,
  uid: 'u1',
  profile: { core: { gender: 'male', weight: 80, ageGroup: 'adult', ...over } },
  entitlement: null,
  config: {},
  flags: { enableWorkoutInsightsV1: flagOn },
});
const reply = (text: string) => ({
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 10 },
});

beforeEach(() => {
  st.auth = grant();
  st.verifyOpts = [];
  st.cache.clear();
  st.writes = [];
  st.rate = { limited: false };
  st.rateCalls = 0;
  st.usage = [];
  st.create = async () => reply('{"insight":"עבודה חזקה היום!","funny":"הרמת היום 1,600 ק״ג, 16 גורי פילים!"}');
});

describe('POST /api/insights/workout', () => {
  it('passes AI-gate denials through (no entitlement / minor / budget) and never calls the model', async () => {
    for (const d of [
      { ok: false, status: 403, code: 'ai_not_available' },
      { ok: false, status: 403, code: 'not_adult' },
      { ok: false, status: 503, code: 'over_budget' },
      { ok: false, status: 503, code: 'kill_switch' },
    ]) {
      st.auth = d;
      let called = false;
      st.create = async () => {
        called = true;
        return reply('{}');
      };
      const res = await POST(req());
      expect(res.status).toBe(d.status);
      expect((await res.json()).error).toBe(d.code);
      expect(called).toBe(false);
    }
    // The gate's own rate limit is skipped (it runs only on a cache miss, below).
    expect(st.verifyOpts.every((o) => o?.rateLimit === false)).toBe(true);
  });

  it('flag off → 404, no model call', async () => {
    st.auth = grant({}, false);
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(st.usage).toHaveLength(0);
  });

  it('a super admin previews it with the flag off', async () => {
    st.auth = grant({ isSuperAdmin: true }, false);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(st.rateCalls).toBe(0); // the team is exempt from the per-user limit
  });

  it('bad body → 400', async () => {
    const res = await POST(req({ key: 'x' }));
    expect(res.status).toBe(400);
  });

  it('cache hit → answer without a model call or a rate-limit unit', async () => {
    st.cache.set('u1_s:abc:def', { insight: 'שמור', funny: null });
    const res = await POST(req());
    expect(await res.json()).toEqual({ insight: 'שמור', funny: null });
    expect(st.usage).toHaveLength(0);
    expect(st.rateCalls).toBe(0);
  });

  it('rate limited on a miss → 429', async () => {
    st.rate = { limited: true, retryAfterSec: 60 };
    const res = await POST(req());
    expect(res.status).toBe(429);
  });

  it('good answer → validated lines, cached, usage logged; volume from the stored bodyweight', async () => {
    let sent: any;
    st.create = async (params: any) => {
      sent = params;
      return reply('{"insight":"עבודה חזקה היום!","funny":"הרמת היום 1,600 ק״ג, 16 גורי פילים!"}');
    };
    const res = await POST(req());
    const body = await res.json();
    expect(body.insight).toBe('עבודה חזקה היום!');
    expect(body.funny).toContain('16 גורי פילים');
    expect(st.writes).toHaveLength(1);
    expect(st.usage[0][3]).toMatchObject({ feature: 'workout_insights' });
    const content = sent.messages[0].content as string;
    expect(content).toContain('1,600 kg'); // 20 × 80 × 1.0
    expect(content).not.toContain('80'); // the bodyweight itself never reaches the model
  });

  it('timeout / model error → empty lines (no bubble), nothing cached', async () => {
    st.create = async () => {
      throw Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' });
    };
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ insight: null, funny: null });
    expect(st.writes).toHaveLength(0);
  });

  it('an unsafe line is dropped (invented number)', async () => {
    st.create = async () => reply('{"insight":"הרמת 9,999 ק״ג!","funny":null}');
    const res = await POST(req());
    expect(await res.json()).toEqual({ insight: null, funny: null });
  });
});
