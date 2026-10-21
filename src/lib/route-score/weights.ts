/** Weights (sum 100) and thresholds for routeScore v1 — NATIONWIDE-PLAN.md §3.3. */
import type { ScoreComponentKey, SourceTier } from './types';

export const ROUTE_SCORE_VERSION = 'v1';

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
 * Owner-approved thresholds (21.10.2026) for the comfort signals that RC2 will
 * compute later. Nothing computes shade yet; these are the agreed bars.
 *   shaded — ≥40% tree-canopy cover along the route.
 *   lit    — a stretch within 20-30 m of a lamp post.
 */
export const SHADE_CANOPY_MIN_SHARE = 0.4;
export const LIT_LAMP_RADIUS_M = { min: 20, max: 30 } as const;
