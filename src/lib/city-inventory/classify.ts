/**
 * city-inventory/classify.ts — one OSM feature ⇒ the inventory layers it
 * belongs to. Pure; the single tag table for every layer
 * (docs/routes/CITY-MAPPING-PLAN.md §2.3, §4.1 step 4).
 *
 * Layers are not all mutually exclusive: a promenade is also a paved trail,
 * and a big park is also a park. Bike vs. trail IS exclusive (a designated
 * bike path is counted once, as bike).
 *
 * `lighting` and `shade` are coverage layers over walkable ways, not
 * feature layers — see `isWalkableWay` + coverage.ts.
 */
import { OFFROAD_HIGHWAYS, litFromTags, resolveSurface } from '@/lib/trail-graph/tags';
import type { SurfaceType } from '@/lib/route-collections/surface-type';
import { isParkLikeArea, parkSizeClass, type ParkMetrics } from './park-size';
import type { InventoryLayerKey, OsmTags } from './types';

export type FeatureKind = 'node' | 'way' | 'area';

export interface ClassifyInput {
  kind: FeatureKind;
  tags: OsmTags;
  /** Inside a built-up area (affects surface defaults). Default true — cities. */
  inBuiltUp?: boolean;
  /** Area metrics, needed to tell big parks / lap loops from small parks. */
  park?: ParkMetrics;
}

export const MAJOR_ROAD_HIGHWAYS = new Set(['trunk', 'primary', 'secondary']);
/** Ways counted as trails (not streets). */
export const TRAIL_LAYER_HIGHWAYS = new Set(['footway', 'path', 'track', 'bridleway', 'pedestrian']);
/** Footways that are part of a street, not a trail. */
const STREET_FOOTWAYS = new Set(['sidewalk', 'crossing', 'traffic_island']);
/** Ways a person walks on — the denominator for lighting/shade coverage (plan §2.1). */
export const WALKABLE_HIGHWAYS = new Set([
  'footway',
  'path',
  'cycleway',
  'track',
  'pedestrian',
  'residential',
  'living_street',
  'tertiary',
  'secondary',
  'primary',
]);

const PAVED_SURFACES = new Set<SurfaceType>(['asphalt', 'concrete', 'paving_stones']);
const OFFROAD_SURFACES = new Set<SurfaceType>(['gravel', 'dirt', 'grass']);
const PRIVATE_ACCESS = new Set(['private', 'no']);
const TOILET_EXCLUDED_ACCESS = new Set(['private', 'no', 'customers']);
const BIKE_ON = new Set(['designated', 'yes']);
const PROMENADE_NAME_HE = 'טיילת';
const PROMENADE_NAME_EN = /promenade|boardwalk|tayelet/i;

export type SurfaceBucket = 'paved' | 'offroad';

/**
 * Paved vs. off-road for a way. `known` = the bucket came from a real OSM
 * surface/tracktype tag, not a highway default (feeds surface coverage).
 * Unknown surface falls back to the highway class: path/track/bridleway ⇒
 * off-road, everything else ⇒ paved.
 */
export function surfaceBucket(tags: OsmTags, inBuiltUp = true): { bucket: SurfaceBucket; known: boolean } {
  const r = resolveSurface(tags, inBuiltUp);
  const known = r.confidence !== 'highway_default';
  if (PAVED_SURFACES.has(r.surface)) return { bucket: 'paved', known };
  if (OFFROAD_SURFACES.has(r.surface)) return { bucket: 'offroad', known };
  return { bucket: OFFROAD_HIGHWAYS.has(tags.highway ?? '') ? 'offroad' : 'paved', known: false };
}

function names(tags: OsmTags): string[] {
  return [tags.name, tags['name:he'], tags['name:en']].filter((n): n is string => typeof n === 'string' && n.length > 0);
}

export function isPromenade(tags: OsmTags): boolean {
  if (tags.leisure === 'promenade') return true;
  return names(tags).some((n) => n.includes(PROMENADE_NAME_HE) || PROMENADE_NAME_EN.test(n));
}

