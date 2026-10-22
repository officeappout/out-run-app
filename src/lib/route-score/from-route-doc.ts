/**
 * Adapter: a stored official_routes / curated_routes document (plain object,
 * as returned by `.data()`) → RouteScoreInput. Field-guarded throughout
 * (CLAUDE.md law 5): every field is optional on read.
 */
import { computeRouteQualityMetrics } from '../route-quality/metrics';
import { decideRouteAccuracy } from '../route-decisions/decide-accuracy';
import { classifyRouteGenerator } from '../route-collections/route-generator';
import { isOfficialOperator } from '../trail-graph/difficulty';
import { haversineM } from '../route-quality/geo';
import type { CertificateVerdict, LngLat, ParkRef, RouteScoreInput, ScoreShape, SourceTier } from './types';
import { CORRIDOR_NAME_PATTERN, NAMED_PLACE_PATTERN } from './weights';
import { classifySurface, surfaceSharesFromDoc } from './surface-class';
import type { RouteShade } from '../shade/route-shade';
import type { HourlyProfileSummary } from '../shade-hourly/route-hourly';

type Doc = Record<string, any>;

const CLOSED_LOOP_MAX_GAP_M = 50; // same cut as measure-route-geometry's CLOSURE_STRUCTURAL_GAP_M
const MAX_METRIC_POINTS = 1500;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Accepts [lng,lat] tuples or {lng,lat} objects (both shapes exist in production). */
export function parsePath(raw: unknown): LngLat[] {
  if (!Array.isArray(raw)) return [];
  const out: LngLat[] = [];
  for (const p of raw) {
    if (Array.isArray(p) && num(p[0]) != null && num(p[1]) != null) out.push([p[0], p[1]]);
    else if (p && typeof p === 'object' && num((p as Doc).lng) != null && num((p as Doc).lat) != null) {
      out.push([(p as Doc).lng, (p as Doc).lat]);
    }
  }
  return out;
}

function downsample(path: LngLat[], max: number): LngLat[] {
  if (path.length <= max) return path;
  const step = path.length / max;
  const out: LngLat[] = [];
  for (let k = 0; k < max; k++) out.push(path[Math.floor(k * step)]);
  out.push(path[path.length - 1]);
  return out;
}

export function deriveShape(d: Doc, path: LngLat[]): ScoreShape | null {
  const st = d?.shapeType;
  if (st === 'loop' || st === 'linear_corridor') return st;
  const rs = d?.routeShape;
  if (rs === 'loop' || rs === 'out_and_back' || rs === 'point_to_point') return rs;
  if (path.length < 2) return null;
  if (haversineM(path[0], path[path.length - 1]) <= CLOSED_LOOP_MAX_GAP_M) return 'loop';
  if (CORRIDOR_NAME_PATTERN.test(String(d?.name ?? ''))) return 'linear_corridor';
  return 'unclassified';
}

export function deriveSourceTier(d: Doc): SourceTier {
  const origin = d?.origin;
  const srcType = d?.source?.type;
  const externalId: string = String(d?.source?.externalId ?? '');
  const name = String(d?.name ?? '');
  if (origin === 'dataset_import' || srcType === 'municipal_open_data' || srcType === 'mot_open_data') return 'official';
  const trail = d?.trail;
  if (trail?.kind === 'osm_relation') {
    const prov = num(trail?.starBreakdown?.provenance);
    if ((prov != null && prov >= 1.5) || isOfficialOperator(trail?.osm?.operator)) return 'official';
    return 'osm_named';
  }
  if (trail?.kind === 'generated') return 'generated';
  if (origin === 'park_loop') return d?.parkLoopKind === 'inner' ? 'generated' : 'named_place';
  if (origin === 'generated') return 'generated';
  if (origin === 'web_research') return 'named_place';
  const gen = classifyRouteGenerator({ sourceExternalId: externalId, activityType: d?.activityType ?? null, name });
  if (gen === 'roundtrip') return 'generated';
  if (gen === 'park-perimeter') return 'named_place';
  if (externalId.startsWith('osm:rel/')) return 'osm_named';
  if (externalId.startsWith('osm:stitched/')) return NAMED_PLACE_PATTERN.test(name) ? 'named_place' : 'stitched';
  if (externalId.startsWith('osm:way/')) return NAMED_PLACE_PATTERN.test(name) ? 'named_place' : 'stitched';
  if (origin === 'authority_admin' || origin === 'super_admin') return 'osm_named';
  if (NAMED_PLACE_PATTERN.test(name)) return 'named_place';
  return 'unknown';
}

