/**
 * OsmAmenity — the `osm_amenities` collection's first type. Stage 5's
 * "point-entity OSM layer" (route-enrichment-pipeline plan) — courts,
 * benches, drinking-water points, and fitness stations, sourced from
 * Overpass and moderated the same pending→published way climb_segments is.
 *
 * Explicitly point-geometry only, this build. Polygon amenities (lawns/
 * grass — Stage 4/5's own documented geometry fork) are scoped OUT of this
 * run per instruction — a genuinely different geometry shape (a ring, not
 * a point), deferred rather than half-modeled here.
 *
 * Deliberately a SEPARATE type from ClimbSegment — not a generic
 * "enrichment entity." Amenities are point geometry in a different domain
 * (workout/comfort infrastructure, not elevation/climb terrain) — see
 * climb-segment.types.ts's own header comment for why this split was
 * already decided back in Stage 1A, before this collection was ever built.
 *
 * Route-enrichment-pipeline plan, Stage 5 Phase C (POI point-entity
 * layer), autonomous build run 18.08.2026.
 */

/** The amenity categories this collection holds. Deliberately NOT
 *  extensible-by-string — a closed enum, same "no invented values" rule
 *  every other typed field in this plan follows. New categories are added
 *  as new enum members when built, never as free text.
 *
 *  'crossing' + 'dog_park' added 01.09.2026 (crosswalk/dog_park
 *  reproduction build) to legitimize ~2,206 crossing + ~18 dog_park docs
 *  already live in `osm_amenities` (Haifa-only, importBatchId
 *  `tlv-amenities-2026-08-19`) — written by a lost/uncommitted run that
 *  bypassed buildValidatedDoc, since neither category was a member of this
 *  type nor of the mirrored zod enum (schemas.ts) at write time. Pure
 *  schema widening, no migration: the live docs already carry these exact
 *  string values, so adding the members is what makes them valid, not a
 *  data change. */
export type AmenityCategory = 'court' | 'bench' | 'drinking_water' | 'fitness_station' | 'crossing' | 'dog_park';

/** Only meaningful when category === 'court' — which sport(s) the OSM
 *  `sport=*` tag indicates. 'multi' when OSM lists more than one sport on
 *  the same pitch (common); 'unknown' when the pitch has no sport tag at
 *  all (still a real, displayable court, just untyped by OSM). */
export type CourtSport = 'basketball' | 'football' | 'tennis' | 'padel' | 'multi' | 'unknown';

export interface OsmAmenity {
  category: AmenityCategory;
  sport?: CourtSport;
  location: { lat: number; lng: number };
  /** Precision-7 geohash of `location` — same precision convention as
   *  ClimbSegment.geohash. Written at ingestion time so this collection is
   *  itself geohash-queryable by a future consumer (e.g. "amenities near
   *  this route"), even though the garden-DEDUP gate this build's own
   *  ingestion path runs against `parks` doesn't need this field (parks
   *  is small enough to scan directly — see the ingestion script's own
   *  comment for why). */
  geohash: string;
  /** OSM's own stable id ('node/1234567' etc.) — the re-import dedup key
   *  (distinct from the garden-dedup gate below, which is about NOT
   *  duplicating an EXISTING CURATED PARK, not about not duplicating a
   *  prior OSM import of the same node). */
  osmId: string;
  name: string | null;

  /** Moderation state — mirrors climb_segments' pending→published→rejected
   *  pattern exactly. A garden-dedup-suppressed point is written as
   *  'rejected' (see suppressedDuplicateOfParkId below) — auditable in the
   *  Approval Center's rejected list, never silently dropped. */
  status: 'pending' | 'published' | 'rejected';
  origin: 'osm_import';

  authorityId: string;
  city: string;
  importBatchId?: string;
  updatedAt?: unknown; // FieldValue.serverTimestamp() at write time

  reviewedBy?: string;
  reviewedAt?: unknown;
  rejectionReason?: string;

  /** THE HARD GATE (Stage 5 Phase C): set only when this point matched an
   *  existing curated `parks` doc within garden-dedup.service.ts's
   *  GARDEN_DEDUP_RADIUS_METERS. When set, `status` is always 'rejected'
   *  and `rejectionReason` explains why — this is how "suppressed, not
   *  duplicated" stays auditable rather than a silent drop. null/absent
   *  for every genuinely new point. */
  suppressedDuplicateOfParkId?: string | null;
}
