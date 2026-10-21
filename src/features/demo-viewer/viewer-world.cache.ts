/**
 * Client cache of "am I a demo viewer?" (demo-users-design.md PR 5). Pure
 * except for the injected storage — unit-tested in node.
 *
 *   viewer      cached for VIEWER_TTL_MS (the home can change from a script)
 *   non-viewer  cached for NON_VIEWER_TTL_MS — a real user asks the server at
 *               most once a day, so the route costs nothing at scale
 * Every read / write is try/catch: storage can be missing or throw (private
 * mode) — then we just ask the server again.
 */
import { isDemoTenantId } from '@/lib/demo';
import type { DemoViewerWorld } from './viewer-world.types';

export const VIEWER_TTL_MS = 10 * 60_000;
export const NON_VIEWER_TTL_MS = 24 * 60 * 60_000;
const KEY = (uid: string) => `out.demoViewerWorld.v1.${uid}`;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
interface Entry { at: number; world: DemoViewerWorld | null }

/**
 * Validates the server's answer: only `demo-` ids may ever become the
 * viewer's read scope (a bad payload ⇒ null ⇒ the real app).
 */
export function parseViewerWorld(body: unknown): DemoViewerWorld | null {
  if (!body || typeof body !== 'object' || (body as { viewer?: unknown }).viewer !== true) return null;
  const b = body as Partial<DemoViewerWorld>;
  const home = b.home;
  if (!home || !isDemoTenantId(home.cityId)) return null;
  if (home.neighborhoodId != null && !isDemoTenantId(home.neighborhoodId)) return null;
  const cities = Array.isArray(b.cities) ? b.cities.filter((c) => c && isDemoTenantId(c.id)) : [];
  const groupIds = Array.isArray(b.groupIds) ? b.groupIds.filter((g) => isDemoTenantId(g)) : [];
  return {
    viewer: true,
    home: {
      cityId: home.cityId,
      cityName: typeof home.cityName === 'string' ? home.cityName : home.cityId,
      neighborhoodId: home.neighborhoodId ?? null,
      neighborhoodName: typeof home.neighborhoodName === 'string' ? home.neighborhoodName : null,
    },
    cities: cities.map((c) => ({ id: c.id, name: typeof c.name === 'string' ? c.name : c.id })),
    groupIds,
  };
}

/** undefined = no fresh entry (ask the server); null = cached "not a viewer". */
export function readCachedWorld(storage: StorageLike | null, uid: string, now = Date.now()): DemoViewerWorld | null | undefined {
  try {
    const raw = storage?.getItem(KEY(uid));
    if (!raw) return undefined;
    const e = JSON.parse(raw) as Entry;
    const ttl = e.world ? VIEWER_TTL_MS : NON_VIEWER_TTL_MS;
    if (typeof e.at !== 'number' || now - e.at > ttl) return undefined;
    return e.world ? parseViewerWorld(e.world) : null;
  } catch {
    return undefined;
  }
}

export function writeCachedWorld(storage: StorageLike | null, uid: string, world: DemoViewerWorld | null, now = Date.now()): void {
  try {
    storage?.setItem(KEY(uid), JSON.stringify({ at: now, world } satisfies Entry));
  } catch {
    /* storage unavailable — the next session asks again */
  }
}