function parseParkRef(v: unknown): ParkRef | null {
  const p = v as Doc | null;
  if (p && typeof p.id === 'string' && typeof p.name === 'string') return { source: String(p.source ?? ''), id: p.id, name: p.name };
  return null;
}

export interface FromDocOptions {
  /** Other routes in the same city sharing this exact name (decide-accuracy's duplicate-name signal). */
  duplicateNameCount?: number;
  /** Measured safety (route-quality v1 with an OSM road layer), when the caller has one. */
  osmSafety?: { majorRoadPct: number; unmarkedPerKm: number } | null;
  /** Measured green share (trails PilotContext), when the caller has one. */
  greenShare?: number | null;
  /** Surface metres/percent per SurfaceType from a street_segments join (surfaceMixFromSegments), when the caller has one. */
  surfaceMix?: Partial<Record<string, number>> | null;
  /** Mean shade index (0..1) override. Prefer `shade`. */
  shadeShare?: number | null;
  /** Technion shade measurement (measureRouteShade); shadeShare is taken from it only when status is 'measured'. */
  shade?: RouteShade | null;
  /** Hour-aware shade summary (hourlyProfileSummary), when the city has an hourly file. Informational. */
  hourlyShade?: HourlyProfileSummary | null;
  /**
   * RC9 urban measurement (src/lib/urban-measure) — fills a gap only: the
   * stored doc's own qualitySignals always win. A measured composition
   * replaces the trail-share proxy but never feeds the certificate.
   */
  composition?: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number } | null;
  litCoveragePct?: number | null;
  amenitiesHas?: RouteScoreInput['amenitiesHas'];
  /** SI-equivalent tree hint (0..1) from a dataset; used only without a Technion measurement. */
  shadeHint?: number | null;
}

