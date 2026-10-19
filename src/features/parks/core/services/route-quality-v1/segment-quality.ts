/**
 * Calm-street quality of one street_segments doc (0..10) from its stored OSM
 * tags — what makes a street pleasant to run on: lit, sidewalk, low speed,
 * footway/residential/living_street. The importer's own `score` mixes in
 * surface/smoothness; this one is about traffic and comfort only.
 */
export interface SegmentTags {
  highway?: string | null;
  lit?: string | null;
  sidewalk?: string | null;
  maxspeed?: string | null;
}

/** Waypoints are never placed on these (the route would then run along them). */
const ARTERIAL = new Set(['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link']);

export function isArterialSegment(tags: SegmentTags | undefined | null): boolean {
  return !!tags?.highway && ARTERIAL.has(tags.highway);
}

export function segmentQuality(tags: SegmentTags | undefined | null): number {
  if (!tags) return 5;
  let s = 5;
  switch (tags.highway) {
    case 'footway': case 'pedestrian': case 'living_street': s += 2.5; break;
    case 'cycleway': case 'path': s += 1.5; break;
    case 'residential': s += 1.5; break;
    case 'tertiary': case 'tertiary_link': s -= 2; break;
    default: if (tags.highway && ARTERIAL.has(tags.highway)) s -= 4;
  }
  if (tags.lit === 'yes') s += 1; else if (tags.lit === 'no') s -= 1;
  if (tags.sidewalk === 'yes' || tags.sidewalk === 'both' || tags.sidewalk === 'separate') s += 0.5;
  const speed = tags.maxspeed ? parseInt(tags.maxspeed, 10) : NaN;
  if (!Number.isNaN(speed)) { if (speed <= 30) s += 1; else if (speed > 50) s -= 1.5; }
  return Math.max(0, Math.min(10, s));
}
