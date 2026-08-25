/**
 * user-context.types — the shared `UserContext` contract for the unified
 * workout-recommendation engine (docs/architecture/workout-recommendation-engine.md §4.1).
 * TYPES ONLY — no runtime code, no call sites yet. Step 1 of the build order (§11.1).
 *
 * This is deliberately NOT `WorkoutGenerationContext` (workout-generator.types.ts:340).
 * That type is a real, already-shared strength-GENERATION parameter bag (home + map both
 * construct it), but it has no situational/cross-surface fields (surface/venue/timeOfDay/
 * questionnaires/GPS location/etc). `UserContext` is the doc's cross-surface decision input;
 * a future generator adapter (§11.3) translates `UserContext` → `WorkoutGenerationContext`,
 * not the other way around. Do not merge the two types.
 *
 * Fields marked "PENDING <gate>" are typed now but must not be wired to a real data source
 * until that product-decision gate resolves (see plan §ד — happy-jumping-flask.md).
 */

/** Where the request for a Suggestion originated. Orthogonal to `venue` (physical place) and
 *  to the existing `ExecutionLocation` (`'park'|'home'|'gym'|...`, InputSanitizerMiddleware) —
 *  do not conflate "where the request came from" with "where the workout happens." */
export type UserContextSurface = 'map' | 'home' | 'park_page' | 'post_workout' | 'nudge';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// 'recovery' (17.8 build-plan, Stage 4 — rest-day-aware ranking, 25.08.2026): was
// 'active_recovery' — renamed to match the string every real generator already tags rest
// content with (safety-net.generator.ts/recovery-follow-up.generator.ts's own
// goalTags:['recovery',...]), confirmed as the only 2 producers/consumers of this exact
// literal in the whole codebase before this rename (grepped) — 'active_recovery' had zero
// real readers, so goalMatch()'s suggestion.goalTags.includes(context.todayGoal) could never
// actually match anything on a rest day. Not a new field, not new logic — just fixing a
// string mismatch that silently made an already-written mechanism inert.
export type TodayGoal = 'strength' | 'run' | 'core' | 'recovery' | null;

/** Physical place the user is currently in (PUSH-mode trigger input, §9.1). Not populated by
 *  any real source yet — needs the location/activity infra built in §11.7. */
export type VenueType = 'office' | 'home' | 'transit_stop' | 'park' | null;

/** GPS coordinate. NOT `WorkoutGenerationContext.location`, which is a coarse string enum
 *  (`'park'|'home'`) used for pool filtering, not situational ranking. */
export interface GeoLocation {
  lat: number;
  lng: number;
}

/**
 * PENDING Gate B (plan §ד): 3 non-identical existing candidates could feed this —
 * `getRemainingBudget()` (useWeeklyVolumeStore.ts:362, live weekly Zustand deficit),
 * `getWeeklyLoadSnapshot().gaps` (weekly-load.service.ts:101, already used by 2 of 3 map
 * generators), `computeDailyStrengthTarget` (dailyStrengthTarget.ts, dormant behind
 * STRENGTH_RING_ENABLED, explicitly NOT deficit-aware). Shape below is a placeholder that
 * a future `buildWeeklyPerformance()` helper (§11.5) fills once Gate B is answered — do not
 * wire a guessed source into it before then.
 */
export interface WeeklyPerformance {
  trainedDomainsThisWeek: string[];
  neglectedDomains: string[];
  totalSetsCompleted: number;
  weeklyBudget: number;
}

export interface RecoveryState {
  isDetrainingLocked: boolean;
  daysInactive: number;
  cyclePhase?: 'build' | 'peak' | 'deload' | 'rebuild' | null;
}

/** Real, live source: `useActivityStore().today.{steps,stepsGoal}` — see
 *  `core/context/build-step-context.ts` for the pure builder. Not a placeholder; the
 *  underlying infra already exists and is already self-adjusting per-day. */
export interface StepContext {
  stepGoal: number;
  stepsToday: number;
  stepsRemaining: number;
}

export interface UserContextPreferences {
  eveningWorkoutPreferred?: boolean;
  preferredDifficulty?: 1 | 2 | 3;
}

/** PENDING Gate H (Moovit integration timing) — no real-time transit source exists today. */
export interface TransitState {
  onVehicle: boolean;
  vehicleType?: 'bus' | 'train' | 'light_rail';
}

export interface WorkdayState {
  isWorkday: boolean;
  isLunchWindow: boolean;
}

/** PENDING §11.7 real infra (background activity detection) — no source exists today. */
export interface ActivitySignal {
  moving: boolean;
  kind?: 'walking' | 'standing' | 'in_vehicle';
}

export interface UserContext {
  userId: string;
  baseLevel: number;
  domainLevels: Record<string, number>;

  /** PENDING Gate B — see `WeeklyPerformance` doc-comment above. */
  weeklyPerformance: WeeklyPerformance;

  recoveryState: RecoveryState;
  todayGoal: TodayGoal;

  /**
   * NOT in the doc's §4.1 table — a real gap discovered while building the first generator
   * translator (§11.3, route.generator.ts): every existing generator (home-workout's
   * `availableTime`, hybrid's `timeBudgetMin`) requires a session-duration input, and §4.1
   * has no field for it. Added here rather than left implicit/guessed per-generator.
   */
  availableTimeMin: number;

  stepGoal: number;
  stepsToday: number;
  stepsRemaining: number;

  preferences: UserContextPreferences;

  /** Which questionnaires are complete (e.g. `{ running: true }` unlocks the running
   *  generator's `eligible()` — doc §8.1 "lock-gating"). */
  questionnaires: Record<string, boolean>;

  /** GPS. Null when unavailable/not yet resolved. See `GeoLocation` doc-comment. */
  location: GeoLocation | null;

  timeOfDay: TimeOfDay;
  surface: UserContextSurface;
  venue: VenueType;

  /** PENDING Gate H. */
  transitState: TransitState | null;

  workdayState: WorkdayState | null;

  /** §4.1 marks this "עתידי רחוק" (far-future) in the source doc — intentionally untyped
   *  beyond `unknown` until a real building-data source is scoped. Do not guess a shape. */
  buildingContext?: unknown;

  /** PENDING §11.7 real infra. */
  activitySignal: ActivitySignal | null;

  /**
   * NOT in the doc's §4.1 table explicitly, but required for park/equipment eligibility —
   * added here rather than silently folded into `location`. PENDING Gate A: home populates
   * equipment via `normalizeEquipmentArray` (InputSanitizerMiddleware.ts:87); the map/hybrid
   * path derives it separately via `parkGymEquipmentToGearIds()` and currently never reaches
   * `WorkoutGenerationContext.availableEquipment` on that path (hardcoded `[]` today). Do not
   * wire either resolver into this field until Gate A picks one.
   */
  availableEquipment?: string[];
}
