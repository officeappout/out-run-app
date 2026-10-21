/**
 * Demo world — the VIEWER's world (demo-users-design.md PR 5 "עולם הצופה",
 * owner 21.10.2026). Admin SDK only (Next API routes).
 *
 * A viewer (one of the owner's real test accounts in demo_registry/viewers)
 * sees the demo world as if they were a RESIDENT of a demo city: their
 * community / leagues read the demo city and neighbourhood, the 'demo' cohort,
 * the demo groups and the demo users' presence. Their own writes stay real
 * (this only answers "which world do I READ").
 *
 *   home city      demo_registry/viewers.homes[uid].cityId, else the first
 *                  of demo_registry/tenants.cityIds
 *   neighbourhood  homes[uid].neighborhoodId, else the home city's first
 *                  demo neighbourhood (authorities with parentAuthorityId)
 *
 * Every id returned passes isStrictDemoTenant (`demo-` prefix AND isDemo:true
 * on its authorities doc) — a registry typo can never point a viewer at a
 * real city. Load-safety: a non-viewer costs the shared viewers read only
 * (getDemoViewerUids, cached per instance); the world itself (registry +
 * ≤ 20 authority docs, one getAll) is cached per instance for WORLD_TTL_MS.
 * Fails closed: any read error ⇒ null (the viewer simply sees the real app).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { isDemoUid, isStrictDemoTenant } from './demo';
import { DEMO_REGISTRY_COLLECTION, DEMO_VIEWERS_DOC_ID, getDemoViewerUids } from './demo-world.server';

export const DEMO_TENANTS_DOC_ID = 'tenants';
const WORLD_TTL_MS = 5 * 60_000;
const MAX_AUTHORITIES = 20;

export interface DemoPlace {
  id: string;
  name: string;
}

export interface DemoViewerWorld {
  viewer: true;
  home: { cityId: string; cityName: string; neighborhoodId: string | null; neighborhoodName: string | null };
  /** Every demo city (the viewer's national city board shows these). */
  cities: DemoPlace[];
  /** Demo groups (community_groups ids) — for "my groups" style surfaces. */
  groupIds: string[];
}

interface WorldBase {
  cities: Array<DemoPlace & { neighborhoods: DemoPlace[] }>;
  groupIds: string[];
  homes: Record<string, { cityId?: string; neighborhoodId?: string }>;
}

const worldCache = new WeakMap<Firestore, { at: number; base: WorldBase | null }>();

const strArr = (v: unknown, max = 50): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x && !x.includes('/')).slice(0, max) : [];

async function readWorldBase(db: Firestore): Promise<WorldBase | null> {
  try {
    const reg = db.collection(DEMO_REGISTRY_COLLECTION);
    const [tenants, viewers] = await db.getAll(reg.doc(DEMO_TENANTS_DOC_ID), reg.doc(DEMO_VIEWERS_DOC_ID));
    const t = tenants.data() ?? {};
    const ids = Array.from(new Set([...strArr(t.cityIds), ...strArr(t.authorityIds)])).slice(0, MAX_AUTHORITIES);
    if (!ids.length) return null;
    const snaps = await db.getAll(...ids.map((id) => db.collection('authorities').doc(id)));
    const docs = new Map(snaps.filter((s) => s.exists && isStrictDemoTenant(s.data(), s.id)).map((s) => [s.id, s.data() ?? {}]));
    const name = (id: string) => (typeof docs.get(id)?.name === 'string' ? (docs.get(id)!.name as string) : id);
    const cities = strArr(t.cityIds)
      .filter((id) => docs.has(id))
      .map((id) => ({
        id,
        name: name(id),
        neighborhoods: ids
          .filter((n) => docs.get(n)?.parentAuthorityId === id)
          .map((n) => ({ id: n, name: name(n) })),
      }));
    if (!cities.length) return null;
    const rawHomes = viewers.data()?.homes;
    const homes = rawHomes && typeof rawHomes === 'object' ? (rawHomes as WorldBase['homes']) : {};
    return { cities, groupIds: strArr(t.groupIds), homes };
  } catch {
    return null;
  }
}

async function getWorldBase(db: Firestore): Promise<WorldBase | null> {
  const hit = worldCache.get(db);
  if (hit && Date.now() - hit.at < WORLD_TTL_MS) return hit.base;
  const base = await readWorldBase(db);
  worldCache.set(db, { at: Date.now(), base });
  return base;
}

/** Pure: the viewer's home inside a world (exported for tests). */
export function pickViewerHome(base: WorldBase, uid: string): DemoViewerWorld['home'] {
  const pref = base.homes[uid] ?? {};
  const city = base.cities.find((c) => c.id === pref.cityId) ?? base.cities[0];
  const hood = city.neighborhoods.find((n) => n.id === pref.neighborhoodId) ?? city.neighborhoods[0] ?? null;
  return { cityId: city.id, cityName: city.name, neighborhoodId: hood?.id ?? null, neighborhoodName: hood?.name ?? null };
}

/**
 * The caller's demo world when they are a registered VIEWER, else null.
 * Demo users themselves (and AI testers, `demo_` uids) already live in the
 * demo world through their own profile, so they get null here.
 */
export async function resolveDemoViewerWorld(db: Firestore, uid: string | null | undefined): Promise<DemoViewerWorld | null> {
  if (!uid || isDemoUid(uid)) return null;
  if (!(await getDemoViewerUids(db)).has(uid)) return null;
  const base = await getWorldBase(db);
  if (!base) return null;
  return {
    viewer: true,
    home: pickViewerHome(base, uid),
    cities: base.cities.map(({ id, name }) => ({ id, name })),
    groupIds: base.groupIds,
  };
}

/** Tests only. */
export function __resetDemoViewerWorldCacheForTests(db?: Firestore): void {
  if (db) worldCache.delete(db);
}
