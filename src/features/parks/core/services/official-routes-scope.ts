/**
 * official-routes-scope — WHICH official_routes the app reads when the panel flag
 * `enable_scoped_official_routes` is on (fix/official-routes-cap-and-approval-query).
 *
 * The problem: the app's only read was `official_routes` with `limit(200)` across the WHOLE
 * collection (InventoryService.fetchOfficialRoutes(undefined, true)), then a client-side drop of
 * `published === false`. On 22.10.2026 production held 323 docs, 99 of them visible to users —
 * and the first 200 returned only 74 of those 99. With ~1,300 nationwide routes (all created
 * `published:false` until approved) almost every city would show nothing.
 *
 * Fields that exist on official_routes and can be queried with the automatic single-field
 * indexes (no composite index, no backfill): `authorityId` (set on every doc created through
 * buildValidatedDoc — every nationwide route — and on all but 16 legacy docs), `city`,
 * `published`. There is NO geo field (no geohash / bbox / start point), so a true viewport bbox
 * query is not possible without a new field + backfill — out of scope here.
 *
 * Scope = the user's authorities, all known on the device with ZERO extra reads:
 *   - profile.core.authorityId                       (home authority)
 *   - profile.core.affiliations[type='city'].id      (written by useUserCityName from the LIVE
 *                                                     GPS city — so a traveller also gets the
 *                                                     city they are standing in; a synthetic
 *                                                     slug id simply matches no route)
 * Query plan:
 *   authorities known → `authorityId in [≤30]` + limit(PER_QUERY_CAP) per chunk; published
 *                       filtered client-side exactly as today (`published === false` dropped),
 *                       because a server-side `published == true` would drop docs that have no
 *                       `published` field at all (axiom §33 — the 26 Sderot routes).
 *   none known, or the scoped read came back empty (e.g. a military-unit authority with no
 *   routes) → `published == true` + limit(FALLBACK_CAP): only approved routes, so the cap is
 *                       no longer eaten by pending nationwide imports. Docs with NO published
 *                       field are missed by this branch until the publish-status backfill runs.
 *
 * Firestore rule (official_routes: `allow read: if true`) admits every one of these shapes —
 * nothing to change (axiom §25 checked). Pure module: no Firebase, no React.
 */

/** Firestore `in` accepts at most 30 values per query. */
export const SCOPED_IN_CHUNK = 30;
/** Per-query cap for the authority-scoped read (largest city today: Haifa, 77 docs). */
export const SCOPED_PER_QUERY_CAP = 300;
/** Cap for the published-only fallback (same size as the legacy read). */
export const SCOPED_FALLBACK_CAP = 200;
/** Never fan out more than this many authorities (affiliations can accumulate over time). */
export const SCOPED_MAX_AUTHORITIES = 10;

export interface ScopeProfileCore {
  authorityId?: unknown;
  affiliations?: unknown;
}

export interface OfficialRoutesScope {
  authorityIds: string[];
  /** cache key — changes when the user's authorities change (login, new GPS city) */
  key: string;
}

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128 && !v.includes('/');

export function resolveOfficialRoutesScope(core: ScopeProfileCore | null | undefined): OfficialRoutesScope {
  const ids: string[] = [];
  const push = (v: unknown) => {
    if (isId(v) && !ids.includes(v) && ids.length < SCOPED_MAX_AUTHORITIES) ids.push(v);
  };
  push(core?.authorityId);
  if (Array.isArray(core?.affiliations)) {
    for (const a of core!.affiliations as unknown[]) {
      if (a && typeof a === 'object' && (a as { type?: unknown }).type === 'city') push((a as { id?: unknown }).id);
    }
  }
  const sorted = [...ids].sort();
  return { authorityIds: ids, key: sorted.length ? `auth:${sorted.join(',')}` : 'published-only' };
}

export function chunkIds(ids: string[], size = SCOPED_IN_CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
