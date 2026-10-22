import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The hub's moderation dispatcher must call the approval center's services — never a new payload. */
const calls = vi.hoisted(() => ({ approve: [] as unknown[][], reject: [] as unknown[][], bulk: [] as unknown[][] }));
vi.mock('../moderation.service', () => ({
  approveEntity: async (...a: unknown[]) => { calls.approve.push(a); },
  rejectEntity: async (...a: unknown[]) => { calls.reject.push(a); },
}));
vi.mock('@/features/parks/core/services/inventory.service', () => ({
  InventoryService: { bulkApproveRoutes: async (ids: string[]) => { calls.bulk.push([ids]); return ids.length; } },
}));

import { bulkApproveRoutes, moderateAmenities, moderateOne } from '../city-mapping-hub-moderation.service';

const admin = { adminId: 'u1', adminName: 'דוד' };
beforeEach(() => { calls.approve = []; calls.reject = []; calls.bulk = []; });

describe('moderateOne', () => {
  it.each(['route', 'park', 'contribution'] as const)('%s approve → approveEntity (same side effects as the approval center)', async (kind) => {
    await moderateOne({ kind, id: 'x', authorityId: 'a', action: 'approve', reason: null, admin });
    expect(calls.approve).toEqual([[kind, 'x', admin]]);
  });
  it('route reject → rejectEntity("route") with the reason (archived), never bulkRejectRoutes', async () => {
    await moderateOne({ kind: 'route', id: 'r', authorityId: 'a', action: 'reject', reason: 'כפול', admin });
    expect(calls.reject).toEqual([['route', 'r', 'כפול', admin]]);
    expect(calls.bulk).toEqual([]);
  });
  it('amenity → the hub server route; a skipped id is an error, not a silent success', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ updated: [], skipped: [{ id: 'm', reason: 'not_pending' }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    await expect(moderateOne({ kind: 'amenity', id: 'm', authorityId: 'a', action: 'approve', reason: null, admin })).rejects.toThrow('not_pending');
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ authorityId: 'a', action: 'approve', ids: ['m'], reason: null });
    vi.unstubAllGlobals();
  });
});

describe('bulk', () => {
  it('routes → InventoryService.bulkApproveRoutes with the exact ids', async () => {
    expect(await bulkApproveRoutes(['r1', 'r2'])).toBe(2);
    expect(calls.bulk).toEqual([[['r1', 'r2']]]);
  });
  it('amenities are sent in chunks of ≤ 500 and the results merged', async () => {
    const ids = Array.from({ length: 1201 }, (_, i) => `a${i}`);
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(init.body as string) as { ids: string[] };
      return new Response(JSON.stringify({ updated: b.ids, skipped: [] }), { status: 200 });
    });
    const r = await moderateAmenities('a', ids, 'approve', null, f as unknown as typeof fetch);
    expect(f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).ids.length)).toEqual([500, 500, 201]);
    expect(r.updated).toHaveLength(1201);
  });
  it('a server error throws', async () => {
    const f = async () => new Response(JSON.stringify({ error: 'city mapping hub is off' }), { status: 403 });
    await expect(moderateAmenities('a', ['x'], 'approve', null, f as unknown as typeof fetch)).rejects.toThrow('off');
  });
});
