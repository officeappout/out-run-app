import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildRoundTripRequest, createGraphHopperClient, createIdTokenProvider, GraphHopperError, invokerKeyFromEnv,
  parseServiceAccountKey, readGraphHopperConfig, tokenExpiryMs,
} from '../graphhopper';
import { GH } from './fixtures';

const body = buildRoundTripRequest({ start: GH.start, distanceM: 5000, seed: 1, profile: 'foot', tags: {} });
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('GraphHopper client', () => {
  it('POSTs /route with the ID token for the audience and maps the path', async () => {
    const fetchImpl = vi.fn(async () => json(200, GH.passing5km));
    const getIdToken = vi.fn(async () => 'tok');
    const c = createGraphHopperClient({ baseUrl: 'https://gh.example.run.app/', audience: 'https://gh.example.run.app', getIdToken, fetchImpl });
    const r = await c.route(body);
    expect(r!.distanceM).toBe(GH.passing5km.paths![0].distance);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gh.example.run.app/route');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)['round_trip.seed']).toBe(1);
    expect(getIdToken).toHaveBeenCalledWith('https://gh.example.run.app');
  });
  it('local server: no Authorization header', async () => {
    const fetchImpl = vi.fn(async () => json(200, GH.passing5km));
    await createGraphHopperClient({ baseUrl: 'http://localhost:8989', fetchImpl }).route(body);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('400 (no route / no valid point) → null, no retry', async () => {
    const fetchImpl = vi.fn(async () => json(400, GH.error400));
    expect(await createGraphHopperClient({ baseUrl: 'http://localhost:8989', fetchImpl }).route(body)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('5xx / network error → one retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json(503, { message: 'busy' })).mockResolvedValueOnce(json(200, GH.passing5km));
    expect(await createGraphHopperClient({ baseUrl: 'http://localhost:8989', fetchImpl }).route(body)).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const down = vi.fn(async () => { throw new TypeError('fetch failed'); });
    await expect(createGraphHopperClient({ baseUrl: 'http://localhost:8989', fetchImpl: down }).route(body)).rejects.toThrow('fetch failed');
    expect(down).toHaveBeenCalledTimes(2);
  });
  it('401/403 (IAM) → throws at once, no retry', async () => {
    const fetchImpl = vi.fn(async () => json(403, {}));
    const err = await createGraphHopperClient({ baseUrl: 'https://gh.example.run.app', getIdToken: async () => 't', fetchImpl }).route(body).catch(e => e);
    expect(err).toBeInstanceOf(GraphHopperError);
    expect(err.status).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('per-call timeout aborts a hung request', async () => {
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, j) => init.signal!.addEventListener('abort', () => j(init.signal!.reason))));
    const t0 = Date.now();
    await expect(createGraphHopperClient({ baseUrl: 'http://localhost:8989', fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 30, retries: 0 }).route(body)).rejects.toBeTruthy();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});

describe('config from env', () => {
  it('unset / non-https remote URL → unavailable; localhost → no auth', () => {
    expect(readGraphHopperConfig({})).toBeNull();
    expect(readGraphHopperConfig({ GRAPHHOPPER_URL: 'http://gh.example.com' })).toBeNull();
    expect(readGraphHopperConfig({ GRAPHHOPPER_URL: 'http://localhost:8989/' })).toMatchObject({ baseUrl: 'http://localhost:8989', auth: 'none' });
    expect(readGraphHopperConfig({ GRAPHHOPPER_URL: 'https://gh-x.a.run.app', GRAPHHOPPER_TIMEOUT_MS: '900' }))
      .toEqual({ baseUrl: 'https://gh-x.a.run.app', audience: 'https://gh-x.a.run.app', timeoutMs: 900, auth: 'id-token' });
  });
});

describe('ID token (service-account key → Google-signed token)', () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const keyJson = JSON.stringify({ client_email: 'firebase-adminsdk-x@appout-1.iam.gserviceaccount.com', private_key: pem.replace(/\n/g, '\\n') });

  it('parses raw JSON and base64 keys; dedicated invoker key wins over the Firebase key', () => {
    expect(parseServiceAccountKey(keyJson)!.private_key).toBe(pem);
    expect(parseServiceAccountKey(Buffer.from(keyJson).toString('base64'))!.client_email).toContain('firebase-adminsdk');
    expect(parseServiceAccountKey('nope')).toBeNull();
    const dedicated = JSON.stringify({ client_email: 'gh-invoker@appout-1.iam.gserviceaccount.com', private_key: 'k' });
    expect(invokerKeyFromEnv({ FIREBASE_SERVICE_ACCOUNT_KEY: keyJson })!.client_email).toContain('firebase-adminsdk');
    expect(invokerKeyFromEnv({ FIREBASE_SERVICE_ACCOUNT_KEY: keyJson, GRAPHHOPPER_INVOKER_SA_KEY: dedicated })!.client_email).toBe('gh-invoker@appout-1.iam.gserviceaccount.com');
    expect(invokerKeyFromEnv({})).toBeNull();
  });

  it('caches per audience until 5 min before exp, shares in-flight fetches', async () => {
    let now = 1_000_000_000_000;
    const jwt = (expSec: number) => `h.${Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url')}.s`;
    const fetcher = vi.fn(async () => jwt(now / 1000 + 3600));
    const get = createIdTokenProvider(parseServiceAccountKey(keyJson)!, fetcher, () => now);
    const [a, b] = await Promise.all([get('aud'), get('aud')]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 50 * 60_000;
    await get('aud');
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 6 * 60_000; // within 5 min of exp → refresh
    await get('aud');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await get('other-aud');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(tokenExpiryMs('garbage', 5)).toBe(5 + 55 * 60_000);
  });
});
