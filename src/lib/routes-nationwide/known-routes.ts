/**
 * Known routes from web research (RC8 step 6, owner 22.10.2026). Per city, a
 * JSON file (docs/routes/known-routes/<authorityId>.json) lists well-known
 * NAMED walking / running / bike routes found on municipal, tourism,
 * Wikipedia, KKL and INPA pages: name + source URL + a short description in
 * our own words. Only the NAME and the fact that the route exists come from
 * the web — never geometry, never copied text; Strava / Komoot / AllTrails /
 * Trailforks are not used.
 *
 * Each name is matched to geometry WE already have, in this order:
 *   1. an existing official_routes doc with that name → "already in the app";
 *   2. a named OSM route relation (pipeline B) with that name;
 *   3. named OSM ways with that name (any highway class — the source names
 *      the street/promenade itself), same-name pieces stitched, longest chain;
 *   4. a big park with that name → its perimeter walked on real paths
 *      (computed by the caller; passed in as park loops).
 * Unmatched names are reported for the owner. Pure; inputs are injected.
 */
import { haversineM } from '../park-loops/geometry';
import type { LngLat } from '../park-loops';
import { stitchSameName, type Corridor, type NamedWay } from './named-corridors';

export interface KnownRouteSource { url: string; title: string }

export interface KnownRoute {
  name: string;
  aliases: string[];
  kind: 'walk' | 'run' | 'bike' | 'mixed';
  lengthKm: number | null;
  inPark: string | null;
  description: string;
  sources: KnownRouteSource[];
  /** The source describes the route but gives it no formal name — match only, never shown as the name. */
  nameIsDescriptive?: boolean;
}

export interface KnownRoutesFile {
  authorityId: string;
  city: string;
  researchedAt: string;
  routes: KnownRoute[];
  notes?: string;
}

/** Sources whose terms forbid reuse — a file citing one is rejected outright. */
export const FORBIDDEN_SOURCE_HOSTS = ['strava.com', 'komoot.', 'alltrails.com', 'trailforks.com', 'wikiloc.com', 'connect.garmin.com', 'mapmyrun.com'];

export function parseKnownRoutesFile(raw: unknown): { file: KnownRoutesFile | null; errors: string[] } {
  const errors: string[] = [];
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o || typeof o.authorityId !== 'string' || !Array.isArray(o.routes)) return { file: null, errors: ['not a known-routes file'] };
  const routes: KnownRoute[] = [];
  for (const r of o.routes as Array<Record<string, unknown>>) {
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    const sources = (Array.isArray(r?.sources) ? r.sources : []).filter((s: any) => typeof s?.url === 'string' && /^https?:\/\//.test(s.url)).map((s: any) => ({ url: String(s.url), title: String(s.title ?? '') }));
    if (!name) { errors.push('route without a name'); continue; }
    if (!sources.length) { errors.push(`${name}: no source URL`); continue; }
    const bad = sources.find((s) => FORBIDDEN_SOURCE_HOSTS.some((h) => s.url.toLowerCase().includes(h)));
    if (bad) { errors.push(`${name}: forbidden source ${bad.url}`); continue; }
    const kind = r.kind === 'walk' || r.kind === 'run' || r.kind === 'bike' ? r.kind : 'mixed';
    routes.push({
      name,
      aliases: (Array.isArray(r.aliases) ? r.aliases : []).filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim()),
      kind,
      lengthKm: typeof r.lengthKm === 'number' && r.lengthKm > 0 ? r.lengthKm : null,
      inPark: typeof r.inPark === 'string' && r.inPark.trim() ? r.inPark.trim() : null,
      description: typeof r.description === 'string' ? r.description.trim().slice(0, 200) : '',
      sources,
      ...(r.nameIsDescriptive === true ? { nameIsDescriptive: true } : {}),
    });
  }
  return { file: { authorityId: o.authorityId, city: String(o.city ?? ''), researchedAt: String(o.researchedAt ?? ''), routes, ...(typeof o.notes === 'string' ? { notes: o.notes } : {}) }, errors };
}

