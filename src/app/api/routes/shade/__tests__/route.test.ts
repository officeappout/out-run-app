import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  limited: false,
  rlKeys: [] as string[],
  docs: {} as Record<string, Record<string, unknown>>,
  reads: [] as string[][],
  collections: [] as string[],
  fail: false,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: state.verifyIdToken }),
  getAdminDb: () => ({
    collection: (name: string) => {
      state.collections.push(name);
      return { doc: (id: string) => ({ id }) };
    },
    getAll: async (...refs: Array<{ id: string }>) => {
      if (state.fail) throw new Error('boom');
      state.reads.push(refs.map((r) => r.id));
      return refs.map((r) => ({ id: r.id, exists: r.id in state.docs, data: () => state.docs[r.id] }));
    },
  }),
}));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: async (_db: unknown, key: string) => { state.rlKeys.push(key); return state.limited ? { limited: true, retryAfterMs: 30_000 } : { limited: false }; },
}));

import { POST } from '../route';

const call = (body: unknown, token: string | null = 'good') => POST({
  headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  json: async () => body,
} as unknown as NextRequest);

const july = [null, 0.1, 0.2, 0.3, 0.35, 0.4, 0.22, 0.25, 0.3, 0.33, 0.47, 0.5, 0.6, null];

beforeEach(() => {
  state.verifyIdToken.mockReset().mockImplementation(async (t: string) => { if (t !== 'good') throw new Error('bad'); return { uid: 'u1' }; });
  state.limited = false;
  state.rlKeys = [];
  state.reads = [];
  state.collections = [];
  state.fail = false;
  state.docs = {
    measured: {
      score: 77, selection: 'top', // never leaves the server
      shade: { status: 'measured', shadeShare: 0.2, shadedPct: 38.5, coverage: 0.8, source: 'technion_v1' },
      components: { comfort: { points: 3, max: 10, coverage: 1, hourlyShade: { source: 'shade_hourly_v1', coverage: 0.9, summerMean: 0.3, julyByHour: july } } },
    },
    lowCoverage: { shade: { status: 'low_coverage', shadeShare: null, shadedPct: null, coverage: 0.2, source: 'technion_v1' } },
    noShade: { shade: null },
  };
});

describe('POST /api/routes/shade', () => {
  it('401 without / with an invalid token — nothing read', async () => {
    expect((await call({ ids: ['measured'] }, null)).status).toBe(401);
    expect((await call({ ids: ['measured'] }, 'forged')).status).toBe(401);
    expect(state.reads).toEqual([]);
  });
  it('400 on a bad body', async () => {
    expect((await call({ ids: [] })).status).toBe(400);
    expect((await call({ ids: ['gh-1-2-3'] })).status).toBe(400);
    expect((await call(null)).status).toBe(400);
  });
  it('429 with Retry-After when the per-uid limit is hit', async () => {
    state.limited = true;
    const res = await call({ ids: ['measured'] });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(state.reads).toEqual([]);
  });
  it('one batched read of route_scores; only measured ids come back, only shade numbers', async () => {
    const res = await call({ ids: ['measured', 'lowCoverage', 'noShade', 'missing', 'gh-1-0-0'] });
    expect(res.status).toBe(200);
    expect(state.collections).toEqual(['route_scores']);
    expect(state.reads).toEqual([['measured', 'lowCoverage', 'noShade', 'missing']]);
    expect(state.rlKeys).toEqual(['route-shade:uid:u1']);
    expect(await res.json()).toEqual({ routes: { measured: { shadedPct: 38.5, julyByHour: july } } });
  });
  it('502 when the read fails', async () => {
    state.fail = true;
    expect((await call({ ids: ['measured'] })).status).toBe(502);
  });
});
