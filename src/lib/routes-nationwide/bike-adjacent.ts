/**
 * Walking / running corridors along bike paths (RC9, owner 22.10.2026).
 * A bike path in an Israeli city usually has a walkway beside it. A bike
 * piece becomes walkable when:
 *   - the bike way itself admits walkers (OSM `foot=yes/designated`,
 *     `segregated=*` — a shared or split foot+bike path — or `highway=path`
 *     with bicycle and foot), or the MoT layer says the path sits between the
 *     carriageway and the walking strip / on a boulevard / outside the road,
 *     or that walkers are alongside (DIV_Walk); or
 *   - a footway / sidewalk / pedestrian way (or a road tagged with a sidewalk)
 *     runs within BIKE_FOOT_PARALLEL_M along ≥ BIKE_FOOT_MIN_SHARE of it.
 * Walkable pieces are stitched per source (MoT and OSM geometry are never
 * mixed in one route — one licence per route), kept from BIKE_ADJ_MIN_M,
 * loops preferred; a corridor that does not close becomes a clearly labelled
 * out-and-back. OSM corridors that repeat a MoT corridor are dropped (the
 * national layer is the primary input). Pure.
 */
import { stitchCorridors } from '../dataset-import/stitch';
import { overlapShare } from '../dataset-import/overlap';
import { stableHash } from '../dataset-import/to-route-doc';
import { treeShadeHint } from '../dataset-import/tree-hint';
import type { Corridor, DatasetLine, DatasetSpec } from '../dataset-import/types';
import { angleBetween, headingRad, makeProjector, pathLengthM, pointSegDist, resampleXY, type XY } from '../route-quality/geo';
import { SegmentGrid } from '../route-quality/grid';
import type { UrbanWay } from '../urban-measure/types';

type LngLat = [number, number];

export const BIKE_FOOT_PARALLEL_M = 15;
export const BIKE_FOOT_MIN_SHARE = 0.7;
export const BIKE_FOOT_MAX_ANGLE_DEG = 30;
export const BIKE_ADJ_MIN_M = 1500;
export const BIKE_ADJ_MAX_M = 25_000;
export const BIKE_ADJ_MAX_CORRIDORS = 20;
/** An OSM corridor repeating a MoT corridor this much (15 m buffer) is dropped. */
export const BIKE_ADJ_DUP_SHARE = 0.7;
/** Pieces join across a gap up to a carriageway wide (MoT sections stop at every road crossing). */
export const BIKE_ADJ_JOIN_M = 50;

/** MoT BPHPLACE values that put a walking strip beside the bike path (or the path off the carriageway). */
export const MOT_WALK_BESIDE_PLACES: ReadonlySet<string> = new Set(['בין המיסעה לרצועת ההליכה', 'בין רצועת ההליכה לדופן הדרך', 'שדרה/מדרחוב', 'מחוץ לזכות הדרך']);
/** MoT DIV_Walk values meaning walkers are right beside the bike path. */
export const MOT_WALK_BESIDE_DIV: ReadonlySet<string> = new Set(['צמוד להולכי רגל', 'הפרדה פיזית קלה', 'רצועת עזר']);

const YES = new Set(['yes', 'designated', 'permissive']);
const SIDEWALK = new Set(['both', 'left', 'right', 'yes', 'separate']);
const TRACK_KEYS = ['cycleway', 'cycleway:both', 'cycleway:left', 'cycleway:right'];

export interface BikePiece {
  id: string;
  name: string;
  coords: LngLat[];
  /** The piece itself admits walkers (no parallel check needed). */
  footOk: boolean;
  source: 'osm' | 'mot';
  /** Kept MoT attributes (Trees …) for the shade hint. */
  attrs?: Record<string, string>;
}

