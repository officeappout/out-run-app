/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory Firestore stand-in */
/**
 * Nightly memory run — the demo world never costs an extraction (LLM call): a `demo_` uid
 * drops without a read, a core.demo user drops after one batched field-masked read, and a
 * failing check stops the slice (fail closed). Real users are extracted as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({ extracted: [] as string[], flagOn: false, usage: [] as Array<{ usage: unknown; model: unknown }> }));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) } }));
vi.mock('@/lib/ai/anthropic.server', () => ({ AiUnavailableError: class extends Error {} }));
vi.mock('@/lib/ai/entitlement.server', () => ({ getServerFeatureFlags: async () => ({ aiCoachMemory: true }) }));
vi.mock('@/lib/ai/demo-kelly.server', () => ({
  isDemoKellyOn: async () => st.flagOn,
  recordDemoKellyUsage: async (_db: unknown, usage: unknown, model: unknown) => {
    st.usage.push({ usage, model });
  },
}));
vi.mock('../extract.server', () => ({
  extractMemoryForUser: vi.fn(async (_db: unknown, uid: string) => {
    st.extracted.push(uid);
    return { status: 'updated', facts: 1, costUsd: 0.01, usage: { inputTokens: 900, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-test' };
  }),
}));

import { runMemorySlice } from '../run.server';

const users: Record<string, Record<string, unknown>> = {
  u1: { core: { name: 'אמיתי' } },
  u2: { core: { name: 'אמיתית' } },
  u9: { core: { name: 'דמו', demo: { tenantId: 'demo-city', personaId: 'p9', v: 1 } } },
  demo_p1: { core: { name: 'דמו', demo: { tenantId: 'demo-city', personaId: 'p1', v: 1 } } },
};
const threadIds = ['demo_p1', 'u1', 'u2', 'u9'];

function makeDb(opts: { failGetAll?: boolean } = {}) {
  const getAllCalls: Array<{ ids: string[]; options: unknown }> = [];
  const db: any = {
    collection: (name: string) => {
      if (name === 'users') return { doc: (id: string) => ({ __id: id }) };
      const q: any = { where: () => q, select: () => q, limit: () => q, get: async () => ({ docs: threadIds.map((id) => ({ id })) }) };
      return q;
    },
    getAll: async (...args: any[]) => {
      if (opts.failGetAll) throw new Error('unavailable');
      const refs = args.filter((a) => typeof a?.__id === 'string');
      getAllCalls.push({ ids: refs.map((r) => r.__id), options: args[args.length - 1] });
      return refs.map((r) => ({ id: r.__id, data: () => users[r.__id] }));
    },
  };
  return { db, getAllCalls };
}

beforeEach(() => {
  st.extracted = [];
  st.flagOn = false;
  st.usage = [];
});

describe('runMemorySlice — demo world', () => {
  it('skips a demo_ uid (no read) and a core.demo user; real users are extracted', async () => {
    const { db, getAllCalls } = makeDb();
    const r = await runMemorySlice(db, { now: new Date('2026-10-20T00:30:00Z') });
    expect(st.extracted).toEqual(['u1', 'u2']);
    expect(r).toMatchObject({ threads: 4, skippedDemo: 2, extracted: 2, updated: 2, stoppedBy: 'done' });
    // one batched read, field-masked, never for the demo_ uid
    expect(getAllCalls).toHaveLength(1);
    expect(getAllCalls[0].ids).toEqual(['u1', 'u2', 'u9']);
    expect(getAllCalls[0].options).toEqual({ fieldMask: ['core.demo'] });
    expect(st.usage).toEqual([]); // real users never write demo usage
  });

  it('demo_kelly on: demo users are extracted and only their calls are counted', async () => {
    st.flagOn = true;
    const { db } = makeDb();
    const r = await runMemorySlice(db, { now: new Date('2026-10-20T00:30:00Z') });
    expect(st.extracted).toEqual(['demo_p1', 'u1', 'u2', 'u9']);
    expect(r).toMatchObject({ skippedDemo: 0, demoLlmCalls: 2, extracted: 4 });
    expect(st.usage).toEqual([
      { usage: { inputTokens: 900, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-test' },
      { usage: { inputTokens: 900, outputTokens: 60, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: 'claude-haiku-test' },
    ]);
  });

  it('fails closed: the demo check failing extracts nobody', async () => {
    const { db } = makeDb({ failGetAll: true });
    const r = await runMemorySlice(db, { now: new Date('2026-10-20T00:30:00Z') });
    expect(st.extracted).toEqual([]);
    expect(r.stoppedBy).toBe('demo_check_failed');
  });
});
