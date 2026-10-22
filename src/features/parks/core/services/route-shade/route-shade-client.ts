/**
 * App-side shade lookup for stored routes (enable_route_shade_tag): every
 * card that asks within one short window goes out as ONE POST
 * /api/routes/shade, and each answer is cached for the session (a route
 * with nothing measured is cached as null, so it is never asked again).
 * A failed call is not cached; it resolves null (no tag) and the next mount
 * may try again.
 */
import { auth } from '@/lib/firebase';
import { isStoredRouteId, ROUTE_SHADE_MAX_IDS, type RouteShadeInfo, type RouteShadeResponse } from '@/lib/route-shade-view';

export interface RouteShadeClientDeps {
  getToken?: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  /** Batch window, ms. */
  batchMs?: number;
}

const BATCH_MS = 40;
const TIMEOUT_MS = 4000;

const cache = new Map<string, RouteShadeInfo | null>();
const waiting = new Map<string, Array<(v: RouteShadeInfo | null) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;
let activeDeps: RouteShadeClientDeps = {};

const defaultToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve(undefined);

/** Cached answer: the info, null (asked — nothing measured), or undefined (not asked yet). */
export function peekRouteShade(id: string): RouteShadeInfo | null | undefined {
  return cache.get(id);
}

async function postBatch(ids: string[], deps: RouteShadeClientDeps): Promise<RouteShadeResponse | null> {
  try {
    const token = await (deps.getToken ?? defaultToken)();
    if (!token) return null;
    const res = await (deps.fetchImpl ?? fetch)('/api/routes/shade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RouteShadeResponse;
    return data && typeof data.routes === 'object' && data.routes ? data : null;
  } catch {
    return null;
  }
}

async function flush(): Promise<void> {
  timer = null;
  const deps = activeDeps;
  const ids = Array.from(waiting.keys());
  for (let k = 0; k < ids.length; k += ROUTE_SHADE_MAX_IDS) {
    const part = ids.slice(k, k + ROUTE_SHADE_MAX_IDS);
    const data = await postBatch(part, deps);
    for (const id of part) {
      const value = data ? (data.routes[id] ?? null) : null;
      if (data) cache.set(id, value);
      const cbs = waiting.get(id) ?? [];
      waiting.delete(id);
      cbs.forEach((cb) => cb(value));
    }
  }
}

/** Shade of one stored route (batched + cached). Generated / unknown ids resolve null without a call. */
export function loadRouteShade(id: string, deps: RouteShadeClientDeps = {}): Promise<RouteShadeInfo | null> {
  if (!isStoredRouteId(id)) return Promise.resolve(null);
  const hit = cache.get(id);
  if (hit !== undefined) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const list = waiting.get(id);
    if (list) { list.push(resolve); return; }
    waiting.set(id, [resolve]);
    activeDeps = deps;
    if (!timer) timer = setTimeout(() => { void flush(); }, deps.batchMs ?? BATCH_MS);
  });
}

/** Tests only. */
export function __resetRouteShadeCache(): void {
  cache.clear();
  waiting.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  activeDeps = {};
}
