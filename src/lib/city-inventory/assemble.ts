/**
 * city-inventory/assemble.ts — raw tallies ⇒ the 17 `InventoryLayer`s
 * (plan §3.2 / §3.4). Pure.
 *
 * Method per layer:
 *   - counts (parks, courts, fitness stations, major roads): `osm_count`;
 *   - benches / drinking water / toilets: density per km of street vs. the
 *     peer median (`osm_density_vs_peers`); coverage `null` without peers;
 *   - crossings, lighting, surface of bike/trail/promenade ways:
 *     `osm_tag_coverage` (tagged ÷ all);
 *   - shade: Technion SI where the city has a layer — matched ÷ walkable;
 *   - lighting: with a lighting/v1 city file, `lamp_proximity_merge` (known ÷ walkable,
 *     OSM lit + lamp posts); without one, the OSM `lit` tag coverage.
 * "Not measured" stays `null` (never 0) — e.g. parks coverage until a
 * municipal reference area exists, shade outside the Technion cities.
 */
import { densityCoveragePct, densityPerKm, pct } from './coverage';
import { emptyLayer } from './doc';
import { qualityFlags } from './quality';
import type { LightingCoverage } from './lighting-coverage';
import type { ShadeCoverage } from './shade-coverage';
import type { ShadeSourceChoice } from './shade-source';
import type { OsmTallies } from './measure';
import {
  POINT_LAYER_KEYS,
  type InventoryLayer,
  type InventoryLayerKey,
  type LayerMethod,
  type LayerSource,
} from './types';

export type PointLayerKey = (typeof POINT_LAYER_KEYS)[number];

export const OSM_SOURCE_KEY = 'osm';
export const OSM_LICENSE = 'ODbL-1.0';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export interface ShadeInput {
  coverage: ShadeCoverage;
  choice: ShadeSourceChoice;
  /** ISO date of the shade source snapshot (Technion fetch date). */
  snapshotDate: string;
  segmentCount: number;
}

export interface LightingInput {
  coverage: LightingCoverage;
  /** Every source that fed the city lighting file (OSM + lamp datasets). */
  sources: LayerSource[];
}

export interface AssembleContext {
  /** ISO date (YYYY-MM-DD) of the PBF snapshot. */
  osmSnapshotDate: string;
  now: Date;
  peerMedians: Partial<Record<PointLayerKey, number | null>>;
  shade: ShadeInput | null;
  /** City lighting file (lighting/v1); absent/null = the OSM `lit` tag coverage as before. */
  lighting?: LightingInput | null;
  /** Source keys whose licence still waits for written approval. */
  licensePendingKeys: ReadonlySet<string>;
}

const km = (m: number) => Math.round(m / 100) / 10;
const km2 = (m2: number) => Math.round(m2 / 10_000) / 100;

function osmSource(ctx: AssembleContext, count: number): LayerSource {
  return { key: OSM_SOURCE_KEY, license: OSM_LICENSE, attribution: OSM_ATTRIBUTION, snapshotDate: ctx.osmSnapshotDate, count };
}

interface LayerValues {
  count?: number | null;
  lengthKm?: number | null;
  areaKm2?: number | null;
  density?: number | null;
  coveragePct?: number | null;
  peerMedian?: number | null;
}

function layer(method: LayerMethod, sources: LayerSource[], v: LayerValues, ctx: AssembleContext): InventoryLayer {
  const coveragePct = v.coveragePct ?? null;
  return {
    ...emptyLayer(),
    count: v.count ?? null,
    lengthKm: v.lengthKm ?? null,
    areaKm2: v.areaKm2 ?? null,
    density: v.density ?? null,
    coveragePct,
    method,
    sources,
    quality: qualityFlags({
      method,
      coveragePct,
      sources,
      density: v.density ?? null,
      peerMedianDensity: v.peerMedian ?? null,
      licensePendingKeys: ctx.licensePendingKeys,
      now: ctx.now,
    }),
    lastRefreshAt: ctx.now,
  };
}

function osmLayer(method: LayerMethod, v: LayerValues, ctx: AssembleContext): InventoryLayer {
  const n = v.count ?? 0;
  return layer(method, [osmSource(ctx, n)], v, ctx);
}

function shadeLayer(s: ShadeInput | null, ctx: AssembleContext): InventoryLayer {
  if (!s) return emptyLayer();
  const src: LayerSource = {
    key: s.choice.sourceKey,
    license: s.choice.license,
    attribution: s.choice.attribution,
    snapshotDate: s.snapshotDate,
    count: s.segmentCount,
  };
  return layer(s.choice.method, [src], { lengthKm: km(s.coverage.matchedM), coveragePct: pct(s.coverage.matchedM, s.coverage.walkableM) }, ctx);
}

export function assembleLayers(t: OsmTallies, ctx: AssembleContext): Record<InventoryLayerKey, InventoryLayer> {
  const streetKm = t.streetM / 1000;
  const point = (k: PointLayerKey): InventoryLayer => {
    const count = t.counts[k];
    const density = densityPerKm(count, streetKm);
    const peerMedian = ctx.peerMedians[k] ?? null;
    return osmLayer('osm_density_vs_peers', { count, density, coveragePct: densityCoveragePct(density, peerMedian), peerMedian }, ctx);
  };
  const linear = (k: keyof OsmTallies['linear'], method: LayerMethod) => {
    const l = t.linear[k];
    return osmLayer(method, { count: l.count, lengthKm: km(l.lengthM), coveragePct: method === 'osm_tag_coverage' ? pct(l.knownSurfaceM, l.lengthM) : null }, ctx);
  };
  return {
    parks: osmLayer('osm_count', { count: t.parks.parks, areaKm2: km2(t.parks.parksAreaM2) }, ctx),
    big_parks: osmLayer('osm_count', { count: t.parks.bigParks, areaKm2: km2(t.parks.bigParksAreaM2) }, ctx),
    lap_loops: osmLayer('osm_count', { count: t.parks.lapLoops, areaKm2: km2(t.parks.lapLoopsAreaM2) }, ctx),
    courts: osmLayer('osm_count', { count: t.counts.courts }, ctx),
    fitness_stations: osmLayer('osm_count', { count: t.counts.fitness_stations }, ctx),
    benches: point('benches'),
    drinking_water: point('drinking_water'),
    toilets: point('toilets'),
    major_roads: linear('major_roads', 'osm_count'),
    crossings: osmLayer('osm_tag_coverage', { count: t.crossings.count, coveragePct: pct(t.crossings.detailed, t.crossings.count) }, ctx),
    bike_paved: linear('bike_paved', 'osm_tag_coverage'),
    bike_offroad: linear('bike_offroad', 'osm_tag_coverage'),
    trails_paved: linear('trails_paved', 'osm_tag_coverage'),
    trails_offroad: linear('trails_offroad', 'osm_tag_coverage'),
    promenades: linear('promenades', 'osm_tag_coverage'),
    lighting: ctx.lighting
      ? layer('lamp_proximity_merge', ctx.lighting.sources, { lengthKm: km(ctx.lighting.coverage.litM), coveragePct: pct(ctx.lighting.coverage.knownM, ctx.lighting.coverage.walkableM) }, ctx)
      : osmLayer('osm_tag_coverage', { lengthKm: km(t.lighting.litM), coveragePct: pct(t.lighting.taggedM, t.lighting.walkableM) }, ctx),
    shade: shadeLayer(ctx.shade, ctx),
  };
}
