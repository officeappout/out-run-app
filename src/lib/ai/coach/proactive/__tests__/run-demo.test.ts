/* eslint-disable @typescript-eslint/no-explicit-any -- module fakes */
/**
 * Proactive run — the demo world never costs an LLM call (or a per-user read):
 *  - collectCandidates drops `demo_` uids before buildProactiveState (free, no read)
 *  - buildProactiveState returns null for a core.demo user (from the users read it already does)
 * Real users are evaluated and personalised exactly as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({
  built: [] as string[],
  flex: [] as string[],
  written: [] as string[],
  flagOn: false,
  usage: [] as Array<{ usage: unknown; model: unknown }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) } }));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({}) }));
vi.mock('@/lib/ai/demo-kelly.server', () => ({
  isDemoKellyOn: async () => st.flagOn,
  recordDemoKellyUsage: async (_db: unknown, usage: unknown, model: unknown) => {
    st.usage.push({ usage, model });
  },
}));
vi.mock('../slots', () => ({ dueTriggers: () => ['post_workout'] }));
vi.mock('../loaders.server', () => ({
  workoutsSavedBetween: async () =>
    ['demo_p1', 'u1', 'u9', 'u2'].map((uid) => ({ uid, workout: { id: `w-${uid}`, endedAtMs: 1, minutes: 30 } })),
  usersTrainingToday: async () => [],
  usersActiveSince: async () => [],
}));
vi.mock('../context.server', () => ({
  israelClock: () => ({ dateKey: '2026-10-20', hour: 18, minute: 0, dow: 2, ms: 0 }),
  buildProactiveState: async (i: { uid: string; allowDemo?: boolean; onDemo?: () => void }) => {
    st.built.push(i.uid);
    // stands in for the real users read: u9 carries core.demo
    const demo = i.uid === 'u9' || i.uid.startsWith('demo_');
    if (demo && !i.allowDemo) {
      i.onDemo?.();
      return null;
    }
    return { gender: 'male', firstName: 'דוד', ...(demo ? { demo: true } : {}) };
  },
}));
vi.mock('../select', () => ({ selectProactive: () => ({ trigger: 'post_workout', templateKey: 't', vars: {}, why: 'w' }) }));
vi.mock('../templates', () => ({ renderProactive: () => ({ text: 'x', flexHint: 'say something' }) }));
vi.mock('../flex-facts', () => ({ flexFacts: () => [] }));
vi.mock('../llm.server', () => ({
  PROACTIVE_LLM_MAX_PER_RUN: 150,
  personalizeFlex: vi.fn(async (_db: unknown, r: { uid: string }) => {
    st.flex.push(r.uid);
    return { sentence: null, costUsd: 0.001, usage: { inputTokens: 300, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-test' };
  }),
}));
vi.mock('../send.server', () => ({
  writeProactiveMessage: async (_db: unknown, m: { uid: string }) => {
    st.written.push(m.uid);
    return { written: true };
  },
}));

import { runProactiveSlice } from '../run.server';

const flags: any = { aiCoachProactive: true, kellyUnifiedV1: true, aiCoachProactiveLlm: true };

beforeEach(() => {
  st.built = [];
  st.flex = [];
  st.written = [];
  st.flagOn = false;
  st.usage = [];
});

describe('runProactiveSlice — demo world', () => {
  it('a demo_ uid is never built; a core.demo user never reaches the LLM; real users unchanged', async () => {
    const r = await runProactiveSlice({} as any, { flags, now: new Date('2026-10-20T15:00:00Z') });
    expect(st.built).toEqual(['u1', 'u2', 'u9']); // demo_p1 dropped before any per-user read
    expect(st.flex).toEqual(['u1', 'u2']);
    expect(st.written).toEqual(['u1', 'u2']);
    expect(r).toMatchObject({ candidates: 3, skippedDemo: 2, demoLlmCalls: 0, evaluated: 3, sent: 2, llmCalls: 2, stoppedBy: 'done' });
    expect(st.usage).toEqual([]); // real users never write demo usage
  });

  it('demo_kelly on: demo users run normally and only their calls are counted', async () => {
    st.flagOn = true;
    const r = await runProactiveSlice({} as any, { flags, now: new Date('2026-10-20T15:00:00Z') });
    expect(st.built).toEqual(['demo_p1', 'u1', 'u2', 'u9']);
    expect(st.flex).toEqual(['demo_p1', 'u1', 'u2', 'u9']);
    expect(r).toMatchObject({ candidates: 4, skippedDemo: 0, demoLlmCalls: 2, sent: 4, llmCalls: 4 });
    expect(st.usage).toHaveLength(2);
    expect(st.usage[0]).toEqual({ usage: { inputTokens: 300, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-test' });
  });
});
