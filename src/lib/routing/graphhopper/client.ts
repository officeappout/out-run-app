/**
 * Minimal GraphHopper /route client: auth header, per-call timeout, one
 * retry on network errors / 5xx / 429, and the "no route here" 400s
 * (e.g. round_trip near the coast: "Could not find a valid point") turned
 * into `null` so callers can simply try the next seed.
 */
import { mapGhPath } from './map-response';
import type { GhRouteRequest, GhRouteResponse, RoutedPath } from './types';
import type { IdTokenProvider } from './id-token';

export class GraphHopperError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'GraphHopperError';
  }
}

export interface GraphHopperClient {
  /** null = GraphHopper answered but found no route for this request. */
  route(body: GhRouteRequest, signal?: AbortSignal): Promise<RoutedPath | null>;
}

export interface ClientOptions {
  baseUrl: string;
  audience?: string;
  /** Omit for local (unauthenticated) servers. */
  getIdToken?: IdTokenProvider;
  timeoutMs?: number;
  retries?: number;
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const live = signals.filter(Boolean) as AbortSignal[];
  return live.length === 1 ? live[0] : AbortSignal.any(live);
}

export function createGraphHopperClient(o: ClientOptions): GraphHopperClient {
  const fetchImpl = o.fetchImpl ?? fetch;
  const timeoutMs = o.timeoutMs ?? 1200;
  const retries = o.retries ?? 1;
  const url = `${o.baseUrl.replace(/\/+$/, '')}/route`;

  async function once(body: GhRouteRequest, signal?: AbortSignal): Promise<RoutedPath | null> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (o.getIdToken) headers.Authorization = `Bearer ${await o.getIdToken(o.audience ?? o.baseUrl)}`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: anySignal([AbortSignal.timeout(timeoutMs), signal]),
    });
    const data = (await res.json().catch(() => ({}))) as GhRouteResponse;
    if (res.ok) return data.paths?.length ? mapGhPath(data.paths[0]) : null;
    if (res.status === 400) return null; // unroutable point / no round trip found
    throw new GraphHopperError(data.message ?? `graphhopper ${res.status}`, res.status);
  }

  return {
    async route(body, signal) {
      let last: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal?.aborted) break;
        try {
          return await once(body, signal);
        } catch (e) {
          last = e;
          const status = e instanceof GraphHopperError ? e.status : null;
          // 401/403 = auth misconfigured — retrying will not help.
          if (status === 401 || status === 403) break;
          if (attempt < retries) await sleep(80 * (attempt + 1));
        }
      }
      throw last instanceof Error ? last : new GraphHopperError('graphhopper request failed', null);
    },
  };
}
