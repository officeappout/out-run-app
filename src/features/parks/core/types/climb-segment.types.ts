/**
 * ClimbSegment — the `climb_segments` collection's first dedicated type.
 *
 * Before this (Stage 1A of the route-enrichment-pipeline plan), the
 * collection had no shared type at all — every writer (scripts/write-climb-segments-tlv.ts,
 * scripts/climb-segments-tlv.ts) built ad-hoc object literals independently.
 * This interface mirrors those writers' actual shape exactly (verified
 * against write-climb-segments-tlv.ts's doc-building code, not invented) —
 * it documents reality, it doesn't change it.
 *
 * Deliberately a separate type from `Route` — not a generic "enrichment
 * entity." Climbs are a different domain (elevation/terrain geometry, not a
 * traversable route or a point amenity). See route.types.ts's routeShape
 * comment and the route-enrichment-pipeline plan's Stage 4 note for why
 * amenities (a further planned domain) get their own type too, not this one.
 */

/** Terrain climbs are graded 'short-sharp'|'repeats'|'long-gentle' by grade%
 *  (see scripts/climb-segments-tlv.ts's classify()); structure ramps and
 *  stairs each have exactly one climbType matching their `type`. */
export type ClimbType = 'short-sharp' | 'repeats' | 'long-gentle' | 'structure-ramp' | 'stairs';

export interface ClimbSegmentGeometry {
  lat: number;
  lng: number;
}

export interface ClimbSegmentBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ClimbSegment {
  /** 'terrain' = DEM-derived elevation climb. 'structure' = OSM ramp/incline
   *  way. 'stairs' = OSM highway=steps (the canonical stairs model — see
   *  scripts/write-climb-segments-tlv.ts's header comment, Stage 0). */
  type: 'terrain' | 'structure' | 'stairs';
  climbType: ClimbType;
  center: { lat: number; lng: number };
  bbox: ClimbSegmentBBox;
  /** Ordered path geometry — {lng,lat} objects (Firestore forbids nested
   *  arrays), same convention as Route.path. */
  geometry: ClimbSegmentGeometry[];
  lengthM: number;
  /** Percent grade. null for stairs (grade isn't the relevant metric there). */
  avgGrade: number | null;
  maxGrade: number | null;
  /** 'up'|'down' for the common case; stairs can instead carry a raw OSM
   *  incline tag string when present. Not a clean enum — documents the
   *  writer's actual (slightly heterogeneous) output, not an idealization. */
  dir: 'up' | 'down' | string | null;
  /** Precision-7 geohash of `center`. */
  geohash: string;
  /** Reverse-geocoded street/POI name, or null if none resolved — never a
   *  raw "way/1234" OSM reference (write-climb-segments-tlv.ts filters those). */
  wayName: string | null;
  /** 'dem:terrain-rgb' for terrain climbs, or 'osm:<highway-or-tag-value>'
   *  for structure/stairs (e.g. 'osm:steps', 'osm:footway+ramp'). */
  source: string;
  /** Stairs only — number of steps if the OSM `step_count` tag was present. */
  stepCount?: number | null;
  /** Structure-ramp only — the raw OSM incline tag value, if present. */
  inclineTag?: string | null;

  /** Moderation state — mirrors official_routes' pending→published pattern.
   *  Preserved across re-imports (write-climb-segments-tlv.ts never resets
   *  an already-moderated doc back to pending). */
  status: 'pending' | 'published' | 'rejected';
  /** 'osm_import' for script-ingested docs; other origin values are used by
   *  the shared moderation/edit-request system for admin- or UGC-sourced
   *  entities — not enumerated here since this type only documents the OSM
   *  ingestion writer's actual output. */
  origin: string;

  city: string;
  importBatchId?: string;
  updatedAt?: unknown; // FieldValue.serverTimestamp() at write time

  /** Set by moderation.service.ts on reject. */
  reviewedBy?: string;
  reviewedAt?: unknown;
  rejectionReason?: string;

  // ── New in Stage 1A — required going forward, not yet backfilled on
  // existing docs (see hard rule 1 in the route-enrichment-pipeline plan;
  // enforcement lands in Stage 1B, backfill in Stage 2 Phase 2.4) ──
  /** City authority this climb belongs to. Not yet set on any existing doc —
   *  write-climb-segments-tlv.ts doesn't set it today. */
  authorityId?: string;
  /** Cross-reference to `official_routes`/`curated_routes` docs whose path
   *  this climb overlaps. Populated by Stage 3's spatial join
   *  (route-enrichment.service.ts's computeClimbRouteAssociations).
   *  Deliberately NOT street_segments — see streetSegmentIds below; this
   *  field held a mixed "official_routes/street_segments" doc comment
   *  before Stage 3's build (17.08.2026), corrected before any doc was ever
   *  written to it (zero writers existed at that point) — a route id and a
   *  street-segment id are different-typed references, and a reader
   *  expecting only real named routes here would otherwise silently also
   *  get generator-scoring segment ids. */
  routeIds?: string[];
  /** Cross-reference to `street_segments` docs whose path this climb
   *  overlaps — the street_segments half of routeIds' original mixed scope,
   *  split out for the same reason. Populated by the same Stage 3 spatial
   *  join, written together with routeIds by one recompute pass. */
  streetSegmentIds?: string[];
}
