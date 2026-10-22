/**
 * The whole dataset → routes pipeline for one dataset, pure:
 * normalize → stitch → authority assignment → dedup against existing routes → docs.
 * Writes nothing; the script validates and (only with --apply) writes.
 */
import { assignAuthority, type AuthorityBoundary } from './authority-assign';
import { normalizeFeatures, type NormalizeReport } from './normalize';
import { isDuplicate } from './overlap';
import { stitchCorridors, type StitchReport } from './stitch';
import { datasetRouteDoc } from './to-route-doc';
import { treeShadeHint } from './tree-hint';
import type { Corridor, DatasetLine, DatasetSpec, LngLat } from './types';

/** An existing route to dedup against. authorityId null = compare regardless of authority (geometry decides). */
export interface ExistingRoute { id: string; authorityId: string | null; name: string; coords: LngLat[] }

export interface PlannedRoute {
  id: string;
  data: Record<string, unknown>;
  corridor: Corridor;
  authorityId: string;
  share: number;
  /** SI-equivalent tree hint from the sections' attributes (null = no answer / dataset has none). */
  shadeHint: number | null;
}

export interface SkippedCorridor { name: string; lengthM: number; reason: string }

export interface DatasetPlan {
  normalize: NormalizeReport;
  stitch: StitchReport;
  routes: PlannedRoute[];
  skipped: SkippedCorridor[];
  perAuthority: Record<string, number>;
  /** The normalized sections (with kept attributes) — reused by the bike-adjacent stage. */
  lines: DatasetLine[];
}

export function planDatasetImport(
  geojson: unknown,
  spec: DatasetSpec,
  opts: {
    boundaries: AuthorityBoundary[];
    /** Operator override: every corridor belongs to this authority (single-city datasets, e.g. Jerusalem). */
    forceAuthorityId?: string | null;
    /** authorityId → display city name (the doc's `city`). */
    cityByAuthority: Record<string, string>;
    existing: ExistingRoute[];
    snapshot: string | null;
    importBatchId: string;
  },
): DatasetPlan {
  const { lines, report: normalize } = normalizeFeatures(geojson, spec);
  const { corridors, report: stitch } = stitchCorridors(lines, spec);
  const lineById = new Map(lines.map((l) => [l.featureId, l]));
  const routes: PlannedRoute[] = [];
  const skipped: SkippedCorridor[] = [];
  const perAuthority: Record<string, number> = {};
  const ordinals = new Map<string, number>();
  for (const c of corridors) {
    const a = opts.forceAuthorityId
      ? { authorityId: opts.forceAuthorityId, share: 1 }
      : assignAuthority(c.coords, opts.boundaries);
    if (!a.authorityId) {
      skipped.push({ name: c.name, lengthM: Math.round(c.lengthM), reason: `no authority holds ≥50% of it (best ${Math.round(a.share * 100)}%)` });
      continue;
    }
    const city = opts.cityByAuthority[a.authorityId];
    if (!city) {
      skipped.push({ name: c.name, lengthM: Math.round(c.lengthM), reason: `authority ${a.authorityId} has no city name` });
      continue;
    }
    const dup = opts.existing.find((e) => (!e.authorityId || e.authorityId === a.authorityId) && isDuplicate(c.coords, e.coords));
    if (dup) {
      skipped.push({ name: c.name, lengthM: Math.round(c.lengthM), reason: `duplicate of existing route ${dup.id} ("${dup.name}") — ≥70% within 15 m` });
      continue;
    }
    const ordKey = `${a.authorityId}|${c.name}`;
    const ordinal = (ordinals.get(ordKey) ?? 0) + 1;
    ordinals.set(ordKey, ordinal);
    const doc = datasetRouteDoc(spec, c, { authorityId: a.authorityId, city, snapshot: opts.snapshot, importBatchId: opts.importBatchId, ordinal });
    const shadeHint = spec.keepFields?.length ? treeShadeHint(c.featureIds.map((id) => lineById.get(id)).filter((l): l is DatasetLine => !!l)) : null;
    routes.push({ ...doc, corridor: c, authorityId: a.authorityId, share: a.share, shadeHint });
    perAuthority[a.authorityId] = (perAuthority[a.authorityId] ?? 0) + 1;
  }
  return { normalize, stitch, routes, skipped, perAuthority, lines };
}
