/**
 * Generation review — the shared vocabulary. Pure (no Firebase, no React).
 *
 * Every session a generator SHOWS a user (home strength trio, Kelly-built workouts, hybrid
 * compositions, generated loop / A→B routes, planned runs) is summarized into a
 * GenerationLogDraft on the device, sent to POST /api/generation-review/log, and stored by the
 * server in generation_log/{id} (Admin SDK only; TTL expireAt, 60 days). The nightly review
 * runs the invariant rules (./invariants) over the day's logs and writes generation_reviews.
 *
 * Flag: system_config/feature_flags.enable_generation_review (default OFF). Off = nothing is
 * summarized, sent or written for regular users. Super admins are always captured.
 *
 * Privacy (by construction, see ./capture/privacy.ts): no names, no free text from the user
 * except an optional report note, no exact user coordinates — the area is a geohash-5 cell
 * (~5 km), and a route line is stored with its first and last 200 m cut off and rounded to
 * 4 decimals. Park (station) locations are public places and are kept.
 */

export const GENERATION_LOG = 'generation_log';
export const GENERATION_REVIEWS = 'generation_reviews';
export const GENERATION_REVIEW_STATS = 'generation_review_stats';
export const GENERATION_REVIEW_CONFIG_DOC = { collection: 'app_config', doc: 'generation_review' } as const;

export const GENERATION_LOG_RETENTION_DAYS = 60;
export const GENERATION_REVIEW_RETENTION_DAYS = 90;
/** Ledger uid / feature name for the optional LLM pass (AI usage ledgers). */
export const GENERATION_REVIEW_LLM_FEATURE = 'generation_review_llm';
export const GENERATION_REVIEW_LEDGER_UID = '_generation_review';

export const GENERATION_TYPES = [
  'home_strength',
  'kelly_workout',
  'hybrid_smart_walk',
  'hybrid_full_park',
  'hybrid_route_stops',
  'hybrid_free_aerobic',
  'route_loop',
  'route_ab',
  'planned_run',
] as const;
export type GenerationType = (typeof GENERATION_TYPES)[number];

export const GENERATION_TYPE_LABEL_HE: Record<GenerationType, string> = {
  home_strength: 'אימון כוח (בית)',
  kelly_workout: 'אימון של קלי',
  hybrid_smart_walk: 'הליכה + כוח',
  hybrid_full_park: 'אימון מלא בפארק',
  hybrid_route_stops: 'מסלול + עצירות',
  hybrid_free_aerobic: 'אירובי חופשי + תחנות',
  route_loop: 'מסלול מעגלי',
  route_ab: 'מסלול מנקודה לנקודה',
  planned_run: 'ריצה מתוכננת',
};

/** Hybrid generators: a session that must contain a strength stop. */
export const HYBRID_TYPES: ReadonlySet<GenerationType> = new Set([
  'hybrid_smart_walk',
  'hybrid_full_park',
  'hybrid_route_stops',
  'hybrid_free_aerobic',
]);

export type Activity = 'walk' | 'run' | 'cycle' | 'strength' | 'rest' | 'other';

export interface ExerciseSummary {
  id: string;
  /** Movement pattern / group as the exercise doc has it (normalized later by patternGroup). */
  pattern: string | null;
  sets: number | null;
  reps?: number | null;
  durationSec?: number | null;
  /** The exercise's level (program level scale), when known. */
  level?: number | null;
  /** Equipment the exercise needs (ids), [] / ['none'] = bodyweight. */
  equipment?: string[];
  /** false = no video / image for this exercise. */
  hasMedia?: boolean | null;
}

export interface LegSummary {
  activity: Activity;
  distanceM: number | null;
  minutes: number | null;
  /** Strength stop: which park it is at, and what it holds. */
  parkId?: string | null;
  exercises?: ExerciseSummary[];
}

export interface StationSummary {
  parkId: string;
  lat: number;
  lng: number;
  /** Shortest distance from the park to the FULL generated line (computed before trimming). */
  distanceToRouteM: number | null;
  /** Equipment ids the park has (null = unknown). */
  equipment?: string[] | null;
}

