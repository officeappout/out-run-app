/**
 * Google-signed ID token for calling the private Cloud Run service.
 *
 * Vercel is not on Google Cloud, so there is no metadata server: we sign in
 * as a service account from a key that Vercel already holds
 * (FIREBASE_SERVICE_ACCOUNT_KEY — the Firebase Admin SA, granted
 * roles/run.invoker on the graphhopper service only). A dedicated key can be
 * given instead via GRAPHHOPPER_INVOKER_SA_KEY.
 *
 * google-auth-library is imported dynamically (repo rule: never top-level).
 * Tokens live 1 h; cached per audience and refreshed 5 min before expiry.
 */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

export type IdTokenProvider = (audience: string) => Promise<string>;

export function parseServiceAccountKey(raw: string | undefined): ServiceAccountKey | null {
  if (!raw?.trim()) return null;
  const attempts = [raw.trim()];
  try { attempts.push(Buffer.from(raw.trim(), 'base64').toString('utf8')); } catch { /* not base64 */ }
  for (const s of attempts) {
    try {
      const k = JSON.parse(s) as Partial<ServiceAccountKey>;
      if (typeof k.client_email === 'string' && typeof k.private_key === 'string') {
        return { client_email: k.client_email, private_key: k.private_key.replace(/\\n/g, '\n') };
      }
    } catch { /* next */ }
  }
  return null;
}

export function invokerKeyFromEnv(env: Record<string, string | undefined> = process.env): ServiceAccountKey | null {
  return (
    parseServiceAccountKey(env.GRAPHHOPPER_INVOKER_SA_KEY) ??
    parseServiceAccountKey(env.FIREBASE_SERVICE_ACCOUNT_KEY) ??
    parseServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY)
  );
}

/** exp (ms) from a JWT, or now + 55 min when unreadable. */
export function tokenExpiryMs(token: string, now = Date.now()): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch { /* fall through */ }
  return now + 55 * 60_000;
}

type Fetcher = (key: ServiceAccountKey, audience: string) => Promise<string>;

const googleFetcher: Fetcher = async (key, audience) => {
  const { JWT } = await import('google-auth-library');
  const client = new JWT({ email: key.client_email, key: key.private_key });
  return client.fetchIdToken(audience);
};

const REFRESH_EARLY_MS = 5 * 60_000;

/** Cached provider; `fetcher` is injectable for tests. */
export function createIdTokenProvider(key: ServiceAccountKey, fetcher: Fetcher = googleFetcher, now = () => Date.now()): IdTokenProvider {
  const cache = new Map<string, { token: string; exp: number }>();
  const inflight = new Map<string, Promise<string>>();
  return async (audience) => {
    const hit = cache.get(audience);
    if (hit && hit.exp - REFRESH_EARLY_MS > now()) return hit.token;
    const pending = inflight.get(audience);
    if (pending) return pending;
    const p = fetcher(key, audience)
      .then(token => { cache.set(audience, { token, exp: tokenExpiryMs(token, now()) }); return token; })
      .finally(() => inflight.delete(audience));
    inflight.set(audience, p);
    return p;
  };
}
