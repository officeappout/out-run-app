/**
 * Hour-aware shade along a route, from a decoded city file: the route is
 * matched to the city's street pieces with the same matcher as the Technion
 * shade (walkLineMatches), then each matched step takes its piece's value
 * at the requested grid cell — or its whole 168-cell profile. Pure.
 */
import { buildShadeIndex, walkLineMatches, type ShadeShareOptions, type ShadeSpatialIndex } from '../shade/match';
import type { LonLat, ShadeSegmentFeature } from '../shade/types';
import type { HourlySegment } from './city-file';
import { dequantizeCell } from './quantize';
import { GRID_CELLS, HOURS_PER_DAY, cellIndex, type SunCell } from './time-grid';

/** Below this matched share of the route, hour shade is "not measured" (same gate as the Technion shade). */
export const HOURLY_MIN_COVERAGE = 0.5;
/** Match options: OSM street axes, no polygon widening. */
export const HOURLY_MATCH: ShadeShareOptions = { bufferM: 15, widenByWidth: false };

export interface HourlyCity {
  city: string;
  /** Spatial index whose `shadeIndex` is the ordinal into `segments`. */
  index: ShadeSpatialIndex;
  segments: HourlySegment[];
  /** Sun table for the city (same grid). */
  sunTable: SunCell[];
}

export function buildHourlyCity(city: string, segments: HourlySegment[], sunTable: SunCell[]): HourlyCity {
  const feats: ShadeSegmentFeature[] = segments.map((s, i) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: s.line },
    properties: { shadeIndex: i, indexType: 'SI_daily', city, sourceLayer: 'shade_hourly_v1', sourceFeatureId: s.id, fetchedAt: '' },
  }));
  return { city, index: buildShadeIndex(feats), segments, sunTable };
}

export interface HourShade {
  status: 'measured' | 'low_coverage' | 'no_data';
  /** Length-weighted shade (0..1) at that hour over the matched length; null unless measured. */
  shade: number | null;
  coverage: number;
  /** True when the sun is below the horizon for that cell (no direct sun anywhere). */
  sunDown: boolean;
}

/** Shade along `line` at one grid cell (cellIndex(monthIndex, hour)). */
export function hourShadeForLine(c: HourlyCity, line: LonLat[], cell: number, stepM = 10): HourShade {
  if (c.sunTable[cell] && c.sunTable[cell].elevationDeg <= 0) return { status: 'no_data', shade: null, coverage: 0, sunDown: true };
  let total = 0, matched = 0, weighted = 0;
  walkLineMatches(line, c.index, { ...HOURLY_MATCH, stepM }, (len, ord) => {
    total += len;
    if (ord == null) return;
    const v = dequantizeCell(c.segments[ord].cells[cell]);
    if (v == null) return;
    matched += len;
    weighted += len * v;
  });
  const coverage = total > 0 ? matched / total : 0;
  if (matched === 0) return { status: 'no_data', shade: null, coverage, sunDown: false };
  if (coverage < HOURLY_MIN_COVERAGE) return { status: 'low_coverage', shade: null, coverage, sunDown: false };
  return { status: 'measured', shade: weighted / matched, coverage, sunDown: false };
}

export interface HourlyProfileSummary {
  source: 'shade_hourly_v1';
  /** Matched share of the route length (0..1). */
  coverage: number;
  /** Jun–Aug radiation-weighted daily mean shade (0..1). */
  summerMean: number | null;
  /** 21 July, 06…19 local: mean shade per hour, null when the sun is down. */
  julyByHour: Array<number | null>;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Whole-profile summary for route_scores (comfort, informational): null when
 * the city file covers < HOURLY_MIN_COVERAGE of the route.
 */
export function hourlyProfileSummary(c: HourlyCity, line: LonLat[], stepM = 10): HourlyProfileSummary | null {
  const sum = new Float64Array(GRID_CELLS);
  const wts = new Float64Array(GRID_CELLS);
  let total = 0, matched = 0;
  walkLineMatches(line, c.index, { ...HOURLY_MATCH, stepM }, (len, ord) => {
    total += len;
    if (ord == null) return;
    matched += len;
    const cells = c.segments[ord].cells;
    for (let k = 0; k < GRID_CELLS; k++) {
      const v = dequantizeCell(cells[k]);
      if (v == null) continue;
      sum[k] += len * v;
      wts[k] += len;
    }
  });
  const coverage = total > 0 ? matched / total : 0;
  if (coverage < HOURLY_MIN_COVERAGE || matched === 0) return null;
  const at = (k: number) => (wts[k] > 0 ? sum[k] / wts[k] : null);
  let w = 0, s = 0;
  for (const mi of [5, 6, 7]) {
    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const k = mi * HOURS_PER_DAY + h;
      const v = at(k);
      const el = c.sunTable[k]?.elevationDeg ?? 0;
      if (v == null || el <= 0) continue;
      const wt = Math.sin((el * Math.PI) / 180);
      w += wt;
      s += wt * v;
    }
  }
  const julyByHour: Array<number | null> = [];
  for (let h = 6; h <= 19; h++) {
    const v = at(cellIndex(6, h));
    julyByHour.push(v == null ? null : r3(v));
  }
  return { source: 'shade_hourly_v1', coverage: r3(coverage), summerMean: w > 0 ? r3(s / w) : null, julyByHour };
}
