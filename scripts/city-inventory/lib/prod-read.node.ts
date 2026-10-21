/**
 * scripts/city-inventory/lib/prod-read.node.ts — the READ-ONLY production
 * inputs of one inventory run (RC4 I1): the authority doc + its boundary,
 * the approved-route count, and the Technion shade layer from Storage.
 * Nothing in this file writes.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type { App } from 'firebase-admin/app';
import { boundaryFromStored } from '../../../src/lib/dataset-import/authority-assign';
import { normalizeCityName } from '../../../src/lib/route-collections';
import { buildShadeIndex, type ShadeSpatialIndex } from '../../../src/lib/shade/match';
import { bucketShadeFetcher, type ShadeBucketLike } from '../../../src/lib/shade/bucket-fetcher.node';
import { technionCityForName } from '../../../src/lib/shade/loader';
import type { ShadeSegmentCollection } from '../../../src/lib/shade/types';
import { resolveShadeSource, type AuthorityType, type BoundaryGeometry, type ShadeSourceChoice } from '../../../src/lib/city-inventory';
import { readAllOfficialRoutes, type RawDoc } from '../../lib/route-collections-read.node';
import { resolveAuthorityByName } from '../../trails/lib/trails-apply.node';

const AUTHORITY_TYPES: readonly AuthorityType[] = ['city', 'local_council', 'regional_council'];

export interface ProdAuthority {
  id: string;
  name: string;
  type: AuthorityType;
  population: number | null;
  boundary: BoundaryGeometry | null;
}

/** By id (`--authority`) or by exact normalized name (`--city`; 0 or ≥ 2 matches is an error, never a guess). */
export async function readAuthority(db: Firestore, sel: { id: string | null; city: string | null }): Promise<ProdAuthority> {
  const id = sel.id ?? (sel.city ? (await resolveAuthorityByName(db, sel.city)).id : null);
  if (!id) throw new Error('need --authority <id> or --city <name>');
  const snap = await db.collection('authorities').doc(id).get();
  if (!snap.exists) throw new Error(`authorities/${id} does not exist`);
  const d = snap.data() ?? {};
  const type = AUTHORITY_TYPES.find((t) => t === d.type);
  if (!type) throw new Error(`authorities/${id} has type "${String(d.type)}" — the inventory covers city / local_council / regional_council only`);
  const population = typeof d.population === 'number' && Number.isFinite(d.population) && d.population > 0 ? d.population : null;
  return { id, name: String(d.name ?? ''), type, population, boundary: boundaryFromStored(d.boundaryGeoJSON) };
}

let routesCache: RawDoc[] | null = null;

/**
 * Approved = `published === true` (same rule as city-mapping-summary.ts).
 * Matched by authorityId, or — for legacy docs written with no authorityId
 * (e.g. Tel Aviv's pilot routes) — by the normalized city name. Docs of the
 * authority with no `published` boolean at all are reported as `noStatus`
 * (not approved, not pending — surfaced, never folded into either).
 */
export interface RouteCounts { approved: number; byAuthorityId: number; byCityName: number; pending: number; noStatus: number }

export async function countApprovedRoutes(db: Firestore, a: Pick<ProdAuthority, 'id' | 'name'>): Promise<RouteCounts> {
  routesCache ??= await readAllOfficialRoutes(db, { pageSize: 500 });
  const name = normalizeCityName(a.name);
  const c: RouteCounts = { approved: 0, byAuthorityId: 0, byCityName: 0, pending: 0, noStatus: 0 };
  for (const r of routesCache) {
    const aid = typeof r.data?.authorityId === 'string' ? r.data.authorityId : '';
    const mine = aid === a.id || (!aid && typeof r.data?.city === 'string' && normalizeCityName(r.data.city) === name);
    if (!mine) continue;
    const pub = r.data?.published;
    if (pub === true) {
      c.approved++;
      if (aid) c.byAuthorityId++; else c.byCityName++;
    } else if (pub === false) {
      if (r.data?.status !== 'archived' && r.data?.status !== 'rejected') c.pending++;
    } else c.noStatus++;
  }
  return c;
}

export interface LoadedShade {
  index: ShadeSpatialIndex;
  choice: ShadeSourceChoice;
  snapshotDate: string;
  segmentCount: number;
}

/** Technion layer for this city from prod Storage `shade/technion/v1/`, or null (no layer / not readable). */
export async function loadTechnionShade(app: App, projectId: string, authorityName: string, log = console.log): Promise<LoadedShade | null> {
  const choice = resolveShadeSource({ technionCitySlug: technionCityForName(authorityName), canopyAvailable: false });
  if (!choice?.storagePath) return null;
  const { getStorage } = await import('firebase-admin/storage');
  const bucket = getStorage(app).bucket(`${projectId}.firebasestorage.app`) as unknown as ShadeBucketLike;
  const body = (await bucketShadeFetcher(bucket)(choice.storagePath)) as ShadeSegmentCollection | null;
  if (!body || !Array.isArray(body.features) || !body.features.length) {
    log(`[shade] ${choice.storagePath}: missing or empty — shade stays "not measured"`);
    return null;
  }
  const fetchedAt = String(body.features[0]?.properties?.fetchedAt ?? '');
  return { index: buildShadeIndex(body), choice, snapshotDate: fetchedAt.slice(0, 10), segmentCount: body.features.length };
}
