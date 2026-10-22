import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

import { __resetRouteShadeCache, loadRouteShade, peekRouteShade } from '../route-shade-client';

const okFetch = (routes: Record<string, unknown>) =>
  vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ routes }), { status: 200 }));
const deps = (fetchImpl: unknown) => ({ getToken: async () => 'tok', fetchImpl: fetchImpl as typeof fetch, batchMs: 5 });
const bodyOf = (f: ReturnType<typeof okFetch>, n = 0) => JSON.parse((f.mock.calls[n] as unknown as [string, RequestInit])[1].body as string);

beforeEach(() => __resetRouteShadeCache());

describe('loadRouteShade (enable_route_shade_tag)', () => {
  it('cards asking together → ONE request; each gets its answer; misses become null', async () => {
    const f = okFetch({ a: { shadedPct: 40 } });
    const [a, b, a2] = await Promise.all([loadRouteShade('a', deps(f)), loadRouteShade('b', deps(f)), loadRouteShade('a', deps(f))]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('/api/routes/shade');
    expect(bodyOf(f)).toEqual({ ids: ['a', 'b'] });
    expect(a).toEqual({ shadedPct: 40 });
    expect(a2).toEqual({ shadedPct: 40 });
    expect(b).toBeNull();
  });
  it('answers are cached for the session (incl. "nothing measured")', async () => {
    const f = okFetch({ a: { shadedPct: 40 } });
    await Promise.all([loadRouteShade('a', deps(f)), loadRouteShade('b', deps(f))]);
    expect(peekRouteShade('a')).toEqual({ shadedPct: 40 });
    expect(peekRouteShade('b')).toBeNull();
    expect(await loadRouteShade('b', deps(f))).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('generated routes are never asked about', async () => {
    const f = okFetch({});
    expect(await loadRouteShade('gh-1-0-0', deps(f))).toBeNull();
    expect(await loadRouteShade('gen-1-0-0', deps(f))).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('a failed call resolves null and is NOT cached', async () => {
    const bad = vi.fn(async () => new Response('{}', { status: 502 }));
    expect(await loadRouteShade('a', deps(bad))).toBeNull();
    expect(peekRouteShade('a')).toBeUndefined();
    const f = okFetch({ a: { shadedPct: 12 } });
    expect(await loadRouteShade('a', deps(f))).toEqual({ shadedPct: 12 });
  });
  it('not signed in → null, no request', async () => {
    const f = okFetch({});
    expect(await loadRouteShade('a', { getToken: async () => undefined, fetchImpl: f as unknown as typeof fetch, batchMs: 5 })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('more than 30 cards → split into batches of 30', async () => {
    const f = okFetch({});
    await Promise.all(Array.from({ length: 31 }, (_, i) => loadRouteShade(`r${i}`, deps(f))));
    expect(f).toHaveBeenCalledTimes(2);
    expect(bodyOf(f, 0).ids).toHaveLength(30);
    expect(bodyOf(f, 1).ids).toEqual(['r30']);
  });
});