/** Hebrew-tolerant name key: no quotes/geresh, hyphens/dashes/colons → space, no leading ה, collapsed spaces. */
export function nameKey(s: string): string {
  return s
    .replace(/["'״׳`]/g, '')
    .replace(/[-–—־:,.()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.startsWith('ה') ? w.slice(1) : w))
    .join(' ')
    .toLowerCase();
}

/** Names a known route answers to: name (unless descriptive) + aliases; the part before ":" too ("שביל הירקון: כיכר היל - נמל"). */
export function knownNames(k: KnownRoute): string[] {
  const out = new Set<string>();
  const add = (s: string) => { const n = nameKey(s); if (n.length >= 4) out.add(n); };
  if (!k.nameIsDescriptive) { add(k.name); if (k.name.includes(':')) add(k.name.split(':')[0]); }
  for (const a of k.aliases) add(a);
  return Array.from(out);
}

/** Exact key match, or one contains the other when the shorter one has ≥ 2 words (never a 1-word substring guess). */
export function namesMatch(candidate: string, names: string[]): boolean {
  const c = nameKey(candidate);
  if (!c) return false;
  return names.some((n) => n === c || (Math.min(n.split(' ').length, c.split(' ').length) >= 2 && (c.includes(n) || n.includes(c))));
}

export type KnownMatchKind = 'existing' | 'osm_relation' | 'osm_ways' | 'park_loop';

export interface KnownMatch {
  route: KnownRoute;
  kind: KnownMatchKind;
  /** existing / relation / park-loop candidate id, or the stitched ways. */
  candidateId: string | null;
  corridor: Corridor | null;
}

export interface KnownRouteReport {
  authorityId: string;
  city: string;
  matched: Array<{ name: string; how: KnownMatchKind; id: string | null; km: number | null; sources: string[] }>;
  unmatched: Array<{ name: string; reason: string; sources: string[] }>;
  fileErrors: string[];
}

export const KNOWN_WAYS_MIN_M = 300;
export const KNOWN_WAYS_JOIN_GAP_M = 40;

/** Longest stitched chain over every named way that answers to the known route's names. */
export function matchKnownWays(k: KnownRoute, ways: NamedWay[], inside: (p: LngLat) => boolean): Corridor | null {
  const names = knownNames(k);
  if (!names.length) return null;
  const hits = ways.filter((w) => namesMatch(w.name, names));
  if (!hits.length) return null;
  const merged = stitchSameName(hits.map((w) => ({ ...w, name: k.name })), KNOWN_WAYS_JOIN_GAP_M)
    .filter((c) => c.lengthM >= KNOWN_WAYS_MIN_M && inside(c.coords[Math.floor(c.coords.length / 2)]))
    .sort((a, b) => b.lengthM - a.lengthM);
  const best = merged[0];
  if (!best) return null;
  // Keep the real OSM name of the chain (its most frequent piece name) for the report / descriptive names.
  const counts = new Map<string, number>();
  for (const w of hits) if (best.wayIds.includes(w.id)) counts.set(w.name, (counts.get(w.name) ?? 0) + 1);
  const osmName = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? k.name;
  return { ...best, name: osmName };
}

export interface MatchInputs {
  existing: Array<{ id: string; name: string }>;
  relations: Array<{ id: string; name: string }>;
  parkLoops: Array<{ id: string; parkName: string }>;
  ways: NamedWay[];
  inside: (p: LngLat) => boolean;
}

export function matchKnownRoutes(file: KnownRoutesFile, inp: MatchInputs): { matches: KnownMatch[]; unmatched: KnownRoute[] } {
  const matches: KnownMatch[] = [];
  const unmatched: KnownRoute[] = [];
  for (const k of file.routes) {
    const names = knownNames(k);
    const parkNames = k.inPark ? [...names, nameKey(k.inPark)] : names;
    const ex = inp.existing.find((r) => namesMatch(r.name, names));
    if (ex) { matches.push({ route: k, kind: 'existing', candidateId: ex.id, corridor: null }); continue; }
    const rel = inp.relations.find((r) => namesMatch(r.name, names));
    if (rel) { matches.push({ route: k, kind: 'osm_relation', candidateId: rel.id, corridor: null }); continue; }
    const c = matchKnownWays(k, inp.ways, inp.inside);
    if (c) { matches.push({ route: k, kind: 'osm_ways', candidateId: null, corridor: c }); continue; }
    const park = inp.parkLoops.find((p) => namesMatch(p.parkName, parkNames) || parkNames.includes(nameKey(p.parkName)));
    if (park) { matches.push({ route: k, kind: 'park_loop', candidateId: park.id, corridor: null }); continue; }
    unmatched.push(k);
  }
  return { matches, unmatched };
}

export const KNOWN_ROUTES_PIPELINE = 'web-research-known-routes';
const PACE_RUN_M_PER_MIN = 160;

/** The citation block stored on every matched candidate (name + URLs + our short description). */
export function knownRouteCitation(k: KnownRoute, researchedAt: string, how: KnownMatchKind) {
  return { name: k.name, description: k.description, kind: k.kind, sources: k.sources, researchedAt, matchedBy: how, nameIsDescriptive: k.nameIsDescriptive === true };
}

/** New doc for a known route matched to stitched OSM ways. Named after the research name (or the OSM name when the research name is only descriptive). */
export function knownRouteWaysDoc(k: KnownRoute, c: Corridor, ctx: { authorityId: string; city: string; researchedAt: string; osmSnapshot: string | null; importBatchId: string }): { id: string; data: Record<string, unknown> } {
  const km = Math.round((c.lengthM / 1000) * 100) / 100;
  const activity = k.kind === 'bike' ? 'cycling' : k.kind === 'run' ? 'running' : 'walking';
  const closed = haversineM(c.coords[0], c.coords[c.coords.length - 1]) <= 50;
  return {
    id: `known_${ctx.authorityId.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 60)}_w${c.wayIds[0]}-${c.wayIds.length}`,
    data: {
      name: k.nameIsDescriptive ? c.name : k.name,
      description: k.description || `${k.name} — מסלול מוכר בעיר`,
      distance: km,
      duration: Math.max(1, Math.round(c.lengthM / PACE_RUN_M_PER_MIN)),
      score: Math.round(km * 10),
      rating: 0,
      calories: Math.round(km * 65),
      type: activity,
      activityType: activity,
      activityTypes: k.kind === 'bike' ? ['cycling'] : k.kind === 'mixed' ? ['walking', 'running', 'cycling'] : ['walking', 'running'],
      difficulty: 'easy',
      path: c.coords.map(([lng, lat]) => ({ lng, lat })),
      segments: [],
      features: { hasGym: false, hasBenches: false, scenic: true, terrain: 'asphalt', environment: 'urban', trafficLoad: 'none', surface: 'road' },
      routeShape: closed ? 'loop' : 'point_to_point',
      ...(closed ? {} : { shapeType: 'linear_corridor' }),
      authorityId: ctx.authorityId,
      city: ctx.city,
      status: 'pending',
      published: false,
      origin: 'web_research',
      knownRoute: knownRouteCitation(k, ctx.researchedAt, 'osm_ways'),
      source: { type: 'official_api', name: 'OSM named ways (matched to a known route)', externalId: c.wayIds.length === 1 ? `osm:way/${c.wayIds[0]}` : `osm:stitched/${c.wayIds.join('-')}`.slice(0, 400), externalLink: `https://www.openstreetmap.org/way/${c.wayIds[0]}`, sourceWayIds: c.wayIds },
      provenance: { pipeline: KNOWN_ROUTES_PIPELINE, osm: { license: 'ODbL-1.0', snapshot: ctx.osmSnapshot, extract: 'geofabrik:israel-and-palestine' }, research: k.sources.map((s) => s.url) },
      importBatchId: ctx.importBatchId,
    },
  };
}
