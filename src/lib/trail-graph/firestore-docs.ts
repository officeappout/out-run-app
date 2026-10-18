/**
 * trail-graph/firestore-docs.ts — PURE mapping of pipeline output to the
 * exact Firestore documents `--apply` writes (docs/TRAILS-PILOT-SHAAR-HANEGEV.md §6).
 * No I/O, no firebase imports: timestamps are added by the executor
 * (scripts/trails/lib/trails-apply.node.ts).
 *
 * Firestore rejects nested arrays, so every geometry is stored as
 * {lng,lat}[] (same convention as official_routes.path everywhere else).
 */
import { buildValidatedDoc, stripUndefined } from '@/lib/route-collections';
import type { SurfaceType } from '@/lib/route-collections/surface-type';
import { COPERNICUS_DEM_ATTRIBUTION_SHORT } from '@/lib/dem-tile-cache/copernicus-glo30';
import { OSM_ATTRIBUTION, OSM_LICENSE, type LngLat, type TrailRoute, type TrailSegment } from './types';

/** The app's persisted Route.routeShape vocabulary (route.types.ts RouteShape). */
export type AppRouteShape = 'loop' | 'out_and_back' | 'point_to_point';

export const TRAIL_SEGMENTS_COLLECTION = 'trail_segments';
export const OFFICIAL_ROUTES_COLLECTION = 'official_routes';
export const TRAIL_SEGMENT_SOURCE = 'osm_geofabrik_v1';
export const TRAILS_PIPELINE = 'trails_v1';

export interface TrailDoc { id: string; data: Record<string, unknown> }

export const toLngLatObjects = (line: LngLat[]) => line.map(([lng, lat]) => ({ lng, lat }));

export interface SegmentDocContext {
  authorityId: string;
  osmTimestamp: string | null;
}

export function segmentDoc(s: TrailSegment, ctx: SegmentDocContext): TrailDoc {
  return {
    id: s.id,
    data: stripUndefined({
      geometry: toLngLatObjects(s.geometry),
      startNode: s.startNode,
      endNode: s.endNode,
      lengthM: s.lengthM,
      elevation: s.elevation,
      highwayClass: s.highwayClass,
      surface: s.surface,
      surfaceRaw: s.surfaceRaw,
      surfaceConfidence: s.surfaceConfidence,
      lit: s.lit,
      litSource: s.litSource,
      sacScale: s.sacScale,
      mtbScale: s.mtbScale,
      tracktype: s.tracktype,
      colour: s.colour,
      itcRef: s.itcRef,
      name: s.name,
      inBuiltUp: s.inBuiltUp,
      osmWayIds: s.osmWayIds,
      routeRelationIds: s.routeRelationIds,
      foot: s.foot,
      bicycle: s.bicycle,
      license: OSM_LICENSE,
      authorityId: ctx.authorityId,
      source: TRAIL_SEGMENT_SOURCE,
      osmTimestamp: ctx.osmTimestamp,
    }),
  };
}

/** Pipeline 'linear' (a trail that doesn't close) → the app's one-way shape. */
export function toRouteShape(shape: TrailRoute['shape']): AppRouteShape {
  return shape === 'linear' ? 'point_to_point' : shape;
}

/** Dominant surface by length share; 'unknown' when there is none. */
export function dominantSurface(mix: Partial<Record<SurfaceType, number>>): SurfaceType {
  let best: SurfaceType = 'unknown' as SurfaceType;
  let bestV = -1;
  for (const [k, v] of Object.entries(mix) as Array<[SurfaceType, number]>) if ((v ?? 0) > bestV) { best = k; bestV = v ?? 0; }
  return best;
}

/** metres per minute — the same constants scripts/geo-discovery-routes.ts uses. */
const PACE_M_PER_MIN = { walking: 90, cycling: 250 } as const;

export interface RouteDocContext {
  authorityId: string;
  city: string;
  knownAuthorityIds: Set<string>;
  osmTimestamp: string | null;
  importBatchId: string;
}

/**
 * official_routes CREATE payload (validated through the Stage-1B chokepoint).
 * Always status:'pending', published:false — lands in the Approval Center.
 */
