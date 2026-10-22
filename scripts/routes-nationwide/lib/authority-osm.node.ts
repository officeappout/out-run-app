/**
 * One authority's OSM slice for the park-loops and neighbourhood stages
 * (RC8) and the urban measurements (RC9): one osmium cut of the boundary bbox from the local Geofabrik PBF,
 * loaded lazily, at most once per authority, and deleted after the authority
 * (only the small JSON outputs stay). Read-only; writes nothing to Firestore.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { buildPathIndex, pointInRing, selectBigParks, type LngLat, type ParkPolygon, type PathIndex, type PathLine, type PointFeature } from '../../../src/lib/park-loops';
import type { NamedWay } from '../../../src/lib/routes-nationwide/named-corridors';
import { buildUrbanLayer, urbanInputFromOsm, type UrbanLayer } from '../../../src/lib/urban-measure';
import type { NamingContext } from '../../../src/lib/routes-nationwide/route-naming';
import { assertOsmium, ensureIsraelPbf, extractPilot, fetchAdminBoundary, pbfTimestamp, type PilotExtract } from '../../trails/lib/pilot-osm.node';

/** Ways a runner/walker can actually follow around a park. Roads are deliberately excluded. */
export const WALKABLE = new Set(['footway', 'path', 'cycleway', 'pedestrian', 'track', 'bridleway', 'living_street']);
/** Where a neighbourhood loop may start: quiet residential streets and walkways. */
export const SEED_HIGHWAYS = new Set(['residential', 'living_street', 'footway', 'pedestrian', 'path', 'cycleway']);
const MAX_SEED_CANDIDATES = 4_000;

type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

export function outerRings(g: Geometry): LngLat[][] {
  const polys = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as LngLat[][][];
  return polys.map((p) => p?.[0]).filter((r): r is LngLat[] => Array.isArray(r) && r.length >= 4);
}

export function fitnessStations(cutPbf: string, work: string): PointFeature[] {
  const f = path.join(work, 'fitness.osm.pbf');
  execFileSync('osmium', ['tags-filter', '-O', cutPbf, 'n/leisure=fitness_station', '-o', f], { stdio: ['ignore', 'ignore', 'inherit'] });
  const out = execFileSync('osmium', ['export', f, '-f', 'geojsonseq', '--geometry-types=point', '-a', 'type,id', '-x', 'print_record_separator=false'], { maxBuffer: 1 << 26 }).toString();
  return out.split('\n').filter((l) => l.trim()).map((l) => {
    const g = JSON.parse(l);
    return { id: `node/${g.properties?.['@id']}`, coord: g.geometry.coordinates as LngLat };
  });
}

export function walkableLines(ex: PilotExtract): PathLine[] {
  const lines: PathLine[] = [];
  for (const w of Array.from(ex.data.ways.values())) {
    if (!WALKABLE.has(w.tags.highway ?? '')) continue;
    const coords = w.nodes.map((n) => ex.data.nodes.get(n)).filter(Boolean).map((n) => [n!.lon, n!.lat] as LngLat);
    if (coords.length >= 2) lines.push({ id: `way/${w.id}`, coords, highway: w.tags.highway });
  }
  return lines;
}

/** Street/walkway vertices inside the boundary (thinned) — the neighbourhood seed candidates. */
export function seedCandidates(ex: PilotExtract, rings: LngLat[][]): LngLat[] {
  const seen = new Set<number>();
  const pts: LngLat[] = [];
  for (const w of Array.from(ex.data.ways.values())) {
    if (!SEED_HIGHWAYS.has(w.tags.highway ?? '')) continue;
    for (const id of w.nodes) {
      if (seen.has(id)) continue;
      seen.add(id);
      const n = ex.data.nodes.get(id);
      if (n) pts.push([n.lon, n.lat]);
    }
  }
  const stride = Math.max(1, Math.ceil(pts.length / (MAX_SEED_CANDIDATES * 3)));
  return pts.filter((_, i) => i % stride === 0).filter((p) => rings.some((r) => pointInRing(p, r))).slice(0, MAX_SEED_CANDIDATES);
}

const PLACE_KINDS = new Set(['neighbourhood', 'suburb', 'quarter']);

