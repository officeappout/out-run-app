/**
 * The process-wide client built from env (null when GRAPHHOPPER_URL is unset
 * or no invoker key is available — callers then report "unavailable").
 */
import { createGraphHopperClient, type GraphHopperClient } from './client';
import { readGraphHopperConfig } from './config';
import { createIdTokenProvider, invokerKeyFromEnv } from './id-token';

let cached: { client: GraphHopperClient | null } | null = null;

export function getServerGraphHopperClient(): GraphHopperClient | null {
  if (cached) return cached.client;
  const cfg = readGraphHopperConfig();
  let client: GraphHopperClient | null = null;
  if (cfg) {
    if (cfg.auth === 'none') {
      client = createGraphHopperClient({ baseUrl: cfg.baseUrl, timeoutMs: cfg.timeoutMs });
    } else {
      const key = invokerKeyFromEnv();
      if (key) client = createGraphHopperClient({ baseUrl: cfg.baseUrl, audience: cfg.audience, timeoutMs: cfg.timeoutMs, getIdToken: createIdTokenProvider(key) });
      else console.warn('[graphhopper] GRAPHHOPPER_URL set but no service-account key for the ID token');
    }
  }
  cached = { client };
  return client;
}