const wayName = (t: Record<string, string>) => (t['name:he'] ?? t.name ?? '').trim();
const hasSidewalk = (t: Record<string, string>) => SIDEWALK.has(t.sidewalk ?? '') || SIDEWALK.has(t['sidewalk:both'] ?? '') || t['sidewalk:left'] === 'yes' || t['sidewalk:right'] === 'yes';

/** OSM ways that are bike infrastructure, and whether walkers are allowed on/along them by their own tags. */
export function osmBikePieces(ways: readonly UrbanWay[]): BikePiece[] {
  const out: BikePiece[] = [];
  for (const w of ways) {
    const t = w.tags;
    let footOk: boolean | null = null;
    if (w.highway === 'cycleway') footOk = YES.has(t.foot ?? '') || t.segregated === 'yes' || t.segregated === 'no';
    else if (w.highway === 'path' && YES.has(t.bicycle ?? '') && t.foot !== 'no') footOk = true;
    else if (TRACK_KEYS.some((k) => t[k] === 'track')) footOk = hasSidewalk(t);
    if (footOk == null || w.coords.length < 2) continue;
    out.push({ id: `osm:${w.id}`, name: wayName(t), coords: w.coords, footOk, source: 'osm' });
  }
  return out;
}

/** MoT bph_infra_exist sections (already normalized; crossings excluded by the registry). */
export function motBikePieces(lines: readonly DatasetLine[]): BikePiece[] {
  return lines.filter((l) => l.coords.length >= 2).map((l) => ({
    id: `mot:${l.featureId}`,
    name: l.name,
    coords: l.coords,
    footOk: MOT_WALK_BESIDE_PLACES.has(l.attrs?.BPHPLACE ?? '') || MOT_WALK_BESIDE_DIV.has(l.attrs?.DIV_Walk ?? ''),
    source: 'mot' as const,
    ...(l.attrs ? { attrs: l.attrs } : {}),
  }));
}

/** Lines a walker uses beside a bike path: footways, sidewalks, pedestrian ways, foot paths, and roads tagged with a sidewalk. */
export function walkLines(ways: readonly UrbanWay[]): LngLat[][] {
  const out: LngLat[][] = [];
  for (const w of ways) {
    const t = w.tags;
    const walk = w.highway === 'footway' || w.highway === 'pedestrian' || w.highway === 'living_street'
      || (w.highway === 'path' && t.foot !== 'no') || (w.highway === 'cycleway' && YES.has(t.foot ?? ''))
      || hasSidewalk(t);
    if (walk && w.coords.length >= 2) out.push(w.coords);
  }
  return out;
}

export interface WalkIndex { proj: ReturnType<typeof makeProjector>; grid: SegmentGrid<null> }

export function buildWalkIndex(lines: readonly LngLat[][], origin?: LngLat): WalkIndex {
  const o = origin ?? lines.find((l) => l.length)?.[0] ?? ([35, 32] as LngLat);
  const proj = makeProjector(o);
  const grid = new SegmentGrid<null>(50);
  for (const l of lines) {
    const xy = l.map(proj.toXY);
    for (let i = 1; i < xy.length; i++) grid.add(xy[i - 1], xy[i], null);
  }
  return { proj, grid };
}

/** Share (0..1) of a piece with a walk line within BIKE_FOOT_PARALLEL_M, running roughly parallel. */
export function parallelWalkShare(coords: readonly LngLat[], idx: WalkIndex, stepM = 10): number {
  if (coords.length < 2) return 0;
  const { pts } = resampleXY(coords.map(idx.proj.toXY), stepM);
  if (pts.length < 2) return 0;
  const maxA = (BIKE_FOOT_MAX_ANGLE_DEG * Math.PI) / 180;
  let hit = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const h = headingRad(pts[i], pts[i + 1]);
    for (const s of idx.grid.near(pts[i], BIKE_FOOT_PARALLEL_M)) {
      if (pointSegDist(pts[i], s.a, s.b).d > BIKE_FOOT_PARALLEL_M) continue;
      const a = angleBetween(h, headingRad(s.a, s.b));
      if (a <= maxA || a >= Math.PI - maxA) { hit++; break; }
    }
  }
  return hit / (pts.length - 1);
}

