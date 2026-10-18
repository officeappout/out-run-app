/**
 * scripts/trails/lib/pilot-context.ts — spatial context shared by the two
 * trails scripts: built-up / green / park polygons, street lamps, named
 * features (toponyms, places, settlements) and amenities, all indexed.
 * Pure given its inputs (no I/O).
 */
import { resamplePolyline } from '../../../src/lib/dem-tile-cache/elevation-profile';
import { bboxOf, GridIndex, pointInPolygonCoords, pointPolylineDistM, distM } from '../../../src/lib/trail-graph/geo';
import { LAMP_RADIUS_M } from '../../../src/lib/trail-graph/tags';
import type { NamedFeature } from '../../../src/lib/trail-graph/naming';
import type { LngLat, OsmData } from '../../../src/lib/trail-graph/types';
import type { PolygonFeature } from './pilot-osm.node';

const SAMPLE_STEP_M = 25;

class PolygonSet {
  private idx = new GridIndex<PolygonFeature>(0.01);
  readonly list: PolygonFeature[] = [];
  add(f: PolygonFeature) {
    const coords = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as LngLat[][][];
    const outer = coords.flatMap((p) => p[0] ?? []);
    if (!outer.length) return;
    this.idx.insert(f, bboxOf(outer));
    this.list.push(f);
  }
  find(p: LngLat): PolygonFeature | null {
    for (const f of this.idx.query(p, 1)) if (pointInPolygonCoords(p, f.geometry)) return f;
    return null;
  }
  contains(p: LngLat): boolean {
    return this.find(p) != null;
  }
}

const PLACE_SETTLEMENT = new Set(['city', 'town', 'village', 'hamlet']);
const PLACE_ANY = new Set(['city', 'town', 'village', 'hamlet', 'locality', 'isolated_dwelling', 'neighbourhood', 'suburb']);
const AMENITY_TYPE = (t: Record<string, string>): string | null => {
  if (t.amenity === 'drinking_water') return 'drinking_water';
  if (t.amenity === 'bench' || t.leisure === 'picnic_table' || t.tourism === 'picnic_site') return 'bench_picnic';
  if (t.amenity === 'shelter') return 'shelter';
  if (t.amenity === 'toilets') return 'toilets';
  if (t.tourism === 'viewpoint') return 'viewpoint';
  return null;
};

export interface Settlement { name: string; point: LngLat; place: string; osmNodeId: number }

export class PilotContext {
  readonly builtUp = new PolygonSet();
  readonly green = new PolygonSet();
  readonly parks = new PolygonSet();
  private lamps = new GridIndex<LngLat>(0.002);
  private amenities = new GridIndex<{ p: LngLat; type: string }>(0.005);
  readonly toponyms: NamedFeature[] = [];
  readonly places: NamedFeature[] = [];
  readonly settlements: Settlement[] = [];
  lampCount = 0;

  constructor(data: OsmData, areas: PolygonFeature[], private boundary: PolygonFeature) {
    for (const a of areas) {
      const t = a.tags;
      if (t.landuse === 'residential' || t.place) this.builtUp.add(a);
      if (['forest', 'orchard', 'recreation_ground', 'village_green'].includes(t.landuse ?? '') || t.natural === 'wood' || t.leisure === 'park' || t.leisure === 'nature_reserve' || t.leisure === 'garden' || t.boundary === 'national_park' || t.boundary === 'protected_area') this.green.add(a);
      if ((t.leisure === 'park' || t.leisure === 'garden') && (t['name:he'] ?? t.name)) this.parks.add(a);
    }
    for (const n of Array.from(data.nodes.values())) {
      const t = n.tags;
      const p: LngLat = [n.lon, n.lat];
      if (t.highway === 'street_lamp') { this.lamps.insert(p, { minLng: n.lon, maxLng: n.lon, minLat: n.lat, maxLat: n.lat }); this.lampCount++; }
      const at = AMENITY_TYPE(t);
      if (at) this.amenities.insert({ p, type: at }, { minLng: n.lon, maxLng: n.lon, minLat: n.lat, maxLat: n.lat });
      const name = t['name:he'] ?? t.name;
      if (!name) continue;
      if (t.natural || t.historic || t.water) this.toponyms.push({ name, kind: t.natural ?? t.historic ?? t.water, geometry: [p] });
      if (t.place && PLACE_ANY.has(t.place)) {
        this.places.push({ name, kind: t.place, geometry: [p] });
        if (PLACE_SETTLEMENT.has(t.place) && this.inBoundary(p)) this.settlements.push({ name, point: p, place: t.place, osmNodeId: n.id });
      }
    }
    for (const w of Array.from(data.ways.values())) {
      const t = w.tags;
      const name = t['name:he'] ?? t.name;
      if (!name || !(t.waterway || t.natural === 'valley' || t.natural === 'ridge')) continue;
      const geom = w.nodes.map((id) => data.nodes.get(id)).filter(Boolean).map((n) => [n!.lon, n!.lat] as LngLat);
      if (geom.length >= 2) this.toponyms.push({ name, kind: t.waterway ?? t.natural, geometry: geom });
    }
    this.places.push(...this.toponyms.filter((f) => f.geometry.length === 1));
    this.settlements.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }

  inBoundary(p: LngLat): boolean {
    return pointInPolygonCoords(p, this.boundary.geometry);
  }

  lineIntersectsBoundary(line: LngLat[]): boolean {
    return line.some((p) => this.inBoundary(p));
  }

  private samples(line: LngLat[]): LngLat[] {
    return resamplePolyline(line, SAMPLE_STEP_M).points;
  }

  share(line: LngLat[], pred: (p: LngLat) => boolean): number {
    const s = this.samples(line);
    return s.length ? s.filter(pred).length / s.length : 0;
  }

  builtUpShare = (line: LngLat[]) => this.share(line, (p) => this.builtUp.contains(p));
  greenShare = (line: LngLat[]) => this.share(line, (p) => this.green.contains(p));
  lampCoverage = (line: LngLat[]) => this.share(line, (p) => this.lamps.query(p, LAMP_RADIUS_M).some((l) => distM(l, p) <= LAMP_RADIUS_M));

  /** Named park the route lies mostly inside (≥ 50 % of samples). */
  parkFor(line: LngLat[]): string | null {
    const counts = new Map<string, number>();
    const s = this.samples(line);
    for (const p of s) {
      const f = this.parks.find(p);
      const n = f && (f.tags['name:he'] ?? f.tags.name);
      if (n) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    for (const [n, c] of Array.from(counts)) if (c / s.length >= 0.5) return n;
    return null;
  }

  amenityTypesNear(line: LngLat[], radiusM = 100): string[] {
    const types = new Set<string>();
    for (const p of this.samples(line)) for (const a of this.amenities.query(p, radiusM)) if (distM(a.p, p) <= radiusM) types.add(a.type);
    return Array.from(types).sort();
  }

  nearNamedNature(line: LngLat[], radiusM = 300): boolean {
    const s = this.samples(line);
    const stride = Math.max(1, Math.floor(s.length / 40));
    return this.toponyms.some((f) => {
      if (f.geometry.length === 1) return pointPolylineDistM(f.geometry[0], line) <= radiusM;
      for (let i = 0; i < s.length; i += stride) if (pointPolylineDistM(s[i], f.geometry) <= radiusM) return true;
      return false;
    });
  }

  nearestSettlement(p: LngLat, maxM = 6000): Settlement | null {
    let best: Settlement | null = null;
    let bd = maxM;
    for (const s of this.settlements) {
      const d = distM(s.point, p);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
