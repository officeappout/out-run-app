/**
 * Server half of GET /api/catalog/routes (data-exposure plan phase 1.3, 01.11.2026).
 *
 * The app used to read `official_routes` straight from the browser (the
 * collection is `allow read: if true`), which is why anyone with the public
 * web key could download it. This reads the SAME two sets through the Admin
 * SDK so the app can stop touching the collection directly; tightening the
 * rule itself is a separate, owner-approved step.
 *
 * Same selection as the two client reads it replaces, query for query:
 *   - legacy (no `scoped`): InventoryService.fetchOfficialRoutes(undefined, true)
 *     → whole collection, limit(200), drop `published === false`.
 *   - scoped (enable_scoped_official_routes): the former InventoryService.fetchOfficialRoutesScoped
 *     → `authorityId in [chunk ≤30]` + limit(SCOPED_PER_QUERY_CAP) per chunk; if that
 *     finds nothing (or no authority is known), `published == true` + limit(SCOPED_FALLBACK_CAP).
 * Path normalisation stays on the client (same normaliser as before).
 *
 * "Lean": drops only fields no app consumer reads (import bookkeeping). Every
 * field the map / detail sheet / ranking / generators read is kept, because a
 * catalog that silently loses a field is the SPEC-07 16.09.2026 regression.
 * Timestamps become ISO strings (no app consumer reads route timestamps).
 *
 * READ-ONLY: no write verb in this file.
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  chunkIds,
  SCOPED_FALLBACK_CAP,
  SCOPED_MAX_AUTHORITIES,
  SCOPED_PER_QUERY_CAP,
} from '@/features/parks/core/services/official-routes-scope';
import { normalizeStoredRoutePath } from '@/features/parks/core/utils/routePath';

export const LEGACY_ROUTES_CAP = 200;

const isId = (v: string) => v.length > 0 && v.length <= 128 && !v.includes('/');

export type CatalogSelection = { scoped: false } | { scoped: true; authorityIds: string[] };

/**
 * `?scoped=1&authorityIds=a,b` → the scoped read (ids in the client's order, possibly
 * none: then the published-only fallback, exactly like fetchOfficialRoutesScoped([])).
 * No `scoped` → the legacy read. null when malformed or over the cap.
 */
export function parseCatalogSelection(params: URLSearchParams): CatalogSelection | null {
  if (params.get('scoped') !== '1') return { scoped: false };
  const raw = params.get('authorityIds') ?? '';
  const ids = Array.from(new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)));
  if (ids.length > SCOPED_MAX_AUTHORITIES || !ids.every(isId)) return null;
  return { scoped: true, authorityIds: ids };
}

/** Fields stripped from the catalog: import bookkeeping, never read by the app. */
export const CATALOG_DROPPED_FIELDS = ['importBatchId', 'importSourceName', 'sourceInfrastructureIds', 'createdByUser'] as const;

export type CatalogRouteDoc = Record<string, unknown> & { id: string };

function toPlain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(toPlain);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = toPlain(x);
    return out;
  }
  return v;
}

export function toCatalogRoute(id: string, data: Record<string, unknown>): CatalogRouteDoc | null {
  if (data.published === false) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if ((CATALOG_DROPPED_FIELDS as readonly string[]).includes(k)) continue;
    out[k] = toPlain(v);
  }
  return { ...out, id };
}

type Snap = { id: string; data: () => Record<string, unknown> };

function collect(docs: Snap[]): CatalogRouteDoc[] {
  const byId: Record<string, Snap> = {};
  for (const d of docs) byId[d.id] ??= d;
  return Object.values(byId)
    .map((d) => toCatalogRoute(d.id, d.data()))
    .filter((r): r is CatalogRouteDoc => r !== null);
}

export async function buildOfficialRoutesCatalog(sel: CatalogSelection): Promise<CatalogRouteDoc[]> {
  const col = getAdminDb().collection('official_routes');
  if (!sel.scoped) {
    const snap = await col.limit(LEGACY_ROUTES_CAP).get();
    return collect(snap.docs);
  }
  const { authorityIds } = sel;
  if (authorityIds.length > 0) {
    const snaps = await Promise.all(
      chunkIds(authorityIds).map((batch) => col.where('authorityId', 'in', batch).limit(SCOPED_PER_QUERY_CAP).get()),
    );
    const scoped = collect(snaps.flatMap((s) => s.docs));
    // The client used to fall back only when no scoped route survived ITS normaliser
    // (path ≥ 2 points), so decide on the same test here.
    if (scoped.some((r) => normalizeStoredRoutePath(r.path).length >= 2)) return scoped;
  }
  const fallback = await col.where('published', '==', true).limit(SCOPED_FALLBACK_CAP).get();
  return collect(fallback.docs);
}