export function routeScoreInputFromDoc(id: string, d: Doc, opts: FromDocOptions = {}): RouteScoreInput {
  const path = parsePath(d?.path);
  const comp = d?.qualitySignals?.composition;
  const realComposition =
    comp && num(comp.genuinePct) != null && num(comp.sidewalkPct) != null
      ? { sidewalkPct: comp.sidewalkPct, genuinePct: comp.genuinePct, ordinaryPct: num(comp.ordinaryPct) ?? 0, otherPct: num(comp.otherPct) ?? 0 }
      : null;
  // Trails pipeline (B) routes carry no composition classifier output, but do carry
  // trail.stats (share on path/track/footway, lamp coverage). Used as a half-confidence
  // proxy; never feeds the certificate (B doesn't run it — NATIONWIDE-PLAN.md §2.3).
  const ts = d?.trail?.stats;
  const trailPct = num(ts?.trailPct);
  const measuredComposition = !realComposition && opts.composition ? { ...opts.composition } : null;
  const composition = realComposition ?? measuredComposition ?? (trailPct != null
    ? { sidewalkPct: 0, genuinePct: Math.max(0, Math.min(100, trailPct)), ordinaryPct: Math.max(0, 100 - trailPct), otherPct: 0 }
    : null);
  const compositionIsProxy = !realComposition && !measuredComposition && !!composition;
  const light = d?.qualitySignals?.lighting;
  const trailLit = num(ts?.litPct);
  const trailLitUnknown = num(ts?.litUnknownPct);
  const storedLit = light?.status === 'computed' ? num(light?.litCoveragePct) : null;
  const measuredLit = storedLit == null ? num(opts.litCoveragePct) : null;
  const litCoveragePct = storedLit ?? measuredLit
    ?? (trailLit != null && trailLitUnknown != null && trailLitUnknown <= 50 ? trailLit : null);
  const am = d?.qualitySignals?.amenities;
  const storedAmenities = am?.status === 'computed' && am?.has && typeof am.has === 'object' ? { ...am.has } : null;
  const measuredAmenities = !storedAmenities && opts.amenitiesHas ? { ...opts.amenitiesHas } : null;
  const amenitiesHas = storedAmenities ?? measuredAmenities;
  const measuredBy: NonNullable<RouteScoreInput['measuredBy']> = {
    ...(measuredComposition ? { composition: 'osm_urban_measure' as const } : {}),
    ...(measuredLit != null ? { lighting: 'osm_urban_measure' as const } : {}),
    ...(measuredAmenities ? { amenities: 'osm_urban_measure' as const } : {}),
    ...(opts.osmSafety ? { safety: 'osm_urban_measure' as const } : {}),
  };

  let geometry: RouteScoreInput['geometry'] = null;
  if (path.length >= 2) {
    const m = computeRouteQualityMetrics(downsample(path, MAX_METRIC_POINTS));
    geometry = { retracedPct: m.retracedPct, uTurnCount: m.uTurnCount, spurCount: m.spurCount, compactness: m.compactness, turnsPerKm: m.turnsPerKm, zigzagIndex: m.zigzagIndex };
  }

  const distanceKm = num(d?.distance);
  let certificate: CertificateVerdict | null = null;
  if (realComposition) {
    certificate = decideRouteAccuracy({
      composition: realComposition,
      lighting: light?.status ? { status: light.status, litCoveragePct: num(light.litCoveragePct), isLit: light.isLit ?? null } : undefined,
      pathPointCount: path.length,
      distance: distanceKm != null && distanceKm > 0
        ? { classification: 'canonical-km', normalizedKm: distanceKm }
        : { classification: 'missing-distance', normalizedKm: null },
      duplicateNameCount: opts.duplicateNameCount ?? 0,
    }).verdict;
  }

  const hasFitnessStop =
    d?.includesFitnessStop === true ||
    (Array.isArray(d?.facilityStops) && d.facilityStops.length > 0) ||
    (Array.isArray(d?.nearbyAmenities) && d.nearbyAmenities.some((a: Doc) => a?.category === 'fitness_station'));

  const activityType = typeof d?.activityType === 'string' ? d.activityType : typeof d?.type === 'string' ? d.type : null;
  const surface = surfaceSharesFromDoc(d, opts.surfaceMix ?? null);
  const shadeMeasure = opts.shade ?? null;
  const shade = num(opts.shadeShare ?? (shadeMeasure?.status === 'measured' ? shadeMeasure.shadeShare : null) ?? d?.qualitySignals?.shade?.shadeShare);

  return {
    id,
    name: String(d?.name ?? ''),
    authorityId: typeof d?.authorityId === 'string' && d.authorityId ? d.authorityId : null,
    city: typeof d?.city === 'string' && d.city ? d.city : null,
    activityType,
    distanceKm,
    path,
    shape: deriveShape(d, path),
    composition,
    compositionIsProxy,
    litCoveragePct,
    amenitiesHas,
    osmSafety: opts.osmSafety ?? null,
    geometry,
    sourceTier: deriveSourceTier(d),
    greenShare: opts.greenShare ?? null,
    parkRef: parseParkRef(d?.parkRef),
    hasFitnessStop,
    certificate,
    surface,
    surfaceClass: classifySurface(activityType, surface),
    shadeShare: shade,
    shade: shadeMeasure,
    ...(opts.hourlyShade ? { hourlyShade: opts.hourlyShade } : {}),
    ...(shade == null && num(opts.shadeHint) != null ? { shadeHint: num(opts.shadeHint) } : {}),
    ...(Object.keys(measuredBy).length ? { measuredBy } : {}),
  };
}
