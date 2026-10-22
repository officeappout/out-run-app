/** Weights (sum 100) and thresholds for routeScore v1 — NATIONWIDE-PLAN.md §3.3. */
import type { ScoreComponentKey, SourceTier } from './types';

/**
 * v1.1 (RC6, 21.10.2026): shade (Technion SI) joins comfort on the recalibrated 0.10→0.35 scale.
 * v1.2 (RC8, 22.10.2026): geometry judges turns/km + zigzag on loops (GEOMETRY_TURNS below).
 * v1.3 (RC9, 22.10.2026): urban candidates arrive MEASURED (composition, lighting, amenities,
 *   crossings — src/lib/urban-measure); comfort's "other" amenity point also counts toilets and
 *   fitness stations; a dataset tree hint stands in for shade (half coverage) where Technion is missing.
 */
export const ROUTE_SCORE_VERSION = 'v1.3';

export const SCORE_WEIGHTS: Record<ScoreComponentKey, number> = {
  surface: 25,
  geometry: 20,
  safety: 15,
  source: 15,
  comfort: 15,
  experience: 10,
};

/** Points for each source tier (§3.3: dataset/marked 15, OSM named relation 12, park/promenade 10, stitched 6, generated 3). */
export const SOURCE_TIER_POINTS: Record<SourceTier, number> = {
  official: 15,
  osm_named: 12,
  named_place: 10,
  stitched: 6,
  generated: 3,
  unknown: 6,
};

/** Bands (§3.3): green ≥75 + confidence ≥0.8 + certificate approve; red <40 or certificate drop. */
export const BAND_THRESHOLDS = {
  greenMinScore: 75,
  greenMinConfidence: 0.8,
  redMaxScore: 40,
} as const;

/** Selection floor (§3.7): only routeScore ≥ 70 can enter the city set. */
export const SELECTION_MIN_SCORE = 70;
/** Official-dataset routes scoring 55-70 are flagged for manual review, never auto-selected. */
export const MANUAL_REVIEW_MIN_SCORE = 55;

/** Names that read as a named promenade / park / nature place. Same family as measure-route-geometry's promenade regex. */
export const NAMED_PLACE_PATTERN = /טיילת|פארק|גן |^גן|גינת|רצועה ירוקה|רצועת חוף|שביל טבע|ואדי|נחל|יער|חוף|אגם|הקפת/;
/** Promenade/corridor names — a non-closed route with such a name is a legitimate linear corridor. */
export const CORRIDOR_NAME_PATTERN = /טיילת|רצועה ירוקה|רצועת חוף|שביל טבע|ואדי|נחל/;

/**
 * Shade comfort scale (owner recalibration 21.10.2026, RC6). The value is the
 * Technion daily summer Shade Index (SI, 0..1) averaged over the measured
 * length — NOT canopy cover, so the earlier 0.4 canopy bar no longer applies
 * (city SI means are 0.08–0.28). Linear: SI < 0.10 → 0 points, SI ≥ 0.35 →
 * full shade points.
 */
export const SHADE_SI_ZERO = 0.1;
export const SHADE_SI_FULL = 0.35;
/** Lit — a stretch within 20-30 m of a lamp post (owner-approved 21.10.2026). */
export const LIT_LAMP_RADIUS_M = { min: 20, max: 30 } as const;

/**
 * Turns / zigzag on loops (RC8). A loop that staircases through side streets
 * reads badly on the map and on foot (owner feedback 21.10.2026). Free
 * allowance first — a clean block loop or a park perimeter is never touched;
 * live GraphHopper `foot` loops run 4-12 turns/km, the Mapbox v1 ≈ 6.7,
 * a block staircase has zigzag ≈ 1.41. Marked trails (official / OSM named)
 * keep their own geometry and are not judged on this.
 */
export const GEOMETRY_TURNS = {
  freeTurnsPerKm: 8,
  pointsPerExtraTurnPerKm: 0.5,
  maxTurnsPenalty: 3,
  freeZigzag: 1.15,
  pointsPerZigzagTenth: 2,
  maxZigzagPenalty: 3,
} as const;
