/**
 * Route line → RouteSummary + StationSummary[] (pure). Every number that needs the FULL line
 * (route-quality metrics, each station's distance to the line) is computed here, on the device,
 * BEFORE the line is privacy-trimmed; only the trimmed, rounded line leaves the device.
 */
import { computeRouteQualityMetrics } from '@/lib/route-quality/metrics';
import type { LngLat } from '@/lib/route-quality/types';
import { distanceToPathM, roundCoord, trimPathEnds } from '../geo';
import { encodePolyline } from '../polyline';
import type { RouteSummary, StationSummary } from '../types';

/** Metres cut off both ends of a stored line (privacy zone around the start / end). */
export const ROUTE_PRIVACY_TRIM_M = 200;
/** A stored line is thinned to at most this many points. */
export const ROUTE_MAX_POINTS = 400;

export interface StationInput {
  parkId: string;
  lat: number;
  lng: number;
  equipment?: string[] | null;
}

export interface RouteLineInput {
  path: LngLat[];
  loop: boolean;
  targetKm?: number | null;
  source?: RouteSummary['source'];
  /** Unmarked tertiary+ crossings, when the generator measured them against OSM. */
  unmarkedCrossings?: number | null;
  majorRoadPct?: number | null;
}

function thin(path: LngLat[], max: number): LngLat[] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => path[Math.round(i * step)]);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function summarizeStations(stations: StationInput[], fullPath: LngLat[] | null): StationSummary[] {
  return stations
    .filter((s) => s && typeof s.parkId === 'string' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .slice(0, 20)
    .map((s) => {
      const d = fullPath && fullPath.length ? distanceToPathM([s.lng, s.lat], fullPath) : null;
      return {
        parkId: s.parkId,
        lat: Math.round(s.lat * 1e5) / 1e5,
        lng: Math.round(s.lng * 1e5) / 1e5,
        distanceToRouteM: d === null ? null : Math.round(d),
        equipment: Array.isArray(s.equipment) ? s.equipment.slice(0, 30) : null,
      };
    });
}

export function summarizeRouteLine(input: RouteLineInput): RouteSummary | null {
  const path = (input.path ?? []).filter(
    (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  ) as LngLat[];
  if (path.length < 2) return null;
  const targetKm = typeof input.targetKm === 'number' && input.targetKm > 0 ? input.targetKm : null;
  const m = computeRouteQualityMetrics(path, { targetKm: targetKm ?? undefined });
  const stored = thin(trimPathEnds(path, ROUTE_PRIVACY_TRIM_M), ROUTE_MAX_POINTS).map((p) => roundCoord(p, 4));
  return {
    polyline: encodePolyline(stored),
    loop: input.loop,
    targetKm,
    source: input.source ?? 'unknown',
    metrics: {
      lengthM: Math.round(m.lengthM),
      spurCount: m.spurCount,
      uTurnCount: m.uTurnCount,
      retracedPct: r3(m.retracedPct),
      selfIntersections: m.selfIntersections,
      compactness: r3(m.compactness),
      distanceErrorPct: m.distanceErrorPct === null ? null : r3(m.distanceErrorPct),
      unmarkedCrossings: typeof input.unmarkedCrossings === 'number' ? input.unmarkedCrossings : null,
      majorRoadPct: typeof input.majorRoadPct === 'number' ? r3(input.majorRoadPct) : null,
    },
  };
}
