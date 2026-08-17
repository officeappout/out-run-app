/**
 * Zod schemas for the 5 route/geo Firestore collections — the runtime half
 * of Stage 1B's enforcement chokepoint (see validate.ts). TypeScript alone
 * doesn't work here: the edit-page bug that started this plan was a
 * `difficulty: difficulty as any` cast used specifically to smuggle an
 * invalid value past `tsc`. A cast can't defeat a check that runs at the
 * moment of the actual Firestore write.
 *
 * Enums are copied VERBATIM from the TS unions in route.types.ts /
 * climb-segment.types.ts — not re-derived — so an invalid literal like
 * 'moderate' simply isn't a member, full stop.
 *
 * Every schema is `.passthrough()`: this is a FLOOR (known fields are
 * type-checked), not a CAGE (unknown fields — the wide, evolving field set
 * on `Route` — pass through untouched). Do not switch to `.strict()`.
 */

import { z } from 'zod';
import { ALL_SURFACE_TYPES } from './surface-type';

// ── Shared primitives ────────────────────────────────────────────────────

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const ActivityTypeSchema = z.enum(['running', 'walking', 'cycling', 'workout']);
export const RouteShapeSchema = z.enum(['loop', 'out_and_back']);
/** Mirrors SurfaceType (surface-type.ts) verbatim — same "enum copied
 *  verbatim from the TS union" discipline as every other schema here. */
export const SurfaceTypeSchema = z.enum(ALL_SURFACE_TYPES as [string, ...string[]]);

const LatLngObjectSchema = z.object({ lat: z.number(), lng: z.number() });
const PathSchema = z.array(z.union([
  z.tuple([z.number(), z.number()]), // [lng, lat] in-memory Route.path form
  LatLngObjectSchema,                // {lng,lat} persisted Firestore form
]));

// ── official_routes / curated_routes (share the Route shape) ────────────

const RouteFieldsSchema = z.object({
  name: z.string().min(1),
  distance: z.number(),
  duration: z.number(),
  difficulty: DifficultySchema,
  type: ActivityTypeSchema,
  path: PathSchema.min(2),
  routeShape: RouteShapeSchema.optional(),
  /** Granular ground-material vocabulary, distinct from the existing
   *  coarse `features.surface` — see surface-type.ts's header comment. */
  surfaceType: SurfaceTypeSchema.optional(),
  /** Cross-refs to nearby climb_segments docs, written by Stage 3's spatial
   *  join (route-enrichment.service.ts). See Route.terrainFeatures's doc
   *  comment (route.types.ts) — mirrors RouteTerrainFeatureRef verbatim. */
  terrainFeatures: z.array(z.object({
    climbSegmentId: z.string().min(1),
    type: z.enum(['terrain', 'structure', 'stairs']),
    climbType: z.enum(['short-sharp', 'repeats', 'long-gentle', 'structure-ramp', 'stairs']),
    distanceFromPathMeters: z.number(),
  })).optional(),
  // Required on CREATE (hard rule 1) — see RouteCreateSchema/RouteUpdateSchema
  // below for how create vs. update enforce this differently.
  authorityId: z.string().min(1),
  city: z.string().min(1),
});

export const RouteCreateSchema = RouteFieldsSchema.passthrough();
/**
 * `.partial()` makes every field OPTIONAL-IF-ABSENT but still TYPE-CHECKED-
 * IF-PRESENT — exactly the semantics an update payload needs: a caller that
 * only touches `{difficulty, updatedAt}` isn't forced to also supply
 * authorityId/city (the grandfather clause for legacy authority-less docs
 * lives in validate.ts, not here), but a caller that DOES include
 * `difficulty` still can't sneak 'moderate' past this schema.
 */
export const RouteUpdateSchema = RouteFieldsSchema.partial().passthrough();

// ── climb_segments (see climb-segment.types.ts — ClimbSegment) ──────────

const ClimbSegmentFieldsSchema = z.object({
  type: z.enum(['terrain', 'structure', 'stairs']),
  climbType: z.enum(['short-sharp', 'repeats', 'long-gentle', 'structure-ramp', 'stairs']),
  center: LatLngObjectSchema,
  lengthM: z.number(),
  status: z.enum(['pending', 'published', 'rejected']),
  authorityId: z.string().min(1),
  city: z.string().min(1),
  /** Cross-refs written by Stage 3's spatial join — see
   *  ClimbSegment.routeIds/streetSegmentIds's doc comments
   *  (climb-segment.types.ts) for why these are two separate arrays, not one
   *  mixed list. */
  routeIds: z.array(z.string().min(1)).optional(),
  streetSegmentIds: z.array(z.string().min(1)).optional(),
});