export function routeDoc(r: TrailRoute, ctx: RouteDocContext): TrailDoc {
  const km = Math.round(r.stats.lengthM / 10) / 100;
  const shape = toRouteShape(r.shape);
  const offroad = r.stats.trailPct >= 50;
  const raw = {
    name: r.name,
    description: r.kind === 'osm_relation' ? `מסלול מסומן${r.osm?.operator ? ` (${r.osm.operator})` : ''} — מתוך OpenStreetMap` : `מסלול מוצע מ${r.settlement ?? ctx.city} — נבנה מרשת השבילים של OpenStreetMap`,
    distance: km,
    duration: Math.max(1, Math.round(r.stats.lengthM / PACE_M_PER_MIN[r.activity])),
    score: Math.round(km * 10),
    rating: r.stars.total,
    calories: Math.round(km * (r.activity === 'cycling' ? 35 : 65)),
    type: r.activity,
    activityType: r.activity,
    activityTypes: [r.activity],
    difficulty: r.difficulty.final,
    path: toLngLatObjects(r.geometry),
    segments: [],
    features: {
      hasGym: false,
      hasBenches: false,
      scenic: offroad,
      terrain: offroad ? 'dirt' : 'asphalt',
      environment: r.stats.builtUpPct >= 60 ? 'urban' : 'nature',
      trafficLoad: 'none',
      surface: offroad ? 'trail' : 'road',
    },
    routeShape: shape,
    surfaceType: dominantSurface(r.stats.surfaceMix),
    ...(r.stats.gainM != null ? { elevationGain: r.stats.gainM } : {}),
    ...((r.stats.maxGrade50mOpenPct ?? r.stats.maxGrade50mPct) != null ? { maxGrade: (r.stats.maxGrade50mOpenPct ?? r.stats.maxGrade50mPct) as number } : {}),
    source: {
      type: 'official_api',
      name: r.kind === 'osm_relation' ? 'OSM trails (Geofabrik)' : 'OSM trails — generated',
      externalId: r.id,
      ...(r.osm ? { externalLink: `https://www.openstreetmap.org/relation/${r.osm.relationId}` } : {}),
    },
    provenance: {
      pipeline: TRAILS_PIPELINE,
      osm: { license: OSM_LICENSE, snapshot: ctx.osmTimestamp, extract: 'geofabrik:israel-and-palestine' },
      ...(r.stats.gainM != null ? { elevation: { provider: 'copernicus-glo30' } } : {}),
    },
    attribution: { osm: OSM_ATTRIBUTION, elevation: COPERNICUS_DEM_ATTRIBUTION_SHORT },
    trail: {
      kind: r.kind,
      nameSource: r.nameSource,
      needsName: r.needsName,
      ...(r.nameDisambiguatedFrom ? { nameDisambiguatedFrom: r.nameDisambiguatedFrom } : {}),
      ...(shape === 'point_to_point' ? { endpoints: r.endpoints ?? { from: null, to: null } } : {}),
      settlement: r.settlement,
      segmentIds: r.segmentIds,
      segmentForward: r.segmentForward,
      stars: r.stars.total,
      starBreakdown: r.stars,
      difficultyBreakdown: r.difficulty,
      stats: r.stats,
      ...(r.osm ? { osm: r.osm } : {}),
      ...(r.dedupedRelationIds?.length ? { dedupedRelationIds: r.dedupedRelationIds } : {}),
      license: r.license,
      attribution: r.attribution,
    },
    city: ctx.city,
    authorityId: ctx.authorityId,
    importBatchId: ctx.importBatchId,
    origin: 'osm_import',
    status: 'pending',
    published: false,
  };
  return { id: r.id, data: buildValidatedDoc('official_routes', raw, { mode: 'create', knownAuthorityIds: ctx.knownAuthorityIds }) };
}

/** Deterministic JSON (sorted keys) — the idempotency fingerprint. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** Split into Firestore batches of at most `size` (≤ 400 by policy). */
export function chunk<T>(arr: T[], size = 400): T[][] {
  if (size < 1 || size > 400) throw new Error(`batch size must be 1..400, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Candidate authority names for an OSM admin boundary: "מועצה אזורית שער הנגב" → also "שער הנגב". */
export function authorityNameCandidates(areaName: string): string[] {
  const n = areaName.trim();
  const stripped = n.replace(/^(מועצה אזורית|מועצה מקומית|עיריית|עירית|מ\.א\.?|מ"א)\s+/, '').trim();
  return Array.from(new Set([n, stripped].filter(Boolean)));
}