/** Every named highway way (for corridors) + the naming context (named-line index, parks, neighbourhoods). */
export function namedWaysAndNaming(ex: PilotExtract, parks: ParkPolygon[]): { namedWays: NamedWay[]; naming: NamingContext } {
  const namedWays: NamedWay[] = [];
  const lines: PathLine[] = [];
  const names = new Map<string, string>();
  for (const w of Array.from(ex.data.ways.values())) {
    const name = (w.tags['name:he'] ?? w.tags.name ?? '').trim();
    const highway = w.tags.highway ?? '';
    if (!name || !highway) continue;
    const coords = w.nodes.map((n) => ex.data.nodes.get(n)).filter(Boolean).map((n) => [n!.lon, n!.lat] as LngLat);
    if (coords.length < 2) continue;
    namedWays.push({ id: w.id, name, highway, coords });
    lines.push({ id: `way/${w.id}`, coords, highway });
    names.set(`way/${w.id}`, name);
  }
  const places: NamingContext['places'] = [];
  for (const n of Array.from(ex.data.nodes.values())) {
    const name = (n.tags?.['name:he'] ?? n.tags?.name ?? '').trim();
    if (name && PLACE_KINDS.has(n.tags?.place ?? '')) places.push({ name, coord: [n.lon, n.lat] });
  }
  return { namedWays, naming: { namedLines: buildPathIndex(lines), names, parks, places } };
}

export interface AuthorityOsm {
  name: string;
  rings: LngLat[][];
  osmSnapshot: string | null;
  parks: ParkPolygon[];
  parkStats: { considered: number; big: number; inside: number };
  paths: PathIndex;
  fitness: PointFeature[];
  seeds: LngLat[];
  namedWays: NamedWay[];
  naming: NamingContext;
  /** RC9: ways + lamps + amenities + crossings for the urban measurements. */
  urban: UrbanLayer;
}

/**
 * Lazy per-authority loader. Boundary: the authority doc's stored
 * boundaryGeoJSON (248 authorities), else the OSM admin relation.
 */
export class AuthorityOsmSlice {
  private loaded: Promise<AuthorityOsm | null> | null = null;
  constructor(
    private a: { id: string; name: string },
    private storedBoundary: Geometry | null,
    private relationId: number | null,
    private workRoot: string,
  ) {}

  get(): Promise<AuthorityOsm | null> {
    if (!this.loaded) this.loaded = this.load();
    return this.loaded;
  }

  private async load(): Promise<AuthorityOsm | null> {
    assertOsmium();
    const pbf = await ensureIsraelPbf();
    const work = this.workDir();
    fs.mkdirSync(work, { recursive: true });
    let geometry: Geometry | null = this.storedBoundary;
    if (!geometry && this.relationId) geometry = (await fetchAdminBoundary(pbf, this.relationId, work)).geometry as Geometry;
    if (!geometry) return null;
    const rings = outerRings(geometry);
    if (!rings.length) return null;
    const all = rings.flat();
    const m = 0.005; // ≈500 m: park polygons / paths straddling the line keep their ends
    const bbox = { minLng: Math.min(...all.map((p) => p[0])) - m, minLat: Math.min(...all.map((p) => p[1])) - m, maxLng: Math.max(...all.map((p) => p[0])) + m, maxLat: Math.max(...all.map((p) => p[1])) + m };
    const ex = await extractPilot(pbf, bbox, work);
    const sel = selectBigParks(ex.areas as never);
    const parks = sel.parks.filter((p) => {
      const r = p.rings[0];
      const c: LngLat = [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length];
      return rings.some((br) => pointInRing(c, br));
    });
    const fitness = fitnessStations(path.join(work, 'pilot.osm.pbf'), work);
    return {
      name: this.a.name,
      rings,
      osmSnapshot: pbfTimestamp(pbf),
      parks,
      parkStats: { considered: sel.considered, big: sel.parks.length, inside: parks.length },
      paths: buildPathIndex(walkableLines(ex)),
      fitness,
      seeds: seedCandidates(ex, rings),
      ...namedWaysAndNaming(ex, parks),
      urban: buildUrbanLayer(urbanInputFromOsm(ex.data, fitness.map((f) => f.coord))),
    };
  }

  private workDir() {
    return path.join(this.workRoot, `a-${this.a.id}`, 'work');
  }

  /** Drop the osmium cuts (tens of MB per big city); call after the authority. */
  cleanup() {
    fs.rmSync(this.workDir(), { recursive: true, force: true });
  }
}
