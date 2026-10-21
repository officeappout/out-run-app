/**
 * Lighting along a route line — the same buffer matching as shade
 * (`shadeShareForLine`): each lit piece is a segment with value 1, each
 * unlit piece value 0; unknown streets are absent. Pure.
 */
import { buildShadeIndex, shadeShareForLine, type ShadeSpatialIndex } from '../shade/match';
import type { LonLat, ShadeSegmentFeature } from '../shade/types';
import type { LightingCityFile } from './file';

export type LitIndex = ShadeSpatialIndex;

/** Match radius for lit pieces (no polygon widening — pieces are OSM axes). */
export const LIT_MATCH_BUFFER_M = 15;

export function buildLitIndex(file: Pick<LightingCityFile, 'pieces' | 'city'>): LitIndex {
  const feats: ShadeSegmentFeature[] = file.pieces.map((p) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: p.line },
    properties: {
      shadeIndex: p.lit === 'yes' ? 1 : 0,
      indexType: 'SI_daily',
      city: file.city,
      sourceLayer: 'lighting_v1',
      sourceFeatureId: p.id,
      fetchedAt: '',
    },
  }));
  return buildShadeIndex(feats);
}

export type RouteLightingStatus = 'measured' | 'no_data';

export interface RouteLighting {
  status: RouteLightingStatus;
  /** Lit share of the length with a known answer (0..1), null when none. */
  litShare: number | null;
  /** Lit length ÷ total route length (0..1) — unknown counts as not lit. The ranking signal. */
  litLengthShare: number;
  /** Known-answer length ÷ total length. */
  coverage: number;
  totalLengthM: number;
}

export function measureRouteLighting(line: LonLat[], idx: LitIndex | null, stepM = 5): RouteLighting {
  if (!idx || !idx.size) return { status: 'no_data', litShare: null, litLengthShare: 0, coverage: 0, totalLengthM: 0 };
  const r = shadeShareForLine(line, idx, { bufferM: LIT_MATCH_BUFFER_M, widenByWidth: false, shadedMinIndex: 0.5, stepM });
  return {
    status: r.shadeShare == null ? 'no_data' : 'measured',
    litShare: r.shadeShare,
    litLengthShare: r.totalLengthM > 0 ? r.shadedLengthM / r.totalLengthM : 0,
    coverage: r.coverage,
    totalLengthM: r.totalLengthM,
  };
}
