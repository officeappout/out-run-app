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

// ── Shared primitives ────────────────────────────────────────────────────

export const DifficultySchema = z.enum(['easy', 'medium', 'hard']);
export const ActivityTypeSchema = z.enum(['running', 'walking', 'cycling', 'workout']);
export const RouteShapeSchema = z.enum(['loop', 'out_and_back']);

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
});

export const ClimbSegmentCreateSchema = ClimbSegmentFieldsSchema.passthrough();
export const ClimbSegmentUpdateSchema = ClimbSegmentFieldsSchema.partial().passthrough();

// ── street_segments (see StreetSegment in route-generator.service.ts) ───

const StreetSegmentFieldsSchema = z.object({
  score: z.number(),
  cityName: z.string().min(1).optional(), // legacy docs may lack this — see grandfather note in validate.ts
  authorityId: z.string().min(1),
  city: z.string().min(1),
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

/** cityName-keyed collections (no authorityId field) — route_adjacency only
 *  today. The chokepoint skips the authorityId requirement/lock for these. */
export const CITY_ONLY_COLLECTIONS = new Set<RouteCollectionName>(['route_adjacency']);

export const SCHEMA_REGISTRY: Record<RouteCollectionName, { create: z.ZodTypeAny; update: z.ZodTypeAny }> = {
  official_routes: { create: RouteCreateSchema, update: RouteUpdateSchema },
  curated_routes: { create: RouteCreateSchema, update: RouteUpdateSchema },
  climb_segments: { create: ClimbSegmentCreateSchema, update: ClimbSegmentUpdateSchema },
  street_segments: { create: StreetSegmentCreateSchema, update: StreetSegmentUpdateSchema },
  route_adjacency: { create: RouteAdjacencyCreateSchema, update: RouteAdjacencyUpdateSchema },
};