function isUsableWay(tags: OsmTags): boolean {
  if (tags.area === 'yes') return false;
  if (tags.foot === 'no') return false;
  if (PRIVATE_ACCESS.has(tags.access ?? '')) return false;
  if (tags.construction || tags.highway === 'construction' || tags.highway === 'proposed') return false;
  return true;
}

function isBikeWay(tags: OsmTags): boolean {
  const hw = tags.highway ?? '';
  if (hw === 'cycleway') return true;
  return (hw === 'path' || hw === 'track' || hw === 'footway') && tags.bicycle === 'designated';
}

/** A way people walk on — lighting/shade coverage denominator. */
export function isWalkableWay(tags: OsmTags): boolean {
  return WALKABLE_HIGHWAYS.has(tags.highway ?? '') && isUsableWay(tags);
}

/** `lit=*` carries a real yes/no answer (untagged ≠ unlit — RC2 §6). */
export function hasLitTag(tags: OsmTags): boolean {
  return litFromTags(tags) !== 'unknown';
}

/** `highway=crossing` node with a specific crossing type (not just "a crossing"). */
export function hasCrossingDetail(tags: OsmTags): boolean {
  const c = tags.crossing;
  if (c && c !== 'yes' && c !== 'unknown') return true;
  return Boolean(tags['crossing:markings'] && tags['crossing:markings'] !== 'unknown');
}

function pointLayers(tags: OsmTags): InventoryLayerKey[] {
  const out: InventoryLayerKey[] = [];
  if (tags.amenity === 'bench' || tags.leisure === 'bench') out.push('benches');
  if (
    tags.amenity === 'drinking_water' ||
    ((tags.man_made === 'water_tap' || tags.amenity === 'water_point' || tags.amenity === 'fountain') && tags.drinking_water === 'yes')
  ) {
    out.push('drinking_water');
  }
  if (tags.amenity === 'toilets' && !TOILET_EXCLUDED_ACCESS.has(tags.access ?? '')) out.push('toilets');
  if (tags.leisure === 'fitness_station') out.push('fitness_stations');
  if (tags.leisure === 'pitch' && !PRIVATE_ACCESS.has(tags.access ?? '')) out.push('courts');
  return out;
}

function wayLayers(tags: OsmTags, inBuiltUp: boolean): InventoryLayerKey[] {
  const hw = tags.highway;
  if (!hw || !isUsableWay(tags)) return [];
  if (MAJOR_ROAD_HIGHWAYS.has(hw)) return ['major_roads'];
  if (isBikeWay(tags)) {
    return [surfaceBucket(tags, inBuiltUp).bucket === 'paved' ? 'bike_paved' : 'bike_offroad'];
  }
  if (!TRAIL_LAYER_HIGHWAYS.has(hw)) return [];
  if (hw === 'footway' && STREET_FOOTWAYS.has(tags.footway ?? '')) return [];
  const out: InventoryLayerKey[] = [surfaceBucket(tags, inBuiltUp).bucket === 'paved' ? 'trails_paved' : 'trails_offroad'];
  if (isPromenade(tags)) out.push('promenades');
  return out;
}

/** Every inventory layer this feature belongs to (empty = not inventoried). */
export function classifyFeature(input: ClassifyInput): InventoryLayerKey[] {
  const tags = input.tags ?? {};
  const inBuiltUp = input.inBuiltUp ?? true;
  const out = pointLayers(tags);

  if (input.kind === 'node') {
    if (tags.highway === 'crossing') out.push('crossings');
    return out;
  }

  if (input.kind === 'area') {
    if (isParkLikeArea(tags)) {
      out.push('parks');
      if (input.park) {
        const size = parkSizeClass(input.park);
        if (size === 'big_park') out.push('big_parks');
        else if (size === 'lap_loop') out.push('lap_loops');
      }
    }
    if (tags.highway === 'pedestrian' && isPromenade(tags)) out.push('promenades');
    return out;
  }

  out.push(...wayLayers(tags, inBuiltUp));
  return out;
}
