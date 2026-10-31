/* eslint-disable @typescript-eslint/no-explicit-any -- mocked dependencies */
/**
 * POST /api/scan/equipment with every dependency mocked: the open gate, the flag (team preview),
 * App Check monitor vs enforce, the scan's own rate limit, bad bodies, and a good answer with a
 * verdict. The photo never reaches a log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const st = vi.hoisted(() => ({
  auth: null as any,
  verifyOpts: [] as any[],
  appCheck: 'valid' as string,
  rate: {} as Record<string, boolean>,
  rateKeys: [] as string[],
  identify: null as any,
  logs: [] as string[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/ai/verify-ai-request.server', () => ({
  verifyAiRequest: async (_r: Request, opts: any) => {
    st.verifyOpts.push(opts);
    return st.auth;
  },
  aiDenialResponse: (d: any) => new Response(JSON.stringify({ error: d.code }), { status: d.status }),
}));
vi.mock('@/lib/app-check.server', () => ({
  passesAppCheck: async (_r: Request, _route: string, enforce: boolean) => st.appCheck === 'valid' || !enforce,
}));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: async (_db: any, key: string) => {
    st.rateKeys.push(key);
    return { limited: !!st.rate[key.slice(0, 6)], retryAfterMs: 60_000 };
  },
}));
vi.mock('@/lib/ai/scan/scan-catalog.server', () => ({
  loadScanCatalog: async () => [{ id: 'pull', name: 'מתח', availableInLocations: ['park'] }],
  loadParkEquipmentIds: async (_db: any, parkId?: string) => (parkId ? ['pull'] : []),
}));
vi.mock('@/lib/ai/scan/scan.server', () => ({
  identifyEquipment: (...a: any[]) => st.identify(...a),
}));

import { POST } from '@/app/api/scan/equipment/route';

const IMG = 'A'.repeat(200);
const req = (body: unknown = { image: IMG, mediaType: 'image/jpeg', mode: 'single' }) =>
  new Request('http://x/api/scan/equipment', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer t' } });
const grant = (flag = true, team = false, enforce = false) => ({
  ok: true,
  uid: 'u1',
  profile: {},
  entitlement: null,
  team,
  flags: { enableEquipmentScanV1: flag },
  config: { scanPerHour: 30, scanPerDay: 100, scanAppCheckEnforce: enforce },
});

beforeEach(() => {
  st.auth = grant();
  st.verifyOpts = [];
  st.appCheck = 'valid';
  st.rate = {};
  st.rateKeys = [];
  st.identify = async () => ({ quality: 'ok', hasPeople: false, items: [{ candidateId: 'pull', kind: 'catalog', confidence: 0.9 }], unknown: [] });
});

describe('POST /api/scan/equipment', () => {
  it('uses the open gate (teens, no Kelly entitlement) and passes denials through', async () => {
    st.auth = { ok: false, status: 503, code: 'kill_switch' };
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(st.verifyOpts[0]).toEqual({ access: 'open' });
  });

  it('404 while the flag is off; the team previews it', async () => {
    st.auth = grant(false);
    expect((await POST(req())).status).toBe(404);
    st.auth = grant(false, true);
    expect((await POST(req())).status).toBe(200);
    expect(st.rateKeys).toEqual([]); // team: no scan limit
  });

  it('App Check: monitor lets it through, enforce blocks', async () => {
    st.appCheck = 'missing';
    expect((await POST(req())).status).toBe(200);
    st.auth = grant(true, false, true);
    expect((await POST(req())).status).toBe(401);
  });

  it('own hour/day limit → 429 with Retry-After', async () => {
    st.rate = { scan_d: true };
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(st.rateKeys).toEqual(['scan_h_u1', 'scan_d_u1']);
  });

  it('rejects bad bodies', async () => {
    expect((await POST(req({ image: 'not base64!', mediaType: 'image/jpeg', mode: 'single' }))).status).toBe(400);
    expect((await POST(req({ image: IMG, mediaType: 'image/gif', mode: 'single' }))).status).toBe(400);
    expect((await POST(req({ image: IMG, mediaType: 'image/jpeg', mode: 'all' }))).status).toBe(400);
  });

  it('single → result + verdict; park → result only, park items flagged', async () => {
    const res = await POST(req());
    expect(await res.json()).toMatchObject({ verdict: { kind: 'confirm', candidateId: 'pull' } });
    let seen: any;
    st.identify = async (_uid: string, _img: any, candidates: any[], mode: string) => {
      seen = { candidates, mode };
      return { quality: 'ok', hasPeople: false, items: [], unknown: [] };
    };
    const body = await (await POST(req({ image: IMG, mediaType: 'image/jpeg', mode: 'park', parkId: 'p1' }))).json();
    expect(body.verdict).toBeUndefined();
    expect(seen.mode).toBe('park');
    expect(seen.candidates.find((c: any) => c.id === 'pull').atPark).toBe(true);
  });

  it('a model failure is a 503 and never logs the photo', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: any[]) => st.logs.push(a.join(' ')));
    st.identify = async () => {
      throw new Error('boom');
    };
    expect((await POST(req())).status).toBe(503);
    expect(st.logs.join(' ')).not.toContain(IMG);
    spy.mockRestore();
  });
});