export interface RouteMetricsSummary {
  lengthM: number;
  spurCount: number;
  uTurnCount: number;
  retracedPct: number;
  selfIntersections: number;
  compactness: number;
  distanceErrorPct: number | null;
  /** Unmarked crossings of tertiary+ roads; null when the generator had no OSM layer. */
  unmarkedCrossings: number | null;
  majorRoadPct: number | null;
}

export interface RouteSummary {
  /** Google encoded polyline (precision 5) of the privacy-trimmed line. */
  polyline: string;
  loop: boolean;
  targetKm: number | null;
  source: 'mapbox_v1' | 'mapbox_legacy' | 'graphhopper' | 'official' | 'unknown';
  metrics: RouteMetricsSummary;
}

export interface BudgetSnapshot {
  dailySetsLeft?: number | null;
  weeklySetsLeft?: number | null;
  lightMode?: boolean;
}

export interface GenerationInput {
  requestedActivity?: Activity | null;
  targetMinutes?: number | null;
  targetKm?: number | null;
  /** Requested movement focus ('push' / 'pull' / 'legs' / 'core' / free id) — exempts STRENGTH_SINGLE_PATTERN. */
  focus?: string | null;
  location?: 'home' | 'park' | 'street' | 'office' | 'gym' | null;
  /** Equipment the user said they have at that location (null = unknown). */
  equipment?: string[] | null;
  /** Levels per domain / pattern group (e.g. { push: 5, pull: 4, legs: 6 } or { overall: 5 }). */
  levels?: Record<string, number>;
  personaIds?: string[];
  budget?: BudgetSnapshot;
  /** geohash-5 (~5 km cell) — never finer. */
  areaGeohash5?: string | null;
  /** Generation-relevant flags as the device saw them. */
  flags?: Record<string, boolean>;
}

export interface GenerationOutput {
  title?: string | null;
  /** The label the user sees for the plan kind (e.g. "ריצה + כוח"). */
  planLabel?: string | null;
  /** Primary aerobic activity of the plan as shown. */
  planActivity?: Activity | null;
  totalMinutes: number | null;
  /** Strength exercises that are not inside a leg (strength / Kelly / home workouts). */
  exercises: ExerciseSummary[];
  legs: LegSummary[];
  stations: StationSummary[];
  route: RouteSummary | null;
}

/** What the device sends (summarized; never the raw generator objects). */
export interface GenerationLogDraft {
  /** Client-generated id (also the Firestore doc id) — lets reports / outcomes find it. */
  id: string;
  type: GenerationType;
  /** Sub-generator, e.g. 'graphhopper', 'mapbox_v1', 'trio:0'. */
  generator?: string | null;
  input: GenerationInput;
  output: GenerationOutput;
  /** Stable hash of the output — dedupes re-renders of the same session. */
  fingerprint: string;
  appVersion?: string | null;
  platform?: 'ios' | 'android' | 'web' | null;
  shownAtMs: number;
}

export type OutcomeStatus = 'started' | 'completed' | 'abandoned';

export interface GenerationOutcome {
  status: OutcomeStatus;
  atMs: number;
  swappedExercises?: number;
  completedPct?: number | null;
}

export const REPORT_REASONS = [
  'route_misses_park',
  'no_strength',
  'unbalanced',
  'wrong_activity',
  'too_long_short',
  'too_easy_hard',
  'missing_equipment',
  'bad_route',
  'repeated_exercise',
  'missing_video',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL_HE: Record<ReportReason, string> = {
  route_misses_park: 'המסלול לא עובר בפארק',
  no_strength: 'אין עצירת כוח',
  unbalanced: 'התרגילים לא מאוזנים',
  wrong_activity: 'סוג פעילות לא נכון',
  too_long_short: 'ארוך / קצר מדי',
  too_easy_hard: 'קל / קשה מדי',
  missing_equipment: 'אין את הציוד הנדרש',
  bad_route: 'מסלול לא טוב (חזרות, כבישים)',
  repeated_exercise: 'תרגיל חוזר',
  missing_video: 'חסר סרטון',
  other: 'אחר',
};

export interface GenerationReport {
  reasons: ReportReason[];
  note?: string | null;
  atMs: number;
}

export const REPORT_NOTE_MAX = 500;
