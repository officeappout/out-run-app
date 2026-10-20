/* eslint-disable @typescript-eslint/no-explicit-any -- Firestore stand-ins */
/** demo_kelly switch (read failure = off) and the demo center usage write (never throws). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => { throw new Error('pass a db'); } }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n: number) => ({ __inc: n }), serverTimestamp: () => ({ __ts: true }) },
}));

import { demoUsageIncrements, isDemoKellyOn, recordDemoKellyUsage } from '../demo-kelly.server';

const flagDb = (get: () => Promise<unknown>): any => ({ collection: () => ({ doc: () => ({ get }) }) });

describe('isDemoKellyOn', () => {
  it('true only when system_config/feature_flags.demo_kelly === true (default off)', async () => {
    expect(await isDemoKellyOn(flagDb(async () => ({ exists: true, data: () => ({ demo_kelly: true }) })))).toBe(true);
    expect(await isDemoKellyOn(flagDb(async () => ({ exists: true, data: () => ({ demo_kelly: 'yes' }) })))).toBe(false);
    expect(await isDemoKellyOn(flagDb(async () => ({ exists: false, data: () => undefined })))).toBe(false);
  });
  it('uses the run\'s flags when given (no read)', async () => {
    const db = flagDb(async () => { throw new Error('must not read'); });
    expect(await isDemoKellyOn(db, { demoKelly: true })).toBe(true);
    expect(await isDemoKellyOn(db, { demoKelly: false })).toBe(false);
  });
  it('read failure → off', async () => {
    expect(await isDemoKellyOn(flagDb(async () => { throw new Error('unavailable'); }))).toBe(false);
  });
});

describe('recordDemoKellyUsage', () => {
  it('increments totals + bySource.kelly on demo_registry/usage/days/{Israel day}, merge', async () => {
    const calls: Array<{ path: string; data: any; opts: any }> = [];
    const path: string[] = [];
    const node: any = {
      collection: (n: string) => { path.push(n); return node; },
      doc: (id: string) => { path.push(id); return node; },
      set: async (data: any, opts: any) => { calls.push({ path: path.join('/'), data, opts }); },
    };
    await recordDemoKellyUsage(node, { inputTokens: 1200, outputTokens: 80, cacheReadTokens: 500, cacheWriteTokens: 0 }, 'claude-haiku-test', new Date('2026-10-20T22:30:00Z'));
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('demo_registry/usage/days/2026-10-21'); // Israel day, not UTC
    expect(calls[0].opts).toEqual({ merge: true });
    expect(calls[0].data).toMatchObject({ llmCalls: { __inc: 1 }, inputTokens: { __inc: 1200 }, outputTokens: { __inc: 80 }, cachedTokens: { __inc: 500 } });
    expect(calls[0].data.bySource.kelly).toEqual({
      llmCalls: { __inc: 1 }, inputTokens: { __inc: 1200 }, outputTokens: { __inc: 80 }, cachedTokens: { __inc: 500 }, model: 'claude-haiku-test',
    });
  });
  it('a failed write never throws; no usage → no write', async () => {
    const set = vi.fn(async () => { throw new Error('denied'); });
    const node: any = { collection: () => node, doc: () => node, set };
    await expect(recordDemoKellyUsage(node, { inputTokens: 1, outputTokens: 1 }, null)).resolves.toBeUndefined();
    await recordDemoKellyUsage(node, undefined, null);
    expect(set).toHaveBeenCalledTimes(1);
  });
  it('bad token counts increment by 0', () => {
    expect(demoUsageIncrements({ inputTokens: Number.NaN, outputTokens: -3 }, null)).toMatchObject({ inputTokens: { __inc: 0 }, outputTokens: { __inc: 0 } });
  });
});