export const ClimbSegmentCreateSchema = ClimbSegmentFieldsSchema.passthrough();
export const ClimbSegmentUpdateSchema = ClimbSegmentFieldsSchema.partial().passthrough();

// ── street_segments (see StreetSegment in route-generator.service.ts) ───

const StreetSegmentFieldsSchema = z.object({
  score: z.number(),
  // street_segments' city field is named `cityName`, NOT `city` — verified
  // against every real writer (osm-segment-importer.ts, ImportOptions,
  // route-generator.service.ts's StreetSegment read type). An earlier draft
  // of this schema incorrectly required a `city` field this collection has
  // never had, while leaving the REAL field optional — caught before it was
  // ever actually enforced (street_segments had no chokepoint-migrated
  // writer until the surface-type phase). See CITY_FIELD_BY_COLLECTION
  // below, which validate.ts uses instead of a hardcoded 'city' literal.
  authorityId: z.string().min(1),
  cityName: z.string().min(1),
  /** Granular ground-material vocabulary, parsed from the OSM `surface`
   *  tag — see surface-type.ts's header comment. */
  surfaceType: SurfaceTypeSchema.optional(),
  /** Cross-refs to nearby climb_segments doc ids, written by Stage 3's
   *  spatial join — see StreetSegment.nearbyClimbSegmentIds's doc comment
   *  (route-generator.service.ts). */
  nearbyClimbSegmentIds: z.array(z.string().min(1)).optional(),
});

export const StreetSegmentCreateSchema = StreetSegmentFieldsSchema.passthrough();
export const StreetSegmentUpdateSchema = StreetSegmentFieldsSchema.partial().passthrough();

// ── route_adjacency (edge/graph doc — cityName only, no authorityId) ────

const RouteAdjacencyFieldsSchema = z.object({
  routeIdA: z.string().min(1),
  routeIdB: z.string().min(1),
  cityName: z.string().min(1),
});

export const RouteAdjacencyCreateSchema = RouteAdjacencyFieldsSchema.passthrough();
export const RouteAdjacencyUpdateSchema = RouteAdjacencyFieldsSchema.partial().passthrough();

// ── Per-collection registry ──────────────────────────────────────────────
// Extensible: adding a 6th collection later (e.g. Stage 4's osm_amenities)
// means adding one entry here and one name to RouteCollectionName — nothing
// else in validate.ts needs to change.

export type RouteCollectionName =
  | 'official_routes'
  | 'curated_routes'
  | 'climb_segments'
  | 'street_segments'
  | 'route_adjacency';

/** cityName-keyed collections (no authorityId field at all) — route_adjacency
 *  only today. The chokepoint skips the authorityId requirement/lock
 *  entirely for these (there's nothing to check). */
export const CITY_ONLY_COLLECTIONS = new Set<RouteCollectionName>(['route_adjacency']);

/**
 * Which field actually holds the city string, per collection — NOT
 * uniform. official_routes/curated_routes/climb_segments use `city`;
 * street_segments/route_adjacency use `cityName`. validate.ts reads this
 * instead of hardcoding a literal field name, specifically because that
 * hardcoding already produced one real bug (street_segments' schema
 * originally required a nonexistent `city` field while leaving the real
 * `cityName` merely optional — fixed alongside this map, surface-type phase).
 */
export const CITY_FIELD_BY_COLLECTION: Record<RouteCollectionName, 'city' | 'cityName'> = {
  official_routes: 'city',
  curated_routes: 'city',
  climb_segments: 'city',
  street_segments: 'cityName',
  route_adjacency: 'cityName',
};

export const SCHEMA_REGISTRY: Record<RouteCollectionName, { create: z.ZodTypeAny; update: z.ZodTypeAny }> = {
  official_routes: { create: RouteCreateSchema, update: RouteUpdateSchema },
  curated_routes: { create: RouteCreateSchema, update: RouteUpdateSchema },
  climb_segments: { create: ClimbSegmentCreateSchema, update: ClimbSegmentUpdateSchema },
  street_segments: { create: StreetSegmentCreateSchema, update: StreetSegmentUpdateSchema },
  route_adjacency: { create: RouteAdjacencyCreateSchema, update: RouteAdjacencyUpdateSchema },
};
