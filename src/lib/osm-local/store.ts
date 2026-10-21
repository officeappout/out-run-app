/**
 * LocalOsmStore — an in-memory OSM extract (nodes / ways / relations, from the
 * Geofabrik PBF via osmium OPL, or from a region snapshot) plus the few derived
 * lookups the local Overpass interpreter needs. Pure, no I/O.
 */
import type { OsmData, OsmRelation, OsmWay } from '../trail-graph/types';

export interface LatLon { lat: number; lon: number }
export interface Bbox { s: number; w: number; n: number; e: number }

export interface LocalOsmStore {
  data: OsmData;
  /** Way geometry (lat/lon); nodes missing from the extract are skipped. Cached. */
  wayGeometry(id: number): LatLon[];
  /** Closed rings (lat/lon) of the relation(s) carrying `wikidata` — an Overpass `area["wikidata"=…]`. */
  areaRings(wikidata: string): LatLon[][];
}

export function createLocalOsmStore(data: OsmData): LocalOsmStore {
  const geomCache = new Map<number, LatLon[]>();
  const wayGeometry = (id: number): LatLon[] => {
    const hit = geomCache.get(id);
    if (hit) return hit;
    const w = data.ways.get(id);
    const out: LatLon[] = [];
    for (const nid of w?.nodes ?? []) {
      const n = data.nodes.get(nid);
      if (n) out.push({ lat: n.lat, lon: n.lon });
    }
    geomCache.set(id, out);
    return out;
  };
  const areaCache = new Map<string, LatLon[][]>();
  const areaRings = (wikidata: string): LatLon[][] => {
    const hit = areaCache.get(wikidata);
    if (hit) return hit;
    const rels = Array.from(data.relations.values()).filter((r) => r.tags.wikidata === wikidata);
    // Prefer the administrative boundary when several objects share the QID.
    const rel = rels.find((r) => r.tags.boundary === 'administrative') ?? rels[0];
    const rings = rel ? assembleRings(rel, data).map((ids) => ids.map((nid) => data.nodes.get(nid)!).filter(Boolean).map((n) => ({ lat: n.lat, lon: n.lon }))) : [];
    areaCache.set(wikidata, rings);
    return rings;
  };
  return { data, wayGeometry, areaRings };
}

/**
 * Closed rings (as node-id lists) from a relation's way members, joined by
 * shared end nodes (OSM topology, not distance). Unclosable chains are dropped.
 * Inner and outer rings are both returned — point-in-area uses even-odd, so
 * holes come out right.
 */
export function assembleRings(rel: OsmRelation, data: OsmData): number[][] {
  const chains: number[][] = [];
  for (const m of rel.members) {
    if (m.type !== 'w') continue;
    const w: OsmWay | undefined = data.ways.get(m.ref);
    if (w && w.nodes.length >= 2) chains.push(w.nodes.slice());
  }
  const rings: number[][] = [];
  while (chains.length) {
    let ring = chains.shift()!;
    let grown = true;
    while (ring[0] !== ring[ring.length - 1] && grown) {
      grown = false;
      const tail = ring[ring.length - 1];
      for (let i = 0; i < chains.length; i++) {
        const c = chains[i];
        if (c[0] === tail) ring = ring.concat(c.slice(1));
        else if (c[c.length - 1] === tail) ring = ring.concat(c.slice(0, -1).reverse());
        else continue;
        chains.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring);
  }
  return rings;
}

export function inBbox(p: LatLon, b: Bbox): boolean {
  return p.lat >= b.s && p.lat <= b.n && p.lon >= b.w && p.lon <= b.e;
}

/** Any vertex in the box, or a segment whose own extent overlaps it (catches long segments crossing a small box). */
export function lineTouchesBbox(pts: LatLon[], b: Bbox): boolean {
  for (let i = 0; i < pts.length; i++) {
    if (inBbox(pts[i], b)) return true;
    if (i > 0) {
      const a = pts[i - 1], c = pts[i];
      if (Math.max(a.lat, c.lat) >= b.s && Math.min(a.lat, c.lat) <= b.n && Math.max(a.lon, c.lon) >= b.w && Math.min(a.lon, c.lon) <= b.e) return true;
    }
  }
  return false;
}

/** Even-odd point-in-polygon over every ring (outer + inner). */
export function inRings(p: LatLon, rings: LatLon[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
    }
  }
  return inside;
}