/** Keep the walkable pieces: own tags/attributes, else a parallel walkway along ≥70%. */
export function walkablePieces(pieces: readonly BikePiece[], idx: WalkIndex): { kept: BikePiece[]; byOwnTags: number; byParallel: number; dropped: number } {
  const kept: BikePiece[] = [];
  let byOwnTags = 0, byParallel = 0, dropped = 0;
  for (const p of pieces) {
    if (p.footOk) { kept.push(p); byOwnTags++; continue; }
    // A walk line drawn on the piece itself (a shared cycleway) is not "beside" — but it is walkable all the same.
    if (parallelWalkShare(p.coords, idx) >= BIKE_FOOT_MIN_SHARE) { kept.push(p); byParallel++; }
    else dropped++;
  }
  return { kept, byOwnTags, byParallel, dropped };
}

const STITCH_SPEC: Pick<DatasetSpec, 'stitchBy'> = { stitchBy: 'network' };

/** Stitch one source's pieces into corridors (≥ BIKE_ADJ_MIN_M, ≤ BIKE_ADJ_MAX_M). */
export function stitchBikePieces(pieces: readonly BikePiece[]): Corridor[] {
  const lines: DatasetLine[] = pieces.map((p) => ({ featureId: p.id, name: p.name, status: null, coords: p.coords, ...(p.attrs ? { attrs: p.attrs } : {}) }));
  return stitchCorridors(lines, STITCH_SPEC as DatasetSpec, { toleranceM: BIKE_ADJ_JOIN_M, minLengthM: BIKE_ADJ_MIN_M }).corridors.filter((c) => c.lengthM <= BIKE_ADJ_MAX_M);
}

export interface BikeAdjacentCorridor extends Corridor {
  source: 'osm' | 'mot';
  shadeHint: number | null;
}

/**
 * MoT corridors first (primary input), then OSM corridors that do not repeat
 * one; longest first, at most BIKE_ADJ_MAX_CORRIDORS.
 */
export function bikeAdjacentCorridors(mot: readonly BikePiece[], osm: readonly BikePiece[], idx: WalkIndex): { corridors: BikeAdjacentCorridor[]; report: Record<string, number> } {
  const m = walkablePieces(mot, idx);
  const o = walkablePieces(osm, idx);
  const motById = new Map(m.kept.map((p) => [p.id, p]));
  const motC: BikeAdjacentCorridor[] = stitchBikePieces(m.kept).map((c) => ({
    ...c, source: 'mot' as const,
    shadeHint: treeShadeHint(c.featureIds.map((id) => motById.get(id)).filter((p): p is BikePiece => !!p).map((p) => ({ featureId: p.id, name: p.name, status: null, coords: p.coords, attrs: p.attrs }))),
  }));
  const osmC: BikeAdjacentCorridor[] = stitchBikePieces(o.kept)
    .filter((c) => !motC.some((k) => overlapShare(c.coords, k.coords) >= BIKE_ADJ_DUP_SHARE))
    .map((c) => ({ ...c, source: 'osm' as const, shadeHint: null }));
  const all = [...motC, ...osmC].sort((a, b) => b.lengthM - a.lengthM || a.name.localeCompare(b.name)).slice(0, BIKE_ADJ_MAX_CORRIDORS);
  return {
    corridors: all,
    report: {
      motPieces: mot.length, motWalkable: m.kept.length, motByParallel: m.byParallel,
      osmPieces: osm.length, osmWalkable: o.kept.length, osmByParallel: o.byParallel,
      motCorridors: motC.length, osmCorridors: osmC.length, kept: all.length,
    },
  };
}

const PACE_RUN_M_PER_MIN = 160;
export const OUT_AND_BACK_LABEL = 'הלוך-חזור';

