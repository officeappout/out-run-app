/**
 * Corridor → official_routes doc (pending, unpublished, create-only).
 * Mirrors the trails pipeline's doc shape (src/lib/trail-graph/firestore-docs.ts)
 * so every reader sees a normal route. The caller MUST pass the result through
 * buildValidatedDoc before writing (scripts/routes-nationwide/import-dataset.ts
 * does, and trails-apply's executePlan re-validates at the write site).
 *
 * Provenance is kept on its own keys (`source.type`, `provenance.dataset`) —
 * one source per route, never mixed with OSM geometry (§2.1 licence note).
 */
import type { Corridor, DatasetSpec } from './types';

export const DATASET_PIPELINE = 'dataset-import';

/** Cruising pace per activity (m/min) for the duration estimate — same family as the trails pipeline. */
const PACE_M_PER_MIN = { cycling: 250, running: 160, walking: 80 } as const;
const KCAL_PER_KM = { cycling: 35, running: 65, walking: 55 } as const;

/** Small deterministic hash (two FNV-1a 32-bit lanes) — no crypto import, so it runs in any runtime. */
export function stableHash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Deterministic doc id: same dataset + same set of sections → same id (re-runs are create-only no-ops). */
export function datasetRouteId(spec: DatasetSpec, c: Corridor): string {
  return `ds_${spec.key}_${stableHash([...c.featureIds].sort().join('|'))}`;
}

export function corridorRouteName(spec: DatasetSpec, c: Corridor, ordinal: number): string {
  const base = c.name ? `${spec.routeNamePrefix} — ${c.name}` : spec.routeNamePrefix;
  return ordinal > 1 ? `${base} (${ordinal})` : base;
}

export interface DatasetDocContext {
  authorityId: string;
  city: string;
  /** Dataset metadata_modified (CKAN) — the snapshot this import came from. */
  snapshot: string | null;
  importBatchId: string;
  ordinal?: number;
}

export function datasetRouteDoc(spec: DatasetSpec, c: Corridor, ctx: DatasetDocContext): { id: string; data: Record<string, unknown> } {
  const km = Math.round((c.lengthM / 1000) * 100) / 100;
  const activity = spec.activity;
  return {
    id: datasetRouteId(spec, c),
    data: {
      name: corridorRouteName(spec, c, ctx.ordinal ?? 1),
      description: `${spec.title} — ${spec.publisher}`,
      distance: km,
      duration: Math.max(1, Math.round(c.lengthM / PACE_M_PER_MIN[activity])),
      score: Math.round(km * 10),
      rating: 0,
      calories: Math.round(km * KCAL_PER_KM[activity]),
      type: activity,
      activityType: activity,
      activityTypes: [activity],
      difficulty: 'easy',
      path: c.coords.map(([lng, lat]) => ({ lng, lat })),
      segments: [],
      features: {
        hasGym: false,
        hasBenches: false,
        scenic: false,
        terrain: 'asphalt',
        environment: 'urban',
        trafficLoad: 'none',
        surface: 'road',
      },
      routeShape: c.closed ? 'loop' : 'point_to_point',
      authorityId: ctx.authorityId,
      city: ctx.city,
      status: 'pending',
      published: false,
      origin: 'dataset_import',
      isInfrastructure: false,
      ...(activity === 'cycling' ? { infrastructureMode: 'cycling' } : {}),
      source: {
        type: spec.sourceType,
        name: spec.title,
        externalId: `dataset:${spec.key}/${[...c.featureIds].sort().join('+')}`,
        externalLink: spec.datasetUrl,
      },
      provenance: {
        pipeline: DATASET_PIPELINE,
        dataset: { key: spec.key, license: spec.license, attribution: spec.attribution, url: spec.datasetUrl, snapshot: ctx.snapshot },
      },
      dataset: { key: spec.key, featureIds: c.featureIds, lengthM: Math.round(c.lengthM) },
      importBatchId: ctx.importBatchId,
      importSourceName: spec.title,
    },
  };
}
