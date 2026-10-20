/**
 * Demo world — server (Admin SDK) reads for Next API routes. Mirror of
 * functions/src/lib/demo-world.ts plus the two lookups PR 2 needs
 * (agent-briefs/demo-users-design.md, owner-approved 20.10.2026):
 *
 *   - viewers: demo_registry/viewers = { uids: string[] } — the owner's test
 *     accounts bound to the demo world. They see the demo world (boards,
 *     feed, groups, presence) as if they were members of it.
 *   - demo authority / tenant: `demo-` id prefix AND isDemo:true on the doc.
 *     Counting demo residents is an inclusion, so it needs BOTH markers.
 *
 * Load-safety: a real id / uid costs nothing (no read) except the viewers
 * doc, which is one read per instance per VIEWERS_TTL_MS shared by every
 * caller. Every read fails closed (error / missing doc ⇒ not demo, no viewers).
 */
import type { Firestore } from 'firebase-admin/firestore';
import { isDemoTenantId, isDemoUid, isStrictDemoTenant } from './demo';
import { createTtlAsyncCache, type TtlAsyncCache } from './ttlAsyncCache';

export const DEMO_REGISTRY_COLLECTION = 'demo_registry';
export const DEMO_VIEWERS_DOC_ID = 'viewers';
const VIEWERS_TTL_MS = 60_000;
const TENANT_TTL_MS = 5 * 60_000;

const viewerCaches = new WeakMap<Firestore, TtlAsyncCache<Set<string>>>();
const tenantCache = new Map<string, { at: number; isDemo: boolean }>();

async function readViewerUids(db: Firestore): Promise<Set<string>> {
  try {
    const snap = await db.collection(DEMO_REGISTRY_COLLECTION).doc(DEMO_VIEWERS_DOC_ID).get();
    const uids = snap.exists ? (snap.data()?.uids as unknown) : undefined;
    return new Set(Array.isArray(uids) ? uids.filter((u): u is string => typeof u === 'string' && !!u) : []);
  } catch {
    return new Set();
  }
}

/** The owner's viewer accounts (cached per instance, fails closed to an empty set). */
export function getDemoViewerUids(db: Firestore): Promise<Set<string>> {
  let cache = viewerCaches.get(db);
  if (!cache) {
    cache = createTtlAsyncCache(() => readViewerUids(db), VIEWERS_TTL_MS);
    viewerCaches.set(db, cache);
  }
  return cache.get();
}

/** A demo user or a registered viewer — someone who may see the demo world. */
export async function isInDemoWorld(db: Firestore, uid: string | null | undefined): Promise<boolean> {
  if (!uid) return false;
  if (isDemoUid(uid)) return true;
  return (await getDemoViewerUids(db)).has(uid);
}

/**
 * authorities/{id} or tenants/{id} is a demo one: `demo-` prefix (checked
 * first — a real id never triggers a read) AND isDemo:true on the doc.
 */
export async function resolveTenantIsDemo(
  db: Firestore,
  collection: 'authorities' | 'tenants',
  id: string | null | undefined,
): Promise<boolean> {
  if (!isDemoTenantId(id)) return false;
  const key = `${collection}/${id}`;
  const hit = tenantCache.get(key);
  if (hit && Date.now() - hit.at < TENANT_TTL_MS) return hit.isDemo;
  let isDemo = false;
  try {
    isDemo = isStrictDemoTenant((await db.collection(collection).doc(id as string).get()).data(), id);
  } catch {
    isDemo = false;
  }
  tenantCache.set(key, { at: Date.now(), isDemo });
  if (tenantCache.size > 200) tenantCache.delete(tenantCache.keys().next().value as string);
  return isDemo;
}

/** Tests only. */
export function __resetDemoWorldCachesForTests(): void {
  tenantCache.clear();
}