export interface BikeAdjacentDocContext {
  authorityId: string;
  city: string;
  importBatchId: string;
  osmSnapshot: string | null;
  /** Corridor display base when it has no name of its own (street / park / place from the naming context). */
  fallbackBase: string;
  motAttribution?: { license: string; attribution: string; url: string } | null;
}

/** "לאורך <base>" (loop) or "לאורך <base> · הלוך-חזור" (a corridor that does not close). */
export function bikeAdjacentName(base: string, closed: boolean): string {
  return closed ? `לאורך ${base}` : `לאורך ${base} · ${OUT_AND_BACK_LABEL}`;
}

export function bikeAdjacentDoc(c: BikeAdjacentCorridor, ctx: BikeAdjacentDocContext): { id: string; data: Record<string, unknown> } {
  const own = c.name.trim();
  // A bare number is an OSM ref ("2461"), not a name a runner would recognise.
  const base = own && !/^[\d\s./-]+$/.test(own) ? own : ctx.fallbackBase;
  const path = c.closed ? c.coords : [...c.coords, ...c.coords.slice(0, -1).reverse()];
  const lengthM = pathLengthM(path);
  const km = Math.round((lengthM / 1000) * 100) / 100;
  const oneWayKm = (c.lengthM / 1000).toFixed(1);
  const ids = [...c.featureIds].sort().join('|');
  return {
    id: `bikewalk_${ctx.authorityId.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 60)}_${stableHash(ids)}`,
    data: {
      name: bikeAdjacentName(base, c.closed),
      description: c.closed
        ? `הליכה וריצה על השביל או המדרכה לצד שביל האופניים ${base} — לולאה של ${km.toFixed(1)} ק״מ`
        : `הליכה וריצה על השביל או המדרכה לצד שביל האופניים ${base} — ${oneWayKm} ק״מ לכל כיוון, הלוך וחזור באותו מסלול (${km.toFixed(1)} ק״מ)`,
      distance: km,
      duration: Math.max(1, Math.round(lengthM / PACE_RUN_M_PER_MIN)),
      score: Math.round(km * 10),
      rating: 0,
      calories: Math.round(km * 65),
      type: 'running',
      activityType: 'running',
      activityTypes: ['walking', 'running'],
      difficulty: 'easy',
      path: path.map(([lng, lat]) => ({ lng, lat })),
      segments: [],
      surfaceType: 'asphalt',
      features: { hasGym: false, hasBenches: false, scenic: false, terrain: 'asphalt', environment: 'urban', trafficLoad: 'low', surface: 'road' },
      routeShape: c.closed ? 'loop' : 'out_and_back',
      authorityId: ctx.authorityId,
      city: ctx.city,
      status: 'pending',
      published: false,
      origin: 'bike_adjacent_walk',
      source: {
        type: c.source === 'mot' ? 'mot_open_data' : 'official_api',
        name: c.source === 'mot' ? 'שבילי אופניים — תשתית רכיבה קיימת (משרד התחבורה)' : 'OSM bike paths',
        externalId: `bikewalk:${c.source}/${ids}`.slice(0, 400),
      },
      provenance: c.source === 'mot' && ctx.motAttribution
        ? { pipeline: 'bike-adjacent-walk', dataset: { key: 'bph_infra_exist', license: ctx.motAttribution.license, attribution: ctx.motAttribution.attribution, url: ctx.motAttribution.url, snapshot: null }, walkwayFrom: 'osm' }
        : { pipeline: 'bike-adjacent-walk', osm: { license: 'ODbL-1.0', snapshot: ctx.osmSnapshot, extract: 'geofabrik:israel-and-palestine' } },
      bikeAdjacent: { oneWayKm: Math.round((c.lengthM / 1000) * 100) / 100, outAndBack: !c.closed, pieces: c.featureIds.length, source: c.source },
      importBatchId: ctx.importBatchId,
    },
  };
}
