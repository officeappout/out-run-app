/**
 * trail-graph/tags.ts — OSM tag interpretation for trail segments. Pure.
 *
 * Honesty rules (owner-approved trails brief, 18.10.2026):
 *   - surface: OSM surface → tracktype → highway default, with a
 *     confidence label so the UI/admin can tell a fact from a default.
 *   - lit: only OSM `lit=*` or real street-lamp nodes make a way lit.
 *     Outside built-up areas the default is UNLIT (rural tracks in Israel
 *     are not lit). Inside built-up areas with no evidence → 'unknown'.
 *     Never guess "lit".
 */
import { mapOsmSurfaceToType, type SurfaceType } from '@/lib/route-collections/surface-type';
import type { LitSource, LitValue, SurfaceConfidence, Tags } from './types';

/** highway=* classes that make up the foot/bike trail graph. */
export const TRAIL_HIGHWAYS = new Set([
  'path',
  'track',
  'footway',
  'cycleway',
  'bridleway',
  'steps',
  'pedestrian',
  'living_street',
  'residential',
  // Not in the original brief's list — added after the pilot showed kibbutz
  // internal roads and field-access roads are mapped as highway=service
  // (2,389 ways in the pilot bbox): without them most יישובים had no
  // walkable link from the settlement to the tracks around it. Parking
  // aisles / driveways / drive-throughs stay excluded (see isTrailWay).
  'service',
]);

const SERVICE_EXCLUDED = new Set(['parking_aisle', 'driveway', 'drive-through', 'emergency_access']);

/** Classes counted as "trail" (not street) for composition/scenery. */
export const OFFROAD_HIGHWAYS = new Set(['path', 'track', 'bridleway']);

const NO = new Set(['no', 'private']);
const YES = new Set(['yes', 'designated', 'permissive', 'official']);

/**
 * Should this way be part of the graph? residential/living_street are
 * included only when foot isn't forbidden; access=private/no excludes
 * unless foot is explicitly allowed; foot=no always excludes.
 */
export function isTrailWay(tags: Tags): boolean {
  const hw = tags.highway;
  if (!hw || !TRAIL_HIGHWAYS.has(hw)) return false;
  if (tags.area === 'yes') return false;
  if (hw === 'service' && SERVICE_EXCLUDED.has(tags.service ?? '')) return false;
  if (tags.indoor === 'yes' || tags.indoor === 'corridor') return false;
  if (tags.foot === 'no') return false;
  if (NO.has(tags.access ?? '') && !YES.has(tags.foot ?? '')) return false;
  if (tags.construction || hw === 'construction') return false;
  if (tags.disused === 'yes' || tags.abandoned === 'yes') return false;
  return true;
}

export function footAllowed(tags: Tags): boolean {
  return tags.foot !== 'no';
}

export function bicycleAllowed(tags: Tags): boolean {
  if (tags.bicycle === 'no' || tags.bicycle === 'dismount') return false;
  if (tags.highway === 'steps') return false;
  if (tags.highway === 'footway' || tags.highway === 'pedestrian') return YES.has(tags.bicycle ?? '');
  return true;
}

export interface SurfaceResult {
  surface: SurfaceType;
  raw: string | null;
  confidence: SurfaceConfidence;
}

const TRACKTYPE_SURFACE: Record<string, SurfaceType> = {
  grade1: 'asphalt', // "solid — usually paved"
  grade2: 'gravel', // "solid but unpaved — gravel/compacted"
  grade3: 'dirt', // "mixed hard and soft"
  grade4: 'dirt',
  grade5: 'dirt',
};

export function resolveSurface(tags: Tags, inBuiltUp: boolean): SurfaceResult {
  const raw = tags.surface ?? null;
  if (raw) {
    const s = mapOsmSurfaceToType(raw);
    if (s !== 'unknown') return { surface: s, raw, confidence: 'osm_surface' };
    // surface=paved/unpaved/etc: real tag, but not specific — fall through
    // to tracktype, and keep the raw value for the admin to see.
  }
  const tt = tags.tracktype;
  if (tt && TRACKTYPE_SURFACE[tt]) return { surface: TRACKTYPE_SURFACE[tt], raw, confidence: 'osm_tracktype' };
  const hw = tags.highway ?? '';
  let surface: SurfaceType = 'unknown';
  if (raw === 'paved') surface = 'asphalt';
  else if (raw === 'unpaved') surface = 'dirt';
  else if (hw === 'residential' || hw === 'living_street') surface = 'asphalt';
  else if (hw === 'service') surface = inBuiltUp ? 'asphalt' : 'unknown';
  else if (hw === 'cycleway') surface = 'asphalt';
  else if (hw === 'footway' || hw === 'pedestrian') surface = inBuiltUp ? 'paving_stones' : 'unknown';
  else if (hw === 'steps') surface = 'unknown';
  else if (hw === 'track' || hw === 'path' || hw === 'bridleway') surface = inBuiltUp ? 'unknown' : 'dirt';
  return { surface, raw, confidence: 'highway_default' };
}

const LIT_YES = new Set(['yes', '24/7', 'automatic', 'sunset-sunrise', 'dusk-dawn', 'interval', 'limited']);

/** lit from OSM tags only (lamp evidence is applied by the caller). */
export function litFromTags(tags: Tags): LitValue {
  const v = tags.lit;
  if (!v) return 'unknown';
  if (v === 'no' || v === 'disused') return 'no';
  if (LIT_YES.has(v) || /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(v)) return 'yes';
  return 'unknown';
}

/**
 * Final lit decision. `lampCoverage` = share (0–1) of the segment's sample
 * points within LAMP_RADIUS_M of a highway=street_lamp node.
 */
export const LAMP_RADIUS_M = 30;
export const LAMP_COVERAGE_LIT = 0.6;

export function resolveLit(tags: Tags, lampCoverage: number, inBuiltUp: boolean): { lit: LitValue; source: LitSource } {
  const t = litFromTags(tags);
  if (t !== 'unknown') return { lit: t, source: 'osm_lit' };
  if (lampCoverage >= LAMP_COVERAGE_LIT) return { lit: 'yes', source: 'street_lamp' };
  if (!inBuiltUp) return { lit: 'no', source: 'default_unlit_outside_built_up' };
  return { lit: 'unknown', source: 'none' };
}

/** Normalised marked-trail colour from osmc:symbol ("red:white:red_bar") or colour=*. */
export function trailColour(tags: Tags): string | null {
  const sym = tags['osmc:symbol'];
  if (sym) {
    const parts = sym.split(':');
    // waycolor:background:foreground… — Israeli marks are "<c>:white:<c>_bar"
    const fg = parts[2]?.split('_')[0];
    const c = fg && fg !== 'white' ? fg : parts[0];
    if (c) return c.toLowerCase();
  }
  const col = tags.colour ?? tags.color;
  return col ? col.toLowerCase() : null;
}

export const COLOUR_HE: Record<string, string> = {
  red: 'אדום',
  blue: 'כחול',
  green: 'ירוק',
  black: 'שחור',
  orange: 'כתום',
  purple: 'סגול',
  yellow: 'צהוב',
  brown: 'חום',
};

export const SAC_RANK: Record<string, number> = {
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6,
};

export function mtbScaleNumber(v: string | null | undefined): number | null {
  if (!v) return null;
  const m = /^(\d)/.exec(v);
  return m ? Number(m[1]) : null;
}
