import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadDemoStatus, usageWindowKeys } from '../demo-control.server';

describe('usageWindowKeys', () => {
  it('returns 31 distinct Israel date keys, newest first', () => {
    const keys = usageWindowKeys(new Date('2026-10-20T12:00:00Z'));
    expect(keys).toHaveLength(31);
    expect(new Set(keys).size).toBe(31);
    expect(keys[0]).toBe('2026-10-20');
    expect(keys[30]).toBe('2026-09-20');
  });
});

describe('loadDemoStatus', () => {
  it('still answers when every read fails (panel shows defaults instead of an error)', async () => {
    const fail = () => Promise.reject(new Error('boom'));
    const chain: Record<string, unknown> = {};
    const doc = () => ({ get: fail, collection: () => ({ doc }) });
    Object.assign(chain, { where: () => chain, select: () => chain, limit: () => chain, get: fail });
    const db = { collection: () => ({ doc, ...chain }), getAll: fail } as unknown as Parameters<typeof loadDemoStatus>[0];
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const status = await loadDemoStatus(db, new Date('2026-10-20T12:00:00Z'));
    expect(status).toBeTruthy();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
