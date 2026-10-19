/**
 * Server-side GraphHopper settings from env (Vercel). See
 * infra/graphhopper/README.md §6 for what to set.
 *
 *   GRAPHHOPPER_URL               Cloud Run URL (https://graphhopper-…-zf.a.run.app); unset = feature unavailable
 *   GRAPHHOPPER_AUDIENCE          ID-token audience; defaults to GRAPHHOPPER_URL
 *   GRAPHHOPPER_INVOKER_SA_KEY    optional dedicated invoker key (raw JSON or base64);
 *                                 defaults to FIREBASE_SERVICE_ACCOUNT_KEY / GOOGLE_SERVICE_ACCOUNT_KEY
 *   GRAPHHOPPER_TIMEOUT_MS        per-call timeout (default 1200)
 *
 * A localhost URL (local `docker run`) is called without an ID token; any other
 * host must be https and always gets one.
 */
export interface GraphHopperConfig {
  baseUrl: string;
  audience: string;
  timeoutMs: number;
  auth: 'id-token' | 'none';
}

export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

export function readGraphHopperConfig(env: Record<string, string | undefined> = process.env): GraphHopperConfig | null {
  const baseUrl = env.GRAPHHOPPER_URL?.trim().replace(/\/+$/, '');
  if (!baseUrl || !/^https?:\/\//.test(baseUrl)) return null;
  // Never send requests unauthenticated to a non-local host.
  if (!baseUrl.startsWith('https://') && !isLocalUrl(baseUrl)) return null;
  const t = Number(env.GRAPHHOPPER_TIMEOUT_MS);
  return {
    baseUrl,
    audience: env.GRAPHHOPPER_AUDIENCE?.trim() || baseUrl,
    timeoutMs: Number.isFinite(t) && t > 0 ? t : 1200,
    auth: isLocalUrl(baseUrl) ? 'none' : 'id-token',
  };
}
