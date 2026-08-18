/**
 * route-difficulty.service.ts — Stage 5 quick win (route-enrichment-pipeline
 * plan, 17.08.2026): a pure, deterministic 1-3 difficulty score from a
 * route's already-typed elevationGain/maxGrade/distance fields.
 *
 * SCOPE NOTE — this is deliberately narrow: it CONSUMES elevationGain/
 * maxGrade, it does not COMPUTE them. Populating those fields for real
 * (route-creation-time capture, the 27-route backfill, generator wiring)
 * is Stage 5's "needs prep" tier, gated on the DEM tile-cache work — not
 * part of this quick win. This function ships and is fully testable today
 * against whatever sparse data already exists (e.g. the 27 published TLV
 * routes already have elevationGain from demProfile(), though maxGrade is
 * universally unset on them today — confirmed live, 17.08.2026 — which is
 * exactly why maxGrade is nullable here, not assumed present).
 *
 * `maxGrade` itself is expected to eventually be a SMOOTHED steepest-
 * sustained value (~30-50m window, capped against DEM pixel noise) — not a
 * single-step delta. That smoothing is also part of the DEM tile-cache
 * work, not this function; this function only buckets whatever maxGrade
 * value it's given.
 */
import type { DifficultyLevel } from '@/lib/difficulty-display';

/** Ascent rate (m/km) bucket boundaries. Named, tunable constants — not
 *  magic numbers — same "surface for review" discipline as every other
 *  threshold in this plan. */
export const DIFFICULTY_RATE_THRESHOLDS_M_PER_KM = {
  /** <this = bucket 1 (easy climb rate) */
  bucket2: 10,
  /** >=bucket2 and <this = bucket 2; >=this = bucket 3 */
  bucket3: 25,
} as const;

/** Max-grade (%) bucket boundaries. */
export const DIFFICULTY_GRADE_THRESHOLDS_PERCENT = {
  bucket2: 5,
  bucket3: 10,
} as const;

export interface DifficultyInputs {
  elevationGain: number;
  /** null when unknown/never computed — NEVER guessed. A null maxGrade
   *  never escalates difficulty (see gradeBucket below) — an unknown grade
   *  is treated as "no additional signal," not as "assume steep." */
  maxGrade: number | null;
  distanceKm: number;
  /** elevationGain / distanceKm — derived, exposed so callers/future UI
   *  don't have to recompute it. */
  gainRate: number;
}

export interface DifficultyResult {
  level: DifficultyLevel;
  /**
   * Currently identical to `level` (max(gradeBucket, rateBucket)) — kept as
   * a SEPARATE field, not just `level` reused, specifically so future inputs
   * (strength/pace/exercise-difficulty composites, per the original request)
   * can turn this into a real continuous/weighted score without changing
   * what `level` means to every existing display consumer.
   */
  terrainScore: number;
  inputs: DifficultyInputs;
}

function rateBucket(gainRateMPerKm: number): DifficultyLevel {
  if (gainRateMPerKm >= DIFFICULTY_RATE_THRESHOLDS_M_PER_KM.bucket3) return 3;
  if (gainRateMPerKm >= DIFFICULTY_RATE_THRESHOLDS_M_PER_KM.bucket2) return 2;
  return 1;
}

function gradeBucket(maxGradePercent: number | null): DifficultyLevel {
  if (maxGradePercent == null) return 1;
  if (maxGradePercent >= DIFFICULTY_GRADE_THRESHOLDS_PERCENT.bucket3) return 3;
  if (maxGradePercent >= DIFFICULTY_GRADE_THRESHOLDS_PERCENT.bucket2) return 2;
  return 1;
}

/**
 * Pure: difficulty(elevationGain, maxGrade, distanceKm) -> {level, terrainScore, inputs}.
 * `distanceKm <= 0` degrades to gainRate=0 (bucket 1) rather than throwing or
 * producing Infinity/NaN — matches this codebase's existing defensive-guard
 * convention for malformed route data (e.g. route-ranking.service.ts's
 * `difficultyMultiplier[difficulty] ?? 1.0`).
 */
export function computeDifficulty(
  elevationGain: number,
  maxGrade: number | null,
  distanceKm: number,
): DifficultyResult {
  const gainRate = distanceKm > 0 ? elevationGain / distanceKm : 0;
  const rb = rateBucket(gainRate);
  const gb = gradeBucket(maxGrade);
  const level = Math.max(rb, gb) as DifficultyLevel;
  return {
    level,
    terrainScore: level,
    inputs: { elevationGain, maxGrade, distanceKm, gainRate },
  };
}

/**
 * Numeric 1-3 level -> Route.difficulty's own 'easy'|'medium'|'hard'
 * string enum (route.types.ts:305 — see axioms.md §23 / Stage 0's own
 * history on why this enum must never gain a 4th ad-hoc value like the
 * historical 'moderate' bug). Lives here, not difficulty-display.ts —
 * that module is deliberately domain-agnostic (shared with the workout
 * engine), while 'easy'/'medium'/'hard' is specifically Route's own typed
 * enum, a parks-domain concept.
 */
export function difficultyLevelToRouteDifficulty(level: DifficultyLevel): 'easy' | 'medium' | 'hard' {
  if (level >= 3) return 'hard';
  if (level === 2) return 'medium';
  return 'easy';
}
