/**
 * OSM data (the authority's OPL extract, src/lib/trail-graph/osm-opl) →
 * UrbanLayerInput. Pure: highway ways with their tags, street lamps, the
 * amenity nodes the extract keeps (bench, drinking water, toilets) plus the
 * separately-extracted fitness stations, and every crossing / signal node.
 */
import { crossingControlFromTags } from '../route-quality/osm-layer';
import type { CrossingNode } from '../route-quality/types';
import type { OsmData } from '../trail-graph/types';
import type { LngLat, UrbanLayerInput, UrbanPoint, UrbanWay } from './types';

const AMENITY_KIND: Record<string, UrbanPoint['kind']> = { bench: 'bench', drinking_water: 'drinking_water', toilets: 'toilets' };

export function isCrossingNode(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false;
  return tags.highway === 'crossing' || tags.highway === 'traffic_signals' || !!tags.crossing;
}

export function urbanInputFromOsm(data: OsmData, fitness: LngLat[] = []): UrbanLayerInput {
  const ways: UrbanWay[] = [];
  for (const w of Array.from(data.ways.values())) {
    const highway = w.tags.highway;
    if (!highway) continue;
    const coords: LngLat[] = [];
    for (const id of w.nodes) { const n = data.nodes.get(id); if (n) coords.push([n.lon, n.lat]); }
    if (coords.length >= 2) ways.push({ id: w.id, highway, tags: w.tags, coords });
  }
  const lamps: LngLat[] = [];
  const amenities: UrbanPoint[] = fitness.map((coord) => ({ kind: 'fitness_station' as const, coord }));
  const crossings: CrossingNode[] = [];
  for (const n of Array.from(data.nodes.values())) {
    const t = n.tags;
    if (!t) continue;
    if (t.highway === 'street_lamp') lamps.push([n.lon, n.lat]);
    const kind = t.amenity ? AMENITY_KIND[t.amenity] : undefined;
    if (kind) amenities.push({ kind, coord: [n.lon, n.lat] });
    if (isCrossingNode(t)) crossings.push({ id: n.id, coord: [n.lon, n.lat], control: crossingControlFromTags(t) });
  }
  return { ways, lamps, amenities, crossings };
}
