/**
 * composeHybridSession — the hybrid (aerobic + strength) composition layer
 * (HYBRID_ENGINE_DESIGN.md §1-§3, build item 4).
 *
 * COMPOSITION-LAYER LAW (§1): this file COMPOSES existing mechanisms and
 * never re-implements them —
 *   • per-stop pools    → filterExercisesContextually (ContextualEngine)
 *   • strength content  → generateStrengthBlock (shared block engine, item 2)
 *   • pace targets      → DEFAULT_PACE_MAP_CONFIG zone tables (walk = fixed)
 *   • route geometry    → route-distance.utils (item 3)
 *   • weekly gaps       → WeeklyLoadSnapshot (weekly-load.service, item 1)
 * The only logic that LIVES here: budget split, stop selection/scoring,
 * leg/zone layout, calorie aggregation, and the §4b content dispatch.
 *
 * GENERIC STOP MODEL (§4b): stops are (location kind × activity kind);
 * content is dispatched per activityType. Today only 'strength' has a
 * generator — future kinds plug into dispatchStopContent without rewrites.
 *
 * ISOMORPHIC + STATELESS: pure TypeScript, no hooks, no Firebase, no
 * Date.now(). NOTE (code-review 08.07.2026): the composition logic itself is
 * deterministic, but the underlying generator randomises exercise count,
 * sets, reps and rest within tier ranges (Math.random in
 * workout-budgeting.utils) — so two calls with identical input return
 * structurally similar but NOT identical plans. Tests must assert on
 * invariants (segment structure, budgets, tolerances), not output equality.
 */

import type { Exercise } from '@/features/content/exercises';
import type { ContextualFilterContext } from '../logic/contextual-engine.types';
import { filterExercisesContextually } from '../logic/ContextualEngine';
import type { WorkoutGenerationContext } from '../logic/workout-generator.types';
import {
  generateStrengthBlock,
  FOCUS_TO_DOMAINS,
  type BlockDomainFocus,
  type StrengthBlockResult,
} from '../core/pipeline/strength-block.service';
import { MIN_STATION_EXERCISES } from './station-source';
import { outdoorVideoSafePool } from './station-outdoor-media';
import { appendCooldownExercises } from '../services/cooldown.service';
import { hasExplicitCoreLevel, DOMAIN_RESOLUTION_SKILL_PARENT_MAP } from '../logic/workout-selection.utils';
import { resolveToSlug, getIdToSlugMapSync } from '../services/program-hierarchy.utils';
import { prependWarmupExercises } from '../services/warmup.service';
import type { GeneratedWorkout } from '../logic/workout-generator.types';
import { TABATA_BLOCK_SECONDS } from '../logic/protocols/tabata.constants';
import {
  buildStationCoreTabataBlocks,
  chooseStationTabataBlockCount,
  REST_BETWEEN_STATION_TABATA_BLOCKS_SEC,
} from './station-core-tabata';
import { DEFAULT_PACE_MAP_CONFIG } from '../core/config/pace-map-config';
import { normalizeGearIds, satisfiesGearRequirement } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import {
  buildStationEquipmentTabataBlock,
  type StationEquipmentTabataInput,
} from './station-equipment-tabata';
import {
  resolveMachineAllocation,
  machineShareForLevel,
  isBlockAEligible,
  MIN_BLOCK_A_MACHINES,
  TABATA_DIFFICULTY_LADDER,
  type ParkWorkoutDifficulty,
} from '../services/compose-park-strength-workout.service';

/** Score bonus that lifts an equipment-satisfied exercise above any bodyweight
 *  movement in the same domain — a park station foregrounds its iron. */
const IRON_PREFERENCE_BONUS = 1000;

/** primaryMuscle → movement domain (mirror of workout-budgeting's private map). */
const MUSCLE_TO_DOMAIN: Record<string, string> = {
  chest: 'push', triceps: 'push', shoulders: 'push', deltoids: 'push',
  back: 'pull', biceps: 'pull', lats: 'pull', forearms: 'pull',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs', hip_flexors: 'legs',
  core: 'core', abs: 'core', obliques: 'core',
};
function domainOf(ex: Exercise): string {
  return MUSCLE_TO_DOMAIN[(ex.primaryMuscle ?? '').toLowerCase()] ?? 'other';
}
/** Domains a pull-up bar / dip station can supply iron for (spec: pull→מתח, push→דיפים). */
const IRON_DOMAINS = new Set(['pull', 'push']);

/** True when this exercise's SELECTED method is satisfied by the station's iron
 *  (pull→pullup_bar, push→dip_station, …). A gear-less bodyweight method → false.
 *  Uses the method's declared gear/equipment ids (dips carry these on gearIds, not a
 *  fixed_equipment type), gated to the station's actual gear via satisfiesGearRequirement. */
function methodUsesStationEquipment(method: ExecutionMethod | undefined, availableEquipment: string[]): boolean {
  if (!method || availableEquipment.length === 0) return false;
  const raw = [
    ...(method.equipmentIds ?? []), method.equipmentId,
    ...(method.gearIds ?? []), method.gearId,
  ].filter((x): x is string => !!x);
  if (raw.length === 0) return false; // no gear → bodyweight, never iron
  return normalizeGearIds(raw).some((req) => satisfiesGearRequirement(req, availableEquipment));
}

// ============================================================================
// DOMAIN-ASSESSMENT GATE (David, 23-24.09.2026) — see dispatchStopContent
// ============================================================================

/**
 * Real per-domain assessment presence — `userProgramLevels.has(domain)` is the
 * exact boolean David asked for (absent domain → not level-filtered, simply
 * never offered). Uses the CANONICAL MG_TO_DOMAIN (movementGroup → domain),
 * distinct from this file's own primaryMuscle-based domainOf() above (a
 * different concern — iron-preference scoring, not assessment). An exercise
 * whose movementGroup doesn't map to push/pull/legs/core (skills, stretches)
 * is never gated — the gate only applies to the 4 assessed strength domains.
 */
function isExerciseDomainAssessed(
  exercise: Exercise,
  userProgramLevels: Map<string, number> | undefined,
): boolean {
  const domain = MG_TO_DOMAIN[exercise.movementGroup ?? ''];
  if (!domain) return true;
  return userProgramLevels?.has(domain) ?? true;
}

/** buildForBolt's numeric difficulty knob (1|2|3, קל/בינוני/קשוח) → the park-machine
 *  engine's own ParkWorkoutDifficulty vocabulary — same bolt, different label set. */
const DIFFICULTY_NUM_TO_LABEL: Record<1 | 2 | 3, ParkWorkoutDifficulty> = {
  1: 'easy', 2: 'medium', 3: 'hard',
};

/**
 * Per-segment locked-station stub (David, 23-24.09.2026): a station whose
 * required domain(s) aren't assessed, and which has no equipment to fall back
 * on (station-equipment-tabata.ts), becomes a lock card instead of vanishing.
 * Text mirrors buildNeedsAssessmentResult's template EXACTLY
 * (home-workout.service.ts:361-363) — duplicated, not imported: that module
 * pulls in Firebase-touching siblings, which this file's LAW-0 purity
 * (no Firebase) must not inherit. The SHAPE (fallbackHint + assessmentDomains)
 * is what's reused — it's the exact shape HybridOverviewScreen/DiscoverLayer's
 * onAssessmentLink already render (session-level today, now also per-segment).
 */
function buildStationLockCard(missingDomains: string[]): { fallbackHint: string; assessmentDomains: string[] } {
  const domainList = missingDomains.filter(Boolean);
  const fallbackHint = domainList.length > 0
    ? `עדיין לא הערכנו את הרמה שלך ב-${domainList.join(', ')}. השלימו שאלון קצר כדי לקבל אימון מותאם אישית.`
    : 'עדיין לא הערכנו את הרמה שלך. השלימו שאלון קצר כדי לקבל אימון מותאם אישית.';
  return { fallbackHint, assessmentDomains: domainList };
}
import type { PaceZoneRule, RunZoneType, PaceProfile } from '../core/types/running.types';
import {
  buildRoutePrefixKm,
  totalRouteKm,
  indexAtKm,
  kmAtIndex,
  legGapsKm,
  type RoutePath,
} from '@/features/parks/core/services/route-distance.utils';

// ============================================================================
// TYPES (§2 + §4b)
// ============================================================================

export type HybridEmphasis = 'weekly_smart' | 'aerobic' | 'balanced' | 'strength';
export type ResolvedEmphasis = Exclude<HybridEmphasis, 'weekly_smart'>;
export type AerobicKind = 'walking' | 'running';

export type StopLocationKind =
  | 'gym' | 'bench' | 'stairs' | 'viewpoint' | 'spring'
  | 'scenic' | 'dog_park' | 'open_area';
export type StopActivityKind =
  | 'strength' | 'mobility' | 'stretch' | 'core' | 'yoga'
  | 'meditation' | 'rest_view';

/** A stop CANDIDATE on the route — location + capabilities, no content yet. */
export interface HybridStopCandidate {
  stopId: string;
  parkId?: string;
  locationKind: StopLocationKind;
  lat: number;
  lng: number;
  /** Vertex index on route.path (FacilityStop.waypointIndex). */
  waypointIndex: number;
  /** Normalized gear-ids available at this stop. [] = bodyweight only. */
  availableEquipment: string[];
  /** MVP: callers pass 'strength'. Future kinds flow through the dispatcher. */
  activityType?: StopActivityKind;
  /**
   * Domain-assessment gate (David, 23-24.09.2026, renamed/repurposed from the
   * 05.08.2026 hydraulic-only shortcut's `hydraulicEquipment` — same
   * find-and-attach mechanism, findHydraulicEquipment in start-hybrid-session.ts,
   * now a general per-stop attachment rather than a Gate-A-only one). Real
   * HYDRAULIC gym_equipment doc(s) matched at this stop's park — hydraulic-only
   * because station-equipment-tabata.ts's isBlockAEligible only ever accepts
   * non-functional machines (a pull-up bar can't be a self-limiting tabata
   * station), so a broader functional-equipment match would be inert here.
   * Populated in start-hybrid-session.ts for every EQUIPPED stop regardless of
   * assessment status — the per-domain gate, not this field's presence, decides
   * whether a station needs it. Undefined for bodyweight/core-only stops or
   * stops whose park matched no hydraulic doc. Read by dispatchStopContent's
   * 'strength'/'core' branches when the per-exercise domain gate empties the
   * pool, to try real machine-tabata content before falling back to a locked card.
   */
  parkEquipment?: GymEquipment[];
  /**
   * The park's equipment could NOT be read (point-fetch failed / park not found), so the `[]`
   * above means "unknown", not "this park has none". Composition is unchanged (still falls
   * through to bodyweight); only the station segment omits `availableEquipment`, so the guided
   * swap list stays unfiltered (PR-B3 follow-up). Absent = the list above is real.
   */
  equipmentUnknown?: boolean;
}

/** WHO-gap snapshot — produced by weekly-load.service (impure, caller side). */
export interface WeeklyGapsInput {
  aerobicGapMin: number;
  strengthGapDays: number;
  neglectedDomains: string[];
}

export interface HybridComposeInput {
  timeBudgetMin: number;
  emphasis: HybridEmphasis;
  aerobicKind: AerobicKind;
  paceProfile: Pick<PaceProfile, 'basePace' | 'profileType'>;
  routePath: RoutePath;
  stopCandidates: HybridStopCandidate[];
  /** User override for station count (autonomy). Clamped to [1, 4]. */
  stationOverride?: number;
  /**
   * Stop-selection strategy (route-stops §1). Default 'even_spacing' = the historical
   * behaviour — selectStops enforces the ±25% gate and degrades to one stop on no-fit.
   * 'as_provided' = ANCHOR mode: the caller placed these stops deliberately (a route
   * with POIs on it), so honour ALL of them in path order, bypassing the spacing gate
   * (which is about even AUTO-placement and must never drop a hand-placed POI).
   * Omitted / undefined → 'even_spacing', byte-identical for every existing caller.
   */
  stopSelection?: 'even_spacing' | 'as_provided';
  /**
   * Per-station domain strategy (route-stops Bug 2a). Default 'per_station' = the
   * historical behaviour — each station takes ONE cycling domain focus (push→pull→legs),
   * which is right for the multi-station budget-split card. 'multi' forces the MIXED
   * (undefined-focus) path for EVERY station so a single route stop becomes a real
   * full-body workout (iron where available, bodyweight for the rest) instead of a
   * single-domain slice. Omitted → 'per_station', byte-identical for every existing caller.
   */
  stationDomainMode?: 'per_station' | 'multi';
  /**
   * Push/pull level for the park machine-share ladder (compose-park-strength-workout's
   * MACHINE_SHARE_LADDER via resolveMachineAllocation) at 'as_provided' stations that have real
   * machines (HybridStopCandidate.parkEquipment). The caller passes resolveMachineShareLevel(profile);
   * omitted → derived from generationContext.userProgramLevels push/pull (then userLevel).
   */
  machineShareLevel?: number;
  /**
   * Domain-assessment gate (David, 23-24.09.2026): when true AND zero real
   * stop candidates exist at all (`stopCandidates` resolved to `[]` upstream
   * — route-stops' "no station at all" row), skip the §10 field-fallback
   * synthetic midpoint stop entirely instead of inventing one. Produces a
   * PURE aerobic plan (one full-route leg, `totals.stations: 0`) so the
   * caller can show "מלא שאלון כדי לקבל תחנות כוח" instead of a degraded/
   * locked station — per David's explicit correction: everyone always gets
   * the real walk, nobody is blocked pre-workout for an unfilled
   * questionnaire. Omitted/false → byte-identical existing behaviour for
   * every other caller (recommended/free-aerobic never pass this; assessed
   * route_stops users keep today's field-fallback synthesis unchanged).
   */
  skipFieldFallbackWhenNoCandidates?: boolean;
  /** Level-filtered master exercise pool (caller fetches; composer never does I/O). */
  masterExercises: Exercise[];
  /** Base ContextualEngine context — equipment is overridden PER STOP (§4b). */
  filterContext: ContextualFilterContext;
  /** Base generation context for strength blocks (levels/persona/injuries resolved upstream). */
  generationContext: WorkoutGenerationContext;
  weeklyGaps: WeeklyGapsInput;
  userWeightKg: number;
}

export interface HybridPlannedSegment {
  index: number;
  kind: 'aerobic' | 'strength';
  // aerobic
  aerobicType?: AerobicKind;
  zone?: RunZoneType;
  targetPaceSecPerKm?: { min: number; max: number };
  durationSec?: number;
  distanceKm?: number;
  fromKm?: number;
  toKm?: number;
  // strength (§4b generic stop)
  stopId?: string;
  parkId?: string;
  locationKind?: StopLocationKind;
  activityType?: StopActivityKind;
  domainFocus?: BlockDomainFocus;
  content?: StrengthBlockResult;
  estCalories: number;
  /**
   * PR-B3: the stop's normalized gear ids (HybridStopCandidate.availableEquipment), carried onto
   * the planned station so the live station can limit exercise swaps to what this park has.
   * Transferring an existing field — no new computation. Absent on legacy/home-only plans.
   */
  availableEquipment?: string[];
  /** Route-stops planner: the domains this station trains (its share of the session's split). */
  stationDomains?: string[];
  /**
   * Station-approach moment (David, 25.09.2026): the real GPS coordinates of
   * this stop, carried straight through from HybridStopCandidate.lat/lng
   * (already resolved at selection time, see selection.chosen below) —
   * transferring an existing field, not a new computation. Lets the runtime
   * measure REAL distance-to-station instead of cumulative route-km, which
   * accumulates GPS noise over a session and, per the deviation-mechanism
   * removal decision, keeps growing for a user who's off-route without them
   * actually approaching the station at all.
   */
  lat?: number;
  lng?: number;
}

export interface HybridPlan {
  segments: HybridPlannedSegment[];
  totals: {
    aerobicMin: number;
    strengthMin: number;
    distanceKm: number;
    estCalories: number;
    stations: number;
  };
  meta: {
    emphasisResolved: ResolvedEmphasis;
    /** SDT competence hook for the drawer; null when weekly targets are met. */
    whoGapNote: string | null;
    /** True when no route stop fit and the mid-route bodyweight fallback fired. */
    usedFieldFallback: boolean;
    /** route-stops Part B: true when the field fallback fired AND the field-ready pool
     *  within ±HOME_SUBSTITUTE_LEVEL_BAND of the user's level is thinner than
     *  MIN_STATION_EXERCISES — i.e. there isn't real difficulty-equivalent bodyweight
     *  content for this user here. The caller should show a message, not a thin session. */
    insufficientHomeContent: boolean;
    /** Domain-assessment gate (David, 23-24.09.2026): true when zero real stop
     *  candidates existed AND `skipFieldFallbackWhenNoCandidates` suppressed the
     *  synthetic-stop fallback that would otherwise have fired — this plan is a
     *  pure walk/run with `totals.stations: 0` by design, not a degraded station.
     *  The caller should show the "fill the questionnaire" nudge, not a lock card. */
    skippedFieldFallback: boolean;
    /** Route-stops planner: stops on the route that are walked past (no station content). */
    passThroughStopIds?: string[];
    log: string[];
  };
}

// ============================================================================
// CONSTANTS (design §2-§3, approved values)
// ============================================================================

/** aerobic share of the time budget per emphasis (design step 2). */
const EMPHASIS_AEROBIC_SHARE: Record<ResolvedEmphasis, number> = {
  aerobic: 0.7,
  balanced: 0.55,
  strength: 0.35,
};

const STATION_MIN = 1;
const STATION_MAX = 4;                 // decision 7 — flexible 1-4
const STATION_MINUTES = { min: 8, ideal: 10, max: 12 };
const STOP_FIT_TOLERANCE = 0.25;       // approved ±25%
/** route-stops Part B: how far (levels) a home/field substitute may sit from the user's level
 *  and still count as "difficulty-equivalent." Provisional — tune with real usage data. */
const HOME_SUBSTITUTE_LEVEL_BAND = 2;
/** Hybrid stations: decision 5 — halved rests, skill/isometric exempt. */
const STATION_REST = { multiplier: 0.5, exemptSkillAndIsometric: true } as const;

const AEROBIC_KCAL_FACTOR = 1.036;     // existing formula: km × kg × 1.036
/** Duty-cycle MET anchors (design step 8, ACSM calisthenics; rest = 1.5). */
const TIER_MET: Record<string, number> = { flow: 3.8, easy: 3.8, match: 5.0, hard: 8.0, elite: 8.0 };
const REST_MET = 1.5;
const SECONDS_PER_REP = 3;             // engine constant (workout-timing)

const DOMAIN_ORDER: BlockDomainFocus[] = ['push', 'pull', 'legs_core'];

// ============================================================================
// STEP 1 — emphasis resolution (weekly_smart)
// ============================================================================

export function resolveEmphasis(
  emphasis: HybridEmphasis,
  gaps: WeeklyGapsInput,
): { resolved: ResolvedEmphasis; whoGapNote: string | null } {
  const notes: string[] = [];
  if (gaps.aerobicGapMin > 0) notes.push(`חסרות לך ${gaps.aerobicGapMin} דק' אירובי`);
  if (gaps.strengthGapDays > 0) notes.push(`${gaps.strengthGapDays === 1 ? 'יום כוח אחד' : `${gaps.strengthGapDays} ימי כוח`}`);
  const whoGapNote = notes.length > 0 ? `${notes.join(' ו')} השבוע` : null;

  if (emphasis !== 'weekly_smart') return { resolved: emphasis, whoGapNote };

  let resolved: ResolvedEmphasis = 'balanced';
  if (gaps.strengthGapDays >= 1 && gaps.aerobicGapMin === 0) resolved = 'strength';
  else if (gaps.aerobicGapMin >= 60 && gaps.strengthGapDays === 0) resolved = 'aerobic';
  return { resolved, whoGapNote };
}

// ============================================================================
// PACE — zone table resolution (reuses DEFAULT_PACE_MAP_CONFIG)
// ============================================================================

function profileTable(profileType: PaceProfile['profileType']): Record<RunZoneType, PaceZoneRule> {
  switch (profileType) {
    case 1: return DEFAULT_PACE_MAP_CONFIG.profileFast;
    case 3: return DEFAULT_PACE_MAP_CONFIG.profileBeginner;
    case 4: return DEFAULT_PACE_MAP_CONFIG.profileMaintenance;
    case 2:
    default: return DEFAULT_PACE_MAP_CONFIG.profileSlow;
  }
}

function zonePaceSecPerKm(
  paceProfile: Pick<PaceProfile, 'basePace' | 'profileType'>,
  zone: RunZoneType,
): { min: number; max: number } {
  const rule = profileTable(paceProfile.profileType)[zone];
  if (rule.fixedMinSeconds != null && rule.fixedMaxSeconds != null) {
    return { min: rule.fixedMinSeconds, max: rule.fixedMaxSeconds };
  }
  return {
    min: Math.round(paceProfile.basePace * (rule.minPercent ?? 100) / 100),
    max: Math.round(paceProfile.basePace * (rule.maxPercent ?? 100) / 100),
  };
}

/** Zone per aerobic leg: first = warmup, last = wind-down, middle by emphasis. */
function legZone(
  legIdx: number,
  legsCount: number,
  kind: AerobicKind,
  emphasis: ResolvedEmphasis,
): RunZoneType {
  if (kind === 'walking') return 'walk'; // walk zone is fixed for all profiles
  if (legIdx === 0) return 'jogging';
  if (legIdx === legsCount - 1) return 'recovery';
  return emphasis === 'aerobic' ? 'tempo' : 'easy';
}

// ============================================================================
// STOP SELECTION — combinations scored vs leg targets (±25%)
// ============================================================================

interface ScoredSelection {
  chosen: Array<{ candidate: HybridStopCandidate; km: number }>;
  score: number;
}

function selectStops(
  candidates: Array<{ candidate: HybridStopCandidate; km: number }>,
  stations: number,
  legTargetKm: number,
  totalKm: number,
): ScoredSelection | null {
  if (candidates.length < stations) return null;
  let best: ScoredSelection | null = null;

  // Enumerate combinations (candidate counts are small: facilityStops ≤ ~10,
  // stations ≤ 4 → ≤ 210 combinations; pure + bounded).
  const combo: number[] = [];
  const recurse = (start: number) => {
    if (combo.length === stations) {
      const kms = combo.map((i) => candidates[i].km);
      const gaps = [kms[0], ...kms.slice(1).map((km, j) => km - kms[j]), totalKm - kms[kms.length - 1]];
      let score = 0;
      for (const gap of gaps) {
        const dev = Math.abs(gap - legTargetKm);
        if (dev > legTargetKm * STOP_FIT_TOLERANCE) return; // hard tolerance gate
        score += dev;
      }
      if (!best || score < best.score) {
        best = { chosen: combo.map((i) => candidates[i]), score };
      }
      return;
    }
    for (let i = start; i <= candidates.length - (stations - combo.length); i++) {
      combo.push(i);
      recurse(i + 1);
      combo.pop();
    }
  };
  recurse(0);
  return best;
}

/**
 * Top-up (Phase א.3, extracted 09.08.2026 — §10 adversarial-review fix): if an
 * equipment-filtered pool comes back thinner than MIN_STATION_EXERCISES, merge in
 * fieldReady bodyweight exercises so the station is never (near-)empty. Extracted from
 * dispatchStopContent's 'strength' branch so the route-stops field-fallback sufficiency
 * PRE-CHECK (below) can call the EXACT same enrichment instead of a hand-rolled subset —
 * before this fix, the pre-check stopped after the plain equipment filter and never
 * applied this step, so it could verdict "insufficient" for a stop dispatchStopContent
 * would have actually built successfully (a real, if safe-direction, divergence).
 */
function topUpWithBodyweightIfThin(
  scoredPool: (ReturnType<typeof filterExercisesContextually>['exercises'])[number][],
  masterExercises: Exercise[],
  filterContext: ContextualFilterContext,
): typeof scoredPool {
  if (scoredPool.length >= MIN_STATION_EXERCISES) return scoredPool;
  const bodyweight = filterExercisesContextually(masterExercises, {
    ...filterContext, availableEquipment: [], intentMode: 'field',
  });
  const seen = new Set(scoredPool.map((e) => e.exercise.id));
  const merged = [...scoredPool];
  for (const e of bodyweight.exercises) {
    if (!seen.has(e.exercise.id)) { merged.push(e); seen.add(e.exercise.id); }
  }
  return merged;
}

/**
 * Domain-assessment gate fallback (David, 23-24.09.2026): called when a
 * station's per-exercise domain gate emptied its bodyweight pool. Tries real
 * machine-tabata content first (station-equipment-tabata.ts — "the machine
 * determines the range of motion, no body assumption needed there"); only
 * falls to a locked card when the station has no equipment to fall back on,
 * or the equipment can't support even the 2-machine tabata floor.
 */
function buildDomainGateFallback(
  candidate: HybridStopCandidate,
  missingDomains: string[],
  blockMinutes: number,
  input: HybridComposeInput,
  log: string[],
): StrengthBlockResult {
  const machines = candidate.parkEquipment ?? [];
  if (machines.length > 0) {
    const difficulty = DIFFICULTY_NUM_TO_LABEL[(input.generationContext.difficulty ?? 2) as 1 | 2 | 3];
    const tabataInput: StationEquipmentTabataInput = { machines, difficulty, scheduledDomains: missingDomains };
    const result = buildStationEquipmentTabataBlock(tabataInput, blockMinutes);
    if (result.block) {
      const estimatedDurationSec = result.block.config.rounds * (result.block.config.workSec + result.block.config.restSec);
      log.push(
        `[${candidate.stopId}] domain-assessment gate: unassessed [${missingDomains.join(',')}] → ` +
        `equipment-tabata (${result.exercises.length} machine(s), covers [${result.coveredDomains.join(',')}])`,
      );
      return {
        exercises: result.exercises,
        estimatedDurationSec,
        // Bug fix (Sderot field test, 10.10.2026): this was hardcoded 0 —
        // real machine-tabata content IS generated and completed here (the
        // no-questionnaire combined-route path), but the summary's
        // totalStrengthSets (finalizeHybridRun → HybridSummary "סטים")
        // read it as if nothing happened. `rounds` is the real number of
        // completed work intervals across the selected machines (already
        // baked into result.block.config by buildStationEquipmentTabataBlock),
        // the closest existing field to "sets" for this content shape —
        // reuses the untouched sets pipeline end-to-end instead of adding a
        // new rounds-tracking field.
        totalPlannedSets: result.block.config.rounds,
        domainFocus: undefined,
        isEmpty: false,
        log: [],
        tabataBlocks: [result.block],
        assessmentNudge: {
          message: 'השלימו שאלון כדי לקבל גם תרגילי משקל גוף בתחנה הזו',
          assessmentDomains: missingDomains,
        },
      };
    }
    log.push(`[${candidate.stopId}] domain-assessment gate: equipment present but can't fit tabata floor (budget=${blockMinutes}min) → locked card`);
  }
  log.push(`[${candidate.stopId}] domain-assessment gate: unassessed [${missingDomains.join(',')}], no equipment → locked card`);
  return {
    exercises: [],
    estimatedDurationSec: 0,
    totalPlannedSets: 0,
    domainFocus: undefined,
    isEmpty: false,
    log: [],
    needsAssessment: buildStationLockCard(missingDomains),
  };
}

// ============================================================================
// ROUTE-STOPS STATION PLANNER (hybrid route-stops audit, 17.10.2026)
// ============================================================================
//
// 'as_provided' (route_stops) used to honour EVERY stop (up to 4), give each one an
// 8–12 min floor and generate each one independently in 'multi' (full-body) mode — so a
// 30-min request came out at 36–55 min, the same skill/pull work repeated at every stop,
// and the first stop could be a minute from the start with no warm-up. The planner below
// plans ONE session instead: one strength budget, a station count that fits it, one
// full-body domain split across the stations, and exercise/skill state threaded across
// stops. Stops that don't become stations are walked past (meta.passThroughStopIds).

/** A station must be at least this many minutes of walking from the start (warm-up walk). */
export const WARMUP_WALK_MIN = 3;
/** Station length bounds for the route planner (the 8-min STATION_MINUTES.min sizes the COUNT). */
const ROUTE_STATION_FLOOR_MIN = 5;
const ROUTE_STATION_MAX_MIN = 20;
/** Strength never takes more of the session than the existing split's strongest emphasis. */
const ROUTE_STRENGTH_SHARE_CAP = 1 - EMPHASIS_AEROBIC_SHARE.strength;
/** Minutes reserved for the short warm-up at a station reached before WARMUP_WALK_MIN. */
const STATION_WARMUP_RESERVE_MIN = 2;
/** A generated block may run this much over its station budget before it is trimmed. */
const STATION_BUDGET_TOLERANCE = 1.1;
/** Below this many minutes left after machines, a machine station stays machines-only. */
const MIN_BODYWEIGHT_REMAINDER_MIN = 3;

const ALL_STRENGTH_DOMAINS = ['push', 'pull', 'legs', 'core'] as const;

/** One full-body plan split over N strength stations (filtered to the user's target domains). */
const DOMAIN_GROUP_TEMPLATES: Record<number, string[][]> = {
  1: [['push', 'pull', 'legs', 'core']],
  2: [['pull', 'core'], ['push', 'legs']],
  3: [['pull', 'core'], ['push'], ['legs']],
  4: [['pull'], ['push'], ['legs'], ['core']],
};

/** Per-stop context the planner threads into dispatchStopContent. All optional — absent = legacy. */
export interface StationPlanContext {
  /** The domains this station trains (route planner split). */
  domains?: string[];
  /** Exercises already prescribed at an earlier station this session. */
  excludeExerciseIds?: ReadonlySet<string>;
  /** Skill exercises this station may not use (one skill family per session). */
  excludeSkillExercise?: (ex: Exercise) => boolean;
  /** Push/pull level for the park machine-share ladder; absent → no machines at this station. */
  machineShareLevel?: number;
  /** The station comes before a real warm-up walk → prepend a short warm-up. */
  needsWarmup?: boolean;
  /**
   * Route planner station kind (17.10.2026): 'machines' = the park's machines only (one
   * machine tabata), 'bodyweight' = no machines. Absent → the legacy in-station ladder split.
   */
  mode?: StationMode;
}

/** A route-stops strength station is EITHER machines OR bodyweight — never both mixed. */
export type StationMode = 'machines' | 'bodyweight';

/** Items that are never station sets: follow-along/reinforcement/recovery videos and test docs. */
const NON_STATION_ROLES = new Set(['reinforcement', 'recovery']);
const TEST_ITEM_NAME = /בדיקה|\btest\b/i;

export function isTestItem(ex: Exercise): boolean {
  const n = ex.name as unknown;
  const names = typeof n === 'string'
    ? [n]
    : [(n as { he?: string })?.he, (n as { en?: string })?.en].filter((x): x is string => typeof x === 'string');
  return names.some((x) => TEST_ITEM_NAME.test(x));
}

/** Station-wide content gate (every stop kind: strength, core, stretch). */
export function isStationEligibleExercise(ex: Exercise): boolean {
  if (NON_STATION_ROLES.has(ex.exerciseRole ?? '')) return false;
  if (ex.isFinisherVideo) return false;
  return !isTestItem(ex);
}

/**
 * Drop non-station items from the master pool AND the guarantee pass's global pool, and strip
 * outdoor methods that would play a home/office video (station-outdoor-media.ts) — an exercise
 * left with no outdoor method is excluded at stops.
 */
function withStationEligibleContent(input: HybridComposeInput): HybridComposeInput {
  const clean = (pool: Exercise[]) => outdoorVideoSafePool(pool.filter(isStationEligibleExercise));
  const same = (a: Exercise[], b: Exercise[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const master = clean(input.masterExercises);
  const globalPool = input.generationContext.globalExercisePool;
  const cleanGlobal = globalPool ? clean(globalPool) : undefined;
  if (same(master, input.masterExercises) && (!globalPool || same(cleanGlobal!, globalPool))) {
    return input;
  }
  return {
    ...input,
    masterExercises: master,
    generationContext: globalPool ? { ...input.generationContext, globalExercisePool: cleanGlobal } : input.generationContext,
  };
}

/** Strength domain of an exercise: canonical movementGroup map first, primaryMuscle second. */
function strengthDomainOf(ex: Exercise): string | undefined {
  const mgDomain = MG_TO_DOMAIN[ex.movementGroup ?? ''];
  // Skill movement groups map to their own slug (front_lever, planche…) → use the parent domain.
  const d = (mgDomain && DOMAIN_RESOLUTION_SKILL_PARENT_MAP[mgDomain]) ?? mgDomain
    ?? MUSCLE_TO_DOMAIN[(ex.primaryMuscle ?? '').toLowerCase()];
  return d && (ALL_STRENGTH_DOMAINS as readonly string[]).includes(d) ? d : undefined;
}

/** Skill families (skill-program slugs) an exercise belongs to. [] = not a skill exercise. */
export function skillFamiliesOf(ex: Exercise): string[] {
  const ids = [...(ex.targetPrograms ?? []).map((tp) => tp.programId), ...(ex.programIds ?? [])];
  const out = new Set<string>();
  const mgDomain = MG_TO_DOMAIN[ex.movementGroup ?? ''];
  if (mgDomain && DOMAIN_RESOLUTION_SKILL_PARENT_MAP[mgDomain] !== undefined) out.add(mgDomain);
  for (const id of ids) {
    if (DOMAIN_RESOLUTION_SKILL_PARENT_MAP[id] !== undefined) out.add(id);
    else {
      const slug = resolveToSlug(id);
      if (DOMAIN_RESOLUTION_SKILL_PARENT_MAP[slug] !== undefined) out.add(slug);
    }
  }
  if (out.size === 0 && (ex.tags ?? []).includes('skill' as never)) {
    out.add(ex.base_movement_id ?? ex.movementGroup ?? 'skill');
  }
  return Array.from(out);
}

/** How well a stop's equipment suits a domain group (bar → pull, dips/bench → push, open → legs). */
function groupAffinity(group: string[], equipment: string[]): number {
  const has = (ids: string[]) => ids.some((id) => equipment.includes(id));
  let score = 0;
  for (const d of group) {
    if (d === 'pull') score += has(['pullup_bar', 'high_bar', 'rings', 'low_bar']) ? 3 : 0;
    else if (d === 'push') score += has(['dip_station', 'parallel_bars', 'parallettes']) ? 2 : has(['bench']) ? 1 : 0;
    else if (d === 'legs') score += has(['step', 'bench']) || equipment.length === 0 ? 1 : 0;
    else if (d === 'core') score += has(['pullup_bar', 'high_bar']) ? 1 : 0.5;
  }
  return score;
}

function buildDomainGroups(stationCount: number, domains: string[]): string[][] {
  for (let n = Math.min(stationCount, 4); n >= 1; n--) {
    const groups = DOMAIN_GROUP_TEMPLATES[n].map((g) => g.filter((d) => domains.includes(d))).filter((g) => g.length > 0);
    if (groups.length === n) return groups;
  }
  return [domains.slice()];
}

/** Best group→station assignment by equipment affinity (≤4 stations → ≤24 permutations). */
function assignGroups(groups: string[][], stations: HybridStopCandidate[]): string[][] {
  let best: { order: number[]; score: number } | null = null;
  const permute = (rest: number[], acc: number[]) => {
    if (rest.length === 0) {
      const score = acc.reduce((s, g, i) => s + groupAffinity(groups[g], stations[i].availableEquipment), 0);
      if (!best || score > best.score) best = { order: acc.slice(), score };
      return;
    }
    for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
  };
  permute(groups.map((_, i) => i), []);
  return (best as { order: number[] } | null)?.order.map((g) => groups[g]) ?? groups;
}

export interface RouteStationPlan {
  chosen: Array<{ candidate: HybridStopCandidate; km: number; needsWarmup: boolean; domains?: string[]; mode?: StationMode }>;
  passThroughStopIds: string[];
  strengthBudgetMin: number;
  perStationMin: number;
  walkMinEstimate: number;
}

/**
 * PURE: plan the route-stops stations for ONE session.
 *   strengthBudget = requested − estimated walking time, bounded to [floor, share cap]
 *   stations       = min(eligible stops, STATION_MAX, ⌊strengthBudget / STATION_MINUTES.min⌋), ≥ 1
 * Eligible = stops at least WARMUP_WALK_MIN of walking from the start; when none is, the
 * farthest stop is used with a short warm-up. Stations are spread evenly along the route
 * (non-strength stops are preferred last), then one full-body domain split is assigned to the
 * strength stations by equipment affinity. Everything not chosen is a pass-through.
 */
export function planRouteStations(params: {
  candidatesByKm: Array<{ candidate: HybridStopCandidate; km: number }>;
  routeKm: number;
  walkSecPerKm: number;
  timeBudgetMin: number;
  targetDomains: string[];
  /**
   * Park machine-share ladder share for this user (machineShareForLevel). When set, strength
   * stations are dedicated: round(share × stations) of them (at most stations − 1 when there
   * are two or more, so bodyweight always has a station) become machine-only stations at the
   * parks with the most eligible machines; the rest are bodyweight-only and carry the
   * full-body split. Absent → no machine stations.
   */
  machineShare?: number;
  log: string[];
}): RouteStationPlan {
  const { candidatesByKm, routeKm, walkSecPerKm, timeBudgetMin, log } = params;
  const walkMinEstimate = (routeKm * walkSecPerKm) / 60;
  const cap = Math.max(ROUTE_STATION_FLOOR_MIN, timeBudgetMin * ROUTE_STRENGTH_SHARE_CAP);
  const strengthBudgetMin = Math.min(cap, Math.max(ROUTE_STATION_FLOOR_MIN, timeBudgetMin - walkMinEstimate));

  const warmupKm = (WARMUP_WALK_MIN * 60) / walkSecPerKm;
  let eligible = candidatesByKm.filter((c) => c.km >= warmupKm);
  let warmupFallback = false;
  if (eligible.length === 0 && candidatesByKm.length > 0) {
    eligible = [candidatesByKm[candidatesByKm.length - 1]];
    warmupFallback = true;
  }
  const skippedEarly = candidatesByKm.filter((c) => c.km < warmupKm).length;

  const byTime = Math.max(STATION_MIN, Math.floor(strengthBudgetMin / STATION_MINUTES.min));
  const count = Math.min(eligible.length, STATION_MAX, byTime);

  // Even spacing over the route (gaps vs routeKm/(n+1)); a non-strength stop (stretch/rest)
  // anywhere but last costs a full route length, so the cooldown-type stop lands at the end.
  let chosenIdx: number[] = [];
  if (count > 0) {
    const target = routeKm / (count + 1);
    let bestScore = Infinity;
    const combo: number[] = [];
    const recurse = (start: number) => {
      if (combo.length === count) {
        const kms = combo.map((i) => eligible[i].km);
        const gaps = [kms[0], ...kms.slice(1).map((km, j) => km - kms[j]), routeKm - kms[kms.length - 1]];
        let score = gaps.reduce((s, g) => s + Math.abs(g - target), 0);
        combo.forEach((i, j) => {
          const act = eligible[i].candidate.activityType ?? 'strength';
          if (act !== 'strength' && act !== 'core' && j !== combo.length - 1) score += routeKm;
        });
        if (score < bestScore) { bestScore = score; chosenIdx = combo.slice(); }
        return;
      }
      for (let i = start; i <= eligible.length - (count - combo.length); i++) {
        combo.push(i); recurse(i + 1); combo.pop();
      }
    };
    recurse(0);
  }
  let chosen = chosenIdx.map((i) => ({
    ...eligible[i], needsWarmup: warmupFallback, domains: undefined as string[] | undefined, mode: undefined as StationMode | undefined,
  }));

  // One full-body split over the strength stations. A core-activity stop (bench / weekly budget
  // spent) already trains core, so core leaves the strength groups when one is chosen.
  let domains = params.targetDomains.filter((d) => (ALL_STRENGTH_DOMAINS as readonly string[]).includes(d));
  if (domains.length === 0) domains = [...ALL_STRENGTH_DOMAINS];
  if (chosen.some((c) => c.candidate.activityType === 'core') && domains.length > 1) {
    domains = domains.filter((d) => d !== 'core');
  }
  const strengthChosen = chosen.filter((c) => (c.candidate.activityType ?? 'strength') === 'strength');
  // Machines OR bodyweight per station, never mixed (owner, 17.10.2026). The session's machine
  // share follows the ladder by station count: k = round(share × n) machine stations.
  let bodyweightChosen = strengthChosen;
  if (params.machineShare != null && strengthChosen.length > 0) {
    const n = strengthChosen.length;
    const eligibleMachines = (c: HybridStopCandidate) =>
      (c.parkEquipment ?? []).filter((m) => isBlockAEligible(m, domains)).length;
    let k = Math.round(params.machineShare * n);
    if (n >= 2) k = Math.min(k, n - 1);
    const capable = strengthChosen
      .filter((c) => eligibleMachines(c.candidate) >= MIN_BLOCK_A_MACHINES)
      .sort((a, b) => eligibleMachines(b.candidate) - eligibleMachines(a.candidate));
    const machineStations = new Set(capable.slice(0, k));
    machineStations.forEach((c) => { c.mode = 'machines'; c.domains = domains.slice(); });
    bodyweightChosen = strengthChosen.filter((c) => !machineStations.has(c));
    bodyweightChosen.forEach((c) => { c.mode = 'bodyweight'; });
    log.push(
      `route planner: machine share ${params.machineShare.toFixed(2)} × ${n} strength station(s) → ` +
      `${machineStations.size} machine station(s), ${bodyweightChosen.length} bodyweight` +
      (machineStations.size < k ? ` (only ${capable.length} park(s) with ≥${MIN_BLOCK_A_MACHINES} eligible machines)` : ''),
    );
  }
  if (bodyweightChosen.length > 0) {
    const groups = buildDomainGroups(bodyweightChosen.length, domains);
    // More strength stations than groups (a narrow target, e.g. upper-body only) → the extras
    // are walked past rather than repeating a domain.
    const kept = bodyweightChosen.slice(0, groups.length);
    const dropped = new Set(bodyweightChosen.slice(groups.length).map((c) => c.candidate.stopId));
    const assigned = assignGroups(groups, kept.map((c) => c.candidate));
    kept.forEach((c, i) => { c.domains = assigned[i]; });
    chosen = chosen.filter((c) => !dropped.has(c.candidate.stopId));
  }

  const perStationMin = chosen.length > 0
    ? Math.min(ROUTE_STATION_MAX_MIN, Math.max(ROUTE_STATION_FLOOR_MIN, strengthBudgetMin / chosen.length))
    : 0;
  const chosenIds = new Set(chosen.map((c) => c.candidate.stopId));
  const passThroughStopIds = candidatesByKm.map((c) => c.candidate.stopId).filter((id) => !chosenIds.has(id));

  log.push(
    `route planner: walk≈${walkMinEstimate.toFixed(1)}min, strength budget ${strengthBudgetMin.toFixed(1)}min ` +
    `→ ${chosen.length} station(s) × ${perStationMin.toFixed(1)}min` +
    (skippedEarly > 0 ? `, ${skippedEarly} stop(s) before the ${WARMUP_WALK_MIN}-min warm-up walk` : '') +
    (warmupFallback ? ' (no stop past the warm-up walk → station warm-up)' : '') +
    `; stations [${chosen.map((c) => `${c.candidate.stopId}@${c.km.toFixed(2)}km${c.mode === 'machines' ? ':machines' : c.domains ? `:${c.domains.join('+')}` : `:${c.candidate.activityType ?? 'strength'}`}`).join(', ')}]` +
    (passThroughStopIds.length ? `; pass-through ${passThroughStopIds.length}` : ''),
  );
  return { chosen, passThroughStopIds, strengthBudgetMin, perStationMin, walkMinEstimate };
}

/**
 * Trim a straight-sets block that overshoots its station budget, keeping it a real workout:
 * (1) take sets down toward 2 (most sets first), (2) drop trailing exercises while more than
 * two remain, (3) take sets down to 1, (4) drop trailing exercises (never the only one).
 * Uses the engine's own 3 s/rep work estimate + the prescribed rest (+15 s per dropped exercise).
 */
export function fitBlockToBudget(block: StrengthBlockResult, budgetSec: number, log: string[], tag: string): StrengthBlockResult {
  if (block.estimatedDurationSec <= budgetSec * STATION_BUDGET_TOLERANCE) return block;
  const exercises = block.exercises.map((ex) => ({ ...ex }));
  let est = block.estimatedDurationSec;
  const perSet = (ex: (typeof exercises)[number]) =>
    (ex.isTimeBased ? ex.reps : ex.reps * SECONDS_PER_REP) + (ex.restSeconds ?? 0);
  const dropSet = (minSets: number): boolean => {
    let idx = -1;
    for (let i = 0; i < exercises.length; i++) {
      if (exercises[i].sets > minSets && (idx < 0 || exercises[i].sets >= exercises[idx].sets)) idx = i;
    }
    if (idx < 0) return false;
    const ex = exercises[idx];
    est -= perSet(ex);
    ex.sets -= 1;
    if (Array.isArray(ex.repsSequence)) ex.repsSequence = ex.repsSequence.slice(0, ex.sets);
    return true;
  };
  // Drop the last exercise of a domain that still has another one, so trimming never costs the
  // station a domain while a duplicate-domain exercise is left; else the last exercise.
  const dropExercise = (minExercises: number): boolean => {
    if (exercises.length <= minExercises) return false;
    const domains = exercises.map((ex) => strengthDomainOf(ex.exercise) ?? ex.exercise.id);
    let idx = exercises.length - 1;
    for (let i = exercises.length - 1; i >= 0; i--) {
      if (domains.filter((d) => d === domains[i]).length > 1) { idx = i; break; }
    }
    const [dropped] = exercises.splice(idx, 1);
    est -= dropped.sets * perSet(dropped) + 15;
    return true;
  };
  const steps: Array<() => boolean> = [() => dropSet(2), () => dropExercise(2), () => dropSet(1), () => dropExercise(1)];
  for (const step of steps) {
    while (est > budgetSec && step()) { /* keep trimming at this step */ }
    if (est <= budgetSec) break;
  }
  const totalPlannedSets = exercises.reduce((acc, ex) => acc + ex.sets, 0);
  log.push(`${tag} trimmed to budget: ~${Math.round(block.estimatedDurationSec / 60)}→~${Math.round(Math.max(0, est) / 60)}min (${block.totalPlannedSets}→${totalPlannedSets} sets)`);
  return { ...block, exercises, estimatedDurationSec: Math.max(0, Math.round(est)), totalPlannedSets };
}

/** Rough duration of a warm-up list (same 3 s/rep model the stretch branch uses). */
function exercisesDurationSec(list: StrengthBlockResult['exercises']): number {
  return list.reduce((acc, ex) => acc + (ex.sets ?? 1) * ((ex.isTimeBased ? ex.reps : ex.reps * SECONDS_PER_REP) + (ex.restSeconds ?? 0)), 0);
}

/** Prepend a short warm-up to a station reached before the warm-up walk (route planner). */
function withStationWarmup(
  block: StrengthBlockResult,
  candidate: HybridStopCandidate,
  input: HybridComposeInput,
  station: StationPlanContext | undefined,
  log: string[],
): StrengthBlockResult {
  if (!station?.needsWarmup || block.exercises.length === 0) return block;
  const stub = { exercises: [...block.exercises] } as unknown as GeneratedWorkout;
  try {
    prependWarmupExercises(
      stub,
      input.masterExercises,
      input.generationContext.userProgramLevels ?? new Map(),
      'park',
      [],
      block.exercises,
      input.generationContext.difficulty,
      candidate.availableEquipment,
      STATION_WARMUP_SESSION_MIN,
      getIdToSlugMapSync() ?? undefined,
    );
  } catch (err) {
    log.push(`[${candidate.stopId}] station warm-up failed (${String(err)}) — station kept without it`);
    return block;
  }
  const warmup = stub.exercises.filter((ex) => ex.exerciseRole === 'warmup');
  if (warmup.length === 0) return block;
  const warmupSec = exercisesDurationSec(warmup);
  log.push(`[${candidate.stopId}] station warm-up: ${warmup.length} exercise(s) (~${Math.round(warmupSec / 60)}min) — reached before the ${WARMUP_WALK_MIN}-min warm-up walk`);
  return {
    ...block,
    exercises: [...warmup, ...block.exercises],
    estimatedDurationSec: block.estimatedDurationSec + warmupSec,
    stationWarmup: true,
  };
}

/** Session length handed to the warm-up ladder for a station warm-up → its minimum slots (~2 min). */
const STATION_WARMUP_SESSION_MIN = 10;

// ============================================================================
// CONTENT DISPATCH (§4b) — activityType → generator
// ============================================================================

export function dispatchStopContent(
  candidate: HybridStopCandidate,
  focus: BlockDomainFocus,
  blockMinutes: number,
  rawInput: HybridComposeInput,
  log: string[],
  /** Route-stops planner context (domains / cross-stop exclusions / machines / warm-up). */
  station?: StationPlanContext,
): StrengthBlockResult | null {
  // Station content gate (17.10.2026): follow-along/reinforcement/recovery videos and test
  // docs are never station content, for every stop kind.
  const input = withStationEligibleContent(rawInput);
  // NOTE (David, 23-24.09.2026): the old unconditional hydraulic-content shortcut
  // (resolveStationContent, station-content-resolver.ts) that used to sit here has
  // been REMOVED from this dispatch — superseded by the domain-assessment gate
  // below (station-equipment-tabata.ts gives real machine-TABATA content, which
  // makes more sense for equipment with no weight to set than straight sets/reps
  // did). station-content-resolver.ts itself is NOT deleted (confirmed via grep:
  // this was its only call site) — kept in case a future caller needs it.
  const activity = candidate.activityType ?? 'strength';
  switch (activity) {
    case 'strength': {
      // Per-stop pool (§4b): the ONLY per-stop delta is availableEquipment. A
      // BODYWEIGHT stop (no equipment) filters in FIELD mode (`intentMode:'field'`
      // → fieldReady/no-equipment only), or a park location would exclude every
      // bodyweight exercise and the station comes out empty (Q6 — never silent).
      const isBodyweight = candidate.availableEquipment.length === 0;
      // Domain-assessment gate (David, 23-24.09.2026) — checked BEFORE the pool is
      // even built: when EVERY domain this station could offer is unassessed, go
      // straight to equipment-tabata/lock-card. Building the pool first and
      // checking block.isEmpty afterwards is NOT enough — a domain-less "skill"
      // exercise (no push/pull/legs/core movementGroup, so isExerciseDomainAssessed
      // never gates it) can survive the per-exercise filter and produce a thin,
      // unrelated 1-2-exercise result instead of the intended machine-tabata
      // content (found via real execution, 24.09.2026 verification run — an
      // unassessed user at the real Sderot hydraulic station got 2 stray
      // skill exercises instead of machine tabata before this check existed).
      const effectiveDomainFocus = input.stationDomainMode === 'multi' ? undefined : (isBodyweight ? undefined : focus);
      const stationDomains = station?.domains && station.domains.length > 0 ? station.domains : undefined;
      const userProgramLevels = input.generationContext.userProgramLevels;
      const relevantDomains: readonly string[] = stationDomains
        ?? (effectiveDomainFocus ? FOCUS_TO_DOMAINS[effectiveDomainFocus] : (['push', 'pull', 'legs', 'core'] as const));
      const missingDomains = relevantDomains.filter((d) => !(userProgramLevels?.has(d) ?? true));
      if (missingDomains.length === relevantDomains.length) {
        return buildDomainGateFallback(candidate, missingDomains, blockMinutes, input, log);
      }
      const pool = filterExercisesContextually(input.masterExercises, {
        ...input.filterContext,
        availableEquipment: candidate.availableEquipment,
        ...(isBodyweight ? { intentMode: 'field' as const } : {}),
      });
      // Top-up (Phase א.3): count AFTER level/program filtering. If a real park
      // pool comes back thin, merge fieldReady bodyweight exercises so the station
      // is never empty. Extracted to topUpWithBodyweightIfThin (09.08.2026) so the
      // route-stops sufficiency pre-check below can call the EXACT same enrichment.
      let scoredPool = pool.exercises;
      if (!isBodyweight) {
        const before = scoredPool.length;
        scoredPool = topUpWithBodyweightIfThin(scoredPool, input.masterExercises, input.filterContext);
        if (scoredPool.length > before) {
          log.push(`[${candidate.stopId}] thin park pool (${before}) → topped up to ${scoredPool.length} w/ bodyweight`);
        }
      }
      // Domain-assessment gate, partial-assessment case (David, 23-24.09.2026): the
      // ALL-domains-unassessed case already short-circuited above — this is the
      // remaining "some but not all relevant domains assessed" case (e.g. a
      // 'multi' mixed station where only 'push' is assessed): the unassessed
      // domain(s) still get ZERO content, not level-filtered content — those
      // exercises simply never enter the pool. Applied BEFORE iron-preference
      // scoring, so an unassessed domain's "iron win" is moot either way.
      const beforeGate = scoredPool.length;
      scoredPool = scoredPool.filter((se) => isExerciseDomainAssessed(se.exercise, userProgramLevels));
      if (scoredPool.length < beforeGate) {
        log.push(`[${candidate.stopId}] domain-assessment gate: ${beforeGate - scoredPool.length}/${beforeGate} exercise(s) in an unassessed domain removed`);
      }

      // ── Machine-share ladder (route planner only, 17.10.2026) — the SAME time split the
      // park strength composer uses (resolveMachineAllocation / machineShareForLevel): low
      // levels spend most of the station on the park's real machines (tabata), L8+ none.
      let machinePart: StrengthBlockResult | null = null;
      let bodyweightMinutes = blockMinutes;
      const machines = candidate.parkEquipment ?? [];
      if (station?.mode === 'machines' && machines.length > 0) {
        // Dedicated machine station: the whole station is ONE machine tabata, no bodyweight.
        const difficulty = DIFFICULTY_NUM_TO_LABEL[(input.generationContext.difficulty ?? 2) as 1 | 2 | 3];
        const result = buildStationEquipmentTabataBlock({ machines, difficulty, scheduledDomains: stationDomains ?? [] }, blockMinutes);
        if (result.block) {
          const machineSec = result.block.config.rounds * (result.block.config.workSec + result.block.config.restSec);
          log.push(`[${candidate.stopId}] machine station: ${result.exercises.length} machine(s), ${Math.round(machineSec / 60)}min tabata`);
          return withStationWarmup({
            exercises: result.exercises, estimatedDurationSec: machineSec, totalPlannedSets: result.block.config.rounds,
            domainFocus: undefined, isEmpty: false, log: [], tabataBlocks: [result.block],
          }, candidate, input, station, log);
        }
        log.push(`[${candidate.stopId}] machine station: tabata doesn't fit (${blockMinutes.toFixed(1)}min) → bodyweight`);
      } else if (station?.mode == null && station?.machineShareLevel != null && machines.length > 0) {
        const difficulty = DIFFICULTY_NUM_TO_LABEL[(input.generationContext.difficulty ?? 2) as 1 | 2 | 3];
        const rung = TABATA_DIFFICULTY_LADDER[difficulty];
        const scheduled = stationDomains ?? [];
        const allocation = resolveMachineAllocation({
          level: station.machineShareLevel,
          eligibleMachineCount: machines.filter((m) => isBlockAEligible(m, scheduled)).length,
          strengthTimeBudget: blockMinutes,
          secPerRound: rung.workSec + rung.restSec,
        });
        if (allocation.machineCount > 0) {
          const result = buildStationEquipmentTabataBlock({ machines, difficulty, scheduledDomains: scheduled }, allocation.machineTimeMinutes);
          if (result.block) {
            const machineSec = result.block.config.rounds * (result.block.config.workSec + result.block.config.restSec);
            machinePart = {
              exercises: result.exercises, estimatedDurationSec: machineSec, totalPlannedSets: result.block.config.rounds,
              domainFocus: undefined, isEmpty: false, log: [], tabataBlocks: [result.block],
            };
            bodyweightMinutes = Math.max(0, blockMinutes - machineSec / 60);
            log.push(
              `[${candidate.stopId}] machine ladder: level ${station.machineShareLevel} → ${result.exercises.length} machine(s), ` +
              `${Math.round(machineSec / 60)}min tabata, ${bodyweightMinutes.toFixed(1)}min bodyweight`,
            );
          }
        } else {
          log.push(`[${candidate.stopId}] machine ladder: level ${station.machineShareLevel} → no machines (share/time/eligible)`);
        }
      }
      if (machinePart && bodyweightMinutes < MIN_BODYWEIGHT_REMAINDER_MIN) {
        return withStationWarmup(machinePart, candidate, input, station, log);
      }

      // Session-level threading (route planner): this station's domains only, nothing an earlier
      // station already prescribed, one skill family per session, no follow-along videos. Each
      // restriction is relaxed (in that order) only if the station would otherwise come out empty.
      const ironAndGenerate = (basePool: typeof scoredPool, domains: string[] | undefined): StrengthBlockResult => {
        let candidatePool = basePool;
        // PREFER IRON (per movement domain): at an equipped park, an exercise whose
        // method is real park iron (pull→מתח, push→דיפים) must win over a bodyweight
        // movement OF THE SAME DOMAIN. Two steps: (1) score-boost every iron exercise;
        // (2) drop a bodyweight exercise ONLY when its own domain has an iron alternative
        // (spec: "bodyweight only where no equipment supports the movement"). A domain
        // with no station iron (e.g. legs at a bar/dip park) keeps its bodyweight work.
        let ironCount = 0;
        const ironDomainList: string[] = [];
        if (candidate.availableEquipment.length > 0) {
          const tagged = candidatePool.map((se) => ({
            se,
            iron: methodUsesStationEquipment(se.method, candidate.availableEquipment),
            domain: domainOf(se.exercise),
          }));
          // A pull-up bar / dip station provides real iron ONLY for pull + push. Never
          // strip legs/core bodyweight over a spurious gear match (a bar can't squat).
          const ironDomains = new Set(
            tagged.filter((t) => t.iron && IRON_DOMAINS.has(t.domain)).map((t) => t.domain),
          );
          ironCount = tagged.filter((t) => t.iron && IRON_DOMAINS.has(t.domain)).length;
          ironDomainList.push(...Array.from(ironDomains));
          candidatePool = tagged
            .filter((t) => (t.iron && ironDomains.has(t.domain)) || !ironDomains.has(t.domain))
            .map((t) => (t.iron && ironDomains.has(t.domain) ? { ...t.se, score: t.se.score + IRON_PREFERENCE_BONUS } : t.se));
        }
        // DIAG (temporary): equipment in vs pool out — did gear exercises survive, or is it top-up?
        console.log(
          `[hybrid:diag] stop "${candidate.stopId}" equip=[${candidate.availableEquipment.join(',')}]` +
          ` isBodyweight=${isBodyweight} poolAfterFilter=${pool.exercises.length} finalPool=${candidatePool.length}` +
          ` iron=${ironCount} ironDomains=[${ironDomainList.join(',')}]`,
        );
        return generateStrengthBlock({
          blockMinutes: bodyweightMinutes,
          scoredPool: candidatePool,
          // Domain focus:
          // • route planner → this station's share of the session's full-body split.
          // • 'multi' (route-stops Bug 2a) → MIXED (undefined) for EVERY station, so a
          //   single stop is a real full-body workout (iron where available, bodyweight
          //   for the rest) instead of a single-domain slice.
          // • else (budget-split default) → bodyweight is MIXED (a single-domain focus is
          //   impossible with zero equipment), equipment stops keep their cycling domain.
          domainFocus: effectiveDomainFocus,
          ...(domains ? { domains } : {}),
          context: input.generationContext,
          rest: STATION_REST,
        });
      };

      let block: StrengthBlockResult;
      if (station) {
        const inDomains = (se: (typeof scoredPool)[number]) => {
          if (!stationDomains) return true;
          const d = strengthDomainOf(se.exercise);
          return d != null && stationDomains.includes(d);
        };
        const notFollowAlong = (se: (typeof scoredPool)[number]) => !se.exercise.isFollowAlong;
        const notUsed = (se: (typeof scoredPool)[number]) => !station.excludeExerciseIds?.has(se.exercise.id);
        const skillOk = (se: (typeof scoredPool)[number]) => !station.excludeSkillExercise?.(se.exercise);
        const attempts: Array<{ label: string; pool: typeof scoredPool; domains?: string[] }> = [
          { label: 'strict', pool: scoredPool.filter((se) => notFollowAlong(se) && inDomains(se) && notUsed(se) && skillOk(se)), domains: stationDomains },
          { label: 'skill relaxed', pool: scoredPool.filter((se) => notFollowAlong(se) && inDomains(se) && notUsed(se)), domains: stationDomains },
          { label: 'repeats relaxed', pool: scoredPool.filter((se) => notFollowAlong(se) && inDomains(se)), domains: stationDomains },
          { label: 'mixed', pool: scoredPool.filter(notFollowAlong), domains: undefined },
        ];
        block = { exercises: [], estimatedDurationSec: 0, totalPlannedSets: 0, isEmpty: true, log: [] };
        for (const attempt of attempts) {
          if (attempt.pool.length === 0) continue;
          block = ironAndGenerate(attempt.pool, attempt.domains);
          if (!block.isEmpty) {
            if (attempt.label !== 'strict') log.push(`[${candidate.stopId}] station pool (${attempt.label}) — strict pool came out empty`);
            break;
          }
        }
        if (!block.isEmpty) block = fitBlockToBudget(block, bodyweightMinutes * 60, log, `[${candidate.stopId}]`);
      } else {
        block = ironAndGenerate(scoredPool, undefined);
      }
      log.push(...block.log.map((l) => `[${candidate.stopId}] ${l}`));
      // Note: empty here is NOT a domain-assessment case (that's handled by the
      // early short-circuit above, before the pool was even built) — this is an
      // unrelated empty reason (thin catalog, injury shield), unchanged existing
      // behaviour: skip the station (unless its machines already carry it).
      if (machinePart) {
        const merged: StrengthBlockResult = block.isEmpty ? machinePart : {
          ...block,
          exercises: [...machinePart.exercises, ...block.exercises],
          estimatedDurationSec: machinePart.estimatedDurationSec + block.estimatedDurationSec,
          totalPlannedSets: machinePart.totalPlannedSets + block.totalPlannedSets,
          tabataBlocks: machinePart.tabataBlocks,
        };
        return withStationWarmup(merged, candidate, input, station, log);
      }
      if (block.isEmpty) return null;
      return withStationWarmup(block, candidate, input, station, log);
    }
    case 'stretch':
    case 'mobility':
    case 'yoga': {
      // Static-stretch block — REUSE the cooldown selector (role==='cooldown' pool,
      // location + time-budget scoring). appendCooldownExercises mutates a workout, so we
      // hand it an empty stub and lift out the exercises it appends, then wrap them as a
      // StrengthBlockResult the composer/runner already know how to render.
      const stub = { exercises: [] as any[] } as any;
      appendCooldownExercises(stub, input.masterExercises, input.filterContext, 'park', blockMinutes);
      const exercises = stub.exercises;
      if (exercises.length === 0) {
        log.push(`[${candidate.stopId}] ${activity}: no stretch (cooldown-role) exercises available — skipped`);
        return null;
      }
      const estimatedDurationSec = exercises.reduce(
        (acc: number, ex: any) =>
          acc + (ex.sets ?? 1) * ((ex.isTimeBased ? ex.reps : ex.reps * SECONDS_PER_REP) + (ex.restSeconds ?? 0)),
        0,
      );
      log.push(`[${candidate.stopId}] ${activity}: ${exercises.length} static stretches (~${Math.round(estimatedDurationSec / 60)}min)`);
      return {
        exercises,
        estimatedDurationSec,
        totalPlannedSets: exercises.reduce((acc: number, ex: any) => acc + (ex.sets ?? 1), 0),
        domainFocus: undefined,
        isEmpty: false,
        log: [],
      };
    }
    case 'core': {
      // Tabata-first (22.09.2026, David-approved — field-test docs 32/33):
      // reuses core-block.ts's Form B COMPLETELY UNCHANGED (same builder the
      // regular home/park generator uses for a core-tabata slot) — this
      // sidesteps both the TIER_TABLE 1-3-reps issue (tabata members are
      // always time-based, never go through assignVolume at all) and the
      // home-media issue (buildTabataFromPool already resolves each
      // member's ExecutionMethod via selectMethodForContext and carries it
      // forward — see tabata.block.ts:228-236's own header comment, which
      // describes and already fixes exactly this failure mode). Falls back
      // to the pre-existing field/bodyweight generateStrengthBlock path,
      // completely unchanged, when a tabata block can't be built (thin
      // pool, or the station's time budget can't fit even one 4-minute
      // block) — see chooseStationTabataBlockCount.
      // Domain-assessment gate (David, 23-24.09.2026) — checked BEFORE either
      // content attempt, same reasoning as 'strength' above: when BOTH domains
      // this station could offer (legs_core) are unassessed, go straight to
      // equipment-tabata/lock-card rather than letting a stray domain-less
      // exercise slip through a later filter and produce thin, unrelated content.
      const coreUserProgramLevels = input.generationContext.userProgramLevels;
      const coreMissingDomains = (['legs', 'core'] as const).filter((d) => !(coreUserProgramLevels?.has(d) ?? true));
      if (coreMissingDomains.length === 2) {
        return buildDomainGateFallback(candidate, coreMissingDomains, blockMinutes, input, log);
      }
      const coreAssessed = coreUserProgramLevels?.has('core') ?? true;
      const hiitPool = coreAssessed ? input.masterExercises.filter((ex) => ex.tags?.includes('hiit_friendly')) : [];
      const fullCorePool = hiitPool.filter((ex) => hasExplicitCoreLevel(ex) && !ex.isFollowAlong);
      // Route planner: a core stop never repeats the core tabata an earlier stop already did
      // (falls back to the full pool only when nothing new is left).
      const unusedCorePool = station?.excludeExerciseIds
        ? fullCorePool.filter((ex) => !station.excludeExerciseIds!.has(ex.id))
        : fullCorePool;
      const corePool = unusedCorePool.length >= 2 ? unusedCorePool : fullCorePool;
      const blockCount = coreAssessed ? chooseStationTabataBlockCount(blockMinutes) : 0;

      if (blockCount > 0 && corePool.length > 0) {
        const userCoreLevel = input.generationContext.userProgramLevels?.get('core')
          ?? input.generationContext.userLevel;
        const { exercises, blocks } = buildStationCoreTabataBlocks(
          {
            corePool,
            userLevel: userCoreLevel,
            location: input.filterContext.location,
            availableEquipment: [],
            injuryShield: input.generationContext.injuryShield,
            blockCount,
          },
          blockMinutes,
        );
        if (blocks.length > 0) {
          log.push(
            `[${candidate.stopId}] core: ${blocks.length} tabata block(s) ` +
            `(${blocks.reduce((s, b) => s + b.exerciseIds.length, 0)} exercises total, ` +
            `requested ${blockCount}) — [${exercises.map((we) => (we.exercise.name as { he?: string })?.he ?? we.exercise.id).join(', ')}]`,
          );
          return withStationWarmup({
            exercises,
            estimatedDurationSec: blocks.length * TABATA_BLOCK_SECONDS
              + (blocks.length - 1) * REST_BETWEEN_STATION_TABATA_BLOCKS_SEC,
            totalPlannedSets: 0, // tabata members are time-boxed intervals, not set-based
            domainFocus: 'legs_core',
            isEmpty: false,
            log: [],
            tabataBlocks: blocks,
          }, candidate, input, station, log);
        }
        log.push(`[${candidate.stopId}] core: tabata composition failed (pool too thin) — falling back to field pool`);
      } else if (!coreAssessed) {
        log.push(`[${candidate.stopId}] core: domain-assessment gate — core not assessed, ab-tabata skipped`);
      } else if (blockCount === 0) {
        log.push(`[${candidate.stopId}] core: station budget (${blockMinutes}min) can't fit even one 4-minute tabata block — falling back to field pool`);
      }

      // ── Fallback: pre-existing field/bodyweight path, now domain-gated for the
      // partial-assessment case (e.g. legs assessed, core not — legs content
      // still flows, core exercises are filtered out per-exercise). The
      // both-unassessed case already short-circuited above. ───────────────────
      const pool = filterExercisesContextually(input.masterExercises, {
        ...input.filterContext,
        availableEquipment: [],
        intentMode: 'field' as const,
      });
      const gatedFieldPool = pool.exercises.filter((se) => isExerciseDomainAssessed(se.exercise, coreUserProgramLevels));
      const unusedFieldPool = station
        ? gatedFieldPool.filter((se) => !se.exercise.isFollowAlong && !station.excludeExerciseIds?.has(se.exercise.id))
        : gatedFieldPool;
      const generateCore = (scoredPool: typeof gatedFieldPool) => generateStrengthBlock({
        blockMinutes,
        scoredPool,
        domainFocus: 'legs_core',
        context: input.generationContext,
        rest: STATION_REST,
      });
      let block = generateCore(unusedFieldPool);
      if (block.isEmpty && unusedFieldPool !== gatedFieldPool) block = generateCore(gatedFieldPool);
      if (!block.isEmpty && station) block = fitBlockToBudget(block, blockMinutes * 60, log, `[${candidate.stopId}]`);
      log.push(...block.log.map((l) => `[${candidate.stopId}] ${l}`));
      return block.isEmpty ? null : withStationWarmup(block, candidate, input, station, log);
    }
    default:
      // rest_view / meditation — no exercise content by design (a pure rest/view stop).
      log.push(`[${candidate.stopId}] activityType '${activity}' has no generator yet — skipped`);
      return null;
  }
}

// ============================================================================
// CALORIES (design step 8)
// ============================================================================

function strengthBlockCalories(block: StrengthBlockResult, weightKg: number): number {
  let workSec = 0;
  for (const ex of block.exercises) {
    workSec += ex.sets * (ex.isTimeBased ? ex.reps : ex.reps * SECONDS_PER_REP);
  }
  workSec = Math.min(workSec, block.estimatedDurationSec);
  const restSec = Math.max(0, block.estimatedDurationSec - workSec);
  const met = block.exercises.length > 0
    ? block.exercises.reduce((acc, ex) => acc + (TIER_MET[ex.tier ?? 'match'] ?? 5.0), 0) / block.exercises.length
    : 5.0;
  const kcalPerMin = (m: number) => (m * 3.5 * weightKg) / 200;
  return Math.round(kcalPerMin(met) * (workSec / 60) + kcalPerMin(REST_MET) * (restSec / 60));
}

// ============================================================================
// MAIN — composeHybridSession
// ============================================================================

export function composeHybridSession(rawInput: HybridComposeInput): HybridPlan {
  // Station content gate (17.10.2026): no follow-along/reinforcement/recovery/test items.
  const input = withStationEligibleContent(rawInput);
  const log: string[] = [];
  const { resolved, whoGapNote } = resolveEmphasis(input.emphasis, input.weeklyGaps);
  log.push(`emphasis: ${input.emphasis} → ${resolved}${whoGapNote ? ` (${whoGapNote})` : ''}`);

  // ── Step 2: budget split ──────────────────────────────────────────────────
  const aerobicShare = EMPHASIS_AEROBIC_SHARE[resolved];
  const tAerobicMin = input.timeBudgetMin * aerobicShare;
  const tStrengthMin = input.timeBudgetMin - tAerobicMin;

  // ── Step 3: station count (decision 7 — derived, user-editable) ──────────
  const suggested = Math.max(
    STATION_MIN,
    Math.min(STATION_MAX, Math.round(tStrengthMin / STATION_MINUTES.ideal), input.stopCandidates.length || 1),
  );
  let stations = input.stationOverride != null
    ? Math.max(STATION_MIN, Math.min(STATION_MAX, Math.round(input.stationOverride)))
    : suggested;

  // ── Step 7 prep: route geometry (item 3 utils) ────────────────────────────
  const prefixKm = buildRoutePrefixKm(input.routePath);
  const routeKm = totalRouteKm(prefixKm);
  // Degenerate-route guard (code-review): with routeKm≈0 the ±25% gate
  // becomes unsatisfiable and legs would carry duration with zero distance.
  // Surface it loudly so the orchestrator/UI can reject before starting.
  if (input.routePath.length < 2 || routeKm < 0.2) {
    log.push(`⚠️ degenerate route: ${input.routePath.length} vertices, ${routeKm.toFixed(3)}km — plan is not startable`);
  }
  const candidatesByKm = input.stopCandidates
    .map((candidate) => ({ candidate, km: kmAtIndex(prefixKm, candidate.waypointIndex) }))
    .sort((a, b) => a.km - b.km);

  // ── Steps 3+7: fit stations to route (degrade S on no-fit) ───────────────
  let selection: ScoredSelection | null = null;
  let usedFieldFallback = false;
  let insufficientHomeContent = false;
  let skippedFieldFallback = false;
  let routePlan: RouteStationPlan | null = null;
  if (input.stopSelection === 'as_provided') {
    // ANCHOR mode (route-stops §1a): the caller placed these stops deliberately, on/near
    // the route — the ±25% spacing gate (about even AUTO-placement) is bypassed. Since
    // 17.10.2026 the stops are no longer ALL stations: planRouteStations sizes ONE session
    // (strength budget = requested − walking time, station count that fits it, warm-up walk
    // before the first station, one full-body split across stations) and the rest are
    // pass-through (logged + meta.passThroughStopIds). Zero candidates → selection stays
    // null → the field fallback below fires (bodyweight mid-route), never an empty plan.
    const walkPace = zonePaceSecPerKm(input.paceProfile, legZone(1, 3, input.aerobicKind, resolved));
    routePlan = planRouteStations({
      candidatesByKm,
      routeKm,
      walkSecPerKm: (walkPace.min + walkPace.max) / 2,
      timeBudgetMin: input.timeBudgetMin,
      targetDomains: input.generationContext.requiredDomains ?? ['push', 'pull', 'legs', 'core'],
      machineShare: machineShareForLevel(input.machineShareLevel ?? deriveMachineShareLevel(input.generationContext)),
      log,
    });
    if (routePlan.chosen.length) {
      selection = { chosen: routePlan.chosen.map(({ candidate, km }) => ({ candidate, km })), score: 0 };
      stations = routePlan.chosen.length;
    }
  } else {
    while (stations >= STATION_MIN && !selection) {
      const legTargetKm = routeKm / (stations + 1);
      selection = selectStops(candidatesByKm, stations, legTargetKm, routeKm);
      if (!selection) {
        log.push(`fit: no ${stations}-stop combination within ±${STOP_FIT_TOLERANCE * 100}% — degrading`);
        stations -= 1;
      }
    }
  }
  if (!selection) {
    stations = 1;
    // No EVENLY-SPACED combination cleared the ±tolerance gate. That gate is about
    // station SPACING, not usability — a real resolved park WITH equipment must
    // never be dropped to bodyweight just because it doesn't sit at the km-midpoint.
    // Prefer the equipment candidate nearest the ideal mid-leg, placed at its ACTUAL
    // position. Only synthesize the field (bodyweight) fallback when NO candidate
    // carries equipment (true A3).
    const legTargetKm = routeKm / 2;
    const equipStop = candidatesByKm
      .filter((c) => (c.candidate.availableEquipment?.length ?? 0) > 0)
      .sort((a, b) => Math.abs(a.km - legTargetKm) - Math.abs(b.km - legTargetKm))[0];
    if (equipStop) {
      selection = { chosen: [equipStop], score: 0 };
      log.push(
        `fit: no even-spacing combo → using resolved equipment stop "${equipStop.candidate.stopId}"` +
        ` at ${equipStop.km.toFixed(2)}km (equip=[${equipStop.candidate.availableEquipment.join(',')}])`,
      );
    } else if (input.skipFieldFallbackWhenNoCandidates && candidatesByKm.length === 0) {
      // Domain-assessment gate (David, 23-24.09.2026): zero real stops resolved on this
      // route at all — don't invent one. Pure aerobic plan; caller surfaces the
      // "fill the questionnaire for power stations" nudge instead of degraded content.
      selection = { chosen: [], score: 0 };
      skippedFieldFallback = true;
      log.push('fit: zero real stop candidates + skipFieldFallbackWhenNoCandidates → pure aerobic, no synthetic stop');
    } else {
      // §3 step 7 fallback: ONE stop at the route midpoint — an OPEN AREA with no park, so
      // BODYWEIGHT ONLY. (§10, 09.08.2026, had assumed ESSENTIAL_PARK_GEAR here; the
      // 17.10.2026 hybrid audit found that prescribing one-arm hangs and Swedish-ladder
      // nordics at a spot with no bar or ladder, so it is back to bodyweight — an empty
      // equipment list makes dispatchStopContent filter in FIELD mode.) A high level whose
      // bodyweight pool is too thin still hits the insufficientHomeContent gate below.
      usedFieldFallback = true;
      const midIdx = indexAtKm(prefixKm, routeKm / 2);
      const [lng, lat] = input.routePath[midIdx] ?? [0, 0];
      const fieldFallbackEquipment: string[] = [];
      selection = {
        chosen: [{
          candidate: {
            stopId: 'field-fallback-mid-route',
            locationKind: 'open_area',
            lat, lng,
            waypointIndex: midIdx,
            availableEquipment: fieldFallbackEquipment,
            activityType: 'strength',
          },
          km: routeKm / 2,
        }],
        score: 0,
      };
      log.push('fit: field fallback — bodyweight-only stop at route midpoint (open area, no park gear)');

      // route-stops Part B — home-substitute content check: a field-fallback stop offers
      // whatever content the level window yields from the standard-park-gear pool above
      // (was pure bodyweight before §10). For a high level that pool can still be too thin
      // to be a real workout. Reuses the EXACT same pool-building call AND top-up
      // enrichment (topUpWithBodyweightIfThin) dispatchStopContent's strength branch
      // would apply for this equipment — fixed 09.08.2026 (adversarial review): this
      // pre-check previously stopped after the plain equipment filter and never applied
      // the top-up step, so it could verdict "insufficient" for a stop dispatchStopContent
      // would actually have built successfully. Same MIN_STATION_EXERCISES threshold a
      // real park pool already uses — no new mechanism, just applied earlier so the
      // caller can message instead of starting thin.
      // Same pool dispatchStopContent builds for a bodyweight stop (FIELD mode, no gear).
      const fieldPool = filterExercisesContextually(input.masterExercises, {
        ...input.filterContext, availableEquipment: fieldFallbackEquipment, intentMode: 'field',
      }).exercises;
      const targetLevel = input.generationContext.userLevel;
      const inBand = fieldPool.filter(
        (se) => Math.abs(input.filterContext.getUserLevelForExercise(se.exercise) - targetLevel) <= HOME_SUBSTITUTE_LEVEL_BAND,
      );
      insufficientHomeContent = inBand.length < MIN_STATION_EXERCISES;
      log.push(
        `fit: field fallback pool — ${inBand.length} exercise(s) within ±${HOME_SUBSTITUTE_LEVEL_BAND} of level ${targetLevel}` +
        (insufficientHomeContent ? ` (< ${MIN_STATION_EXERCISES} — insufficient)` : ''),
      );
    }
  }

  // ── Steps 4+5: station content (domain order by weekly deficit) ──────────
  const perStationMin = Math.max(
    STATION_MINUTES.min,
    Math.min(STATION_MINUTES.max, tStrengthMin / stations),
  );
  const focusOrder: BlockDomainFocus[] = [
    ...(input.weeklyGaps.neglectedDomains
      .map((d) => (d === 'legs' || d === 'core' ? 'legs_core' : d) as BlockDomainFocus)
      .filter((d, i, arr) => DOMAIN_ORDER.includes(d) && arr.indexOf(d) === i)),
    ...DOMAIN_ORDER,
  ];

  const builtStops: Array<{ candidate: HybridStopCandidate; km: number; focus: BlockDomainFocus; content: StrengthBlockResult; domains?: string[] }> = [];
  if (routePlan && routePlan.chosen.length > 0) {
    // ── Route planner: ONE session threaded across the stations ──────────────────────────
    // usedExerciseIds → no exercise twice; one skill family per session (the user's P1 skill
    // if set, else the first family a station prescribes), and skill work at ONE station only.
    const machineShareLevel = input.machineShareLevel ?? deriveMachineShareLevel(input.generationContext);
    const used = new Set<string>();
    const p1 = input.generationContext.priority1SkillIds?.[0];
    const p1Slug = p1 ? resolveToSlug(p1) : undefined;
    let skillFamily: string | null = p1Slug && DOMAIN_RESOLUTION_SKILL_PARENT_MAP[p1Slug] !== undefined ? p1Slug : null;
    let skillStationDone = false;
    const familiesIn = (block: StrengthBlockResult) =>
      Array.from(new Set(block.exercises.flatMap((we) => skillFamiliesOf(we.exercise))));
    for (const c of routePlan.chosen) {
      const minutes = c.needsWarmup
        ? Math.max(ROUTE_STATION_FLOOR_MIN, routePlan.perStationMin - STATION_WARMUP_RESERVE_MIN)
        : routePlan.perStationMin;
      const ctxFor = (family: string | null): StationPlanContext => ({
        domains: c.domains,
        excludeExerciseIds: used,
        excludeSkillExercise: (ex) => {
          const fams = skillFamiliesOf(ex);
          if (fams.length === 0) return false;
          if (skillStationDone) return true;
          return family != null && !fams.includes(family);
        },
        machineShareLevel,
        needsWarmup: c.needsWarmup,
        ...(c.mode ? { mode: c.mode } : {}),
      });
      let content = dispatchStopContent(c.candidate, focusOrder[0], minutes, input, log, ctxFor(skillFamily));
      let fams = content ? familiesIn(content) : [];
      if (content && skillFamily == null && fams.length > 1) {
        // Two skill families at one station → keep the first, regenerate the station once.
        const retry = dispatchStopContent(c.candidate, focusOrder[0], minutes, input, log, ctxFor(fams[0]));
        log.push(`[${c.candidate.stopId}] skill families [${fams.join(',')}] → regenerated with ${fams[0]} only`);
        if (retry) { content = retry; fams = familiesIn(retry); }
      }
      if (!content) {
        log.push(`station ${c.candidate.stopId}: empty/unsupported — skipped (legs re-merge)`);
        continue;
      }
      if (fams.length > 0) { skillStationDone = true; skillFamily = skillFamily ?? fams[0]; }
      for (const we of content.exercises) used.add(we.exercise.id);
      builtStops.push({ candidate: c.candidate, km: c.km, focus: focusOrder[0], content, domains: c.domains });
    }
  } else {
    for (let i = 0; i < selection.chosen.length; i++) {
      const { candidate, km } = selection.chosen[i];
      const focus = focusOrder[i % focusOrder.length];
      // route_stops field fallback: same session budget + station rules as the planner.
      const content = routePlan
        ? dispatchStopContent(candidate, focus, Math.min(ROUTE_STATION_MAX_MIN, routePlan.strengthBudgetMin), input, log, {})
        : dispatchStopContent(candidate, focus, perStationMin, input, log);
      if (content) builtStops.push({ candidate, km, focus, content });
      else log.push(`station ${candidate.stopId}: empty/unsupported — skipped (legs re-merge)`);
    }
  }

  // ── Step 6: aerobic legs from SURVIVING stops (isEmpty → merged legs) ─────
  const stopKms = builtStops.map((s) => s.km);
  const gaps = legGapsKm(prefixKm, stopKms);
  const legsCount = gaps.length;

  // ── Assemble interleaved plan ─────────────────────────────────────────────
  const segments: HybridPlannedSegment[] = [];
  let totalCalories = 0;
  let cursorKm = 0;
  let aerobicSec = 0; // real time = Σ (distance × pace), NOT an equal budget split

  for (let leg = 0; leg < legsCount; leg++) {
    const zone = legZone(leg, legsCount, input.aerobicKind, resolved);
    const pace = zonePaceSecPerKm(input.paceProfile, zone);
    // Real leg duration: km × pace (midpoint sec/km). A 70 m leg is ~20 s, not a
    // budget-averaged 8 min. Guarantees duration tracks distance on every leg.
    const legSec = Math.round(gaps[leg] * (pace.min + pace.max) / 2);
    aerobicSec += legSec;
    const legCalories = Math.round(gaps[leg] * input.userWeightKg * AEROBIC_KCAL_FACTOR);
    totalCalories += legCalories;
    segments.push({
      index: segments.length,
      kind: 'aerobic',
      aerobicType: input.aerobicKind,
      zone,
      targetPaceSecPerKm: pace,
      durationSec: legSec,
      distanceKm: Number(gaps[leg].toFixed(3)),
      fromKm: Number(cursorKm.toFixed(3)),
      toKm: Number((cursorKm + gaps[leg]).toFixed(3)),
      estCalories: legCalories,
    });
    cursorKm += gaps[leg];

    const stop = builtStops[leg];
    if (stop) {
      const stationCalories = strengthBlockCalories(stop.content, input.userWeightKg);
      totalCalories += stationCalories;
      segments.push({
        index: segments.length,
        kind: 'strength',
        stopId: stop.candidate.stopId,
        parkId: stop.candidate.parkId,
        locationKind: stop.candidate.locationKind,
        activityType: stop.candidate.activityType ?? 'strength',
        lat: stop.candidate.lat,
        lng: stop.candidate.lng,
        // Unknown equipment (failed lookup) → key omitted → no swap filter; [] only when the
        // park genuinely has none.
        ...(stop.candidate.equipmentUnknown ? {} : { availableEquipment: stop.candidate.availableEquipment }),
        // 'multi' (Bug 2a): the station is full-body → no single-domain label/icon (UI
        // falls back to the generic "כוח" glyph). Else keep the cycling domain.
        domainFocus: input.stationDomainMode === 'multi' ? undefined : stop.focus,
        ...(stop.domains ? { stationDomains: stop.domains } : {}),
        content: stop.content,
        durationSec: stop.content.estimatedDurationSec,
        estCalories: stationCalories,
      });
    }
  }

  const strengthSec = builtStops.reduce((acc, s) => acc + s.content.estimatedDurationSec, 0);
  return {
    segments,
    totals: {
      aerobicMin: Math.round(aerobicSec / 60), // real Σ(distance×pace), not the budget
      strengthMin: Math.round(strengthSec / 60),
      distanceKm: Number(routeKm.toFixed(2)),
      estCalories: totalCalories,
      stations: builtStops.length,
    },
    meta: {
      emphasisResolved: resolved, whoGapNote, usedFieldFallback, insufficientHomeContent, skippedFieldFallback,
      ...(routePlan && routePlan.passThroughStopIds.length > 0 ? { passThroughStopIds: routePlan.passThroughStopIds } : {}),
      log,
    },
  };
}

/** Machine-share level fallback: average assessed push/pull (resolveMachineShareLevel's rule), else userLevel. */
function deriveMachineShareLevel(ctx: WorkoutGenerationContext): number {
  const levels = (['push', 'pull'] as const)
    .map((d) => ctx.userProgramLevels?.get(d))
    .filter((l): l is number => typeof l === 'number' && l > 0);
  return levels.length > 0 ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : ctx.userLevel;
}

// ============================================================================
// ACTIVE-RUN FILTER (David, 24.09.2026) — locked stations never reach the run
// ============================================================================

/**
 * David's decision (24.09.2026): a locked station (domain-assessment gate)
 * belongs to the OVERVIEW screen only. The moment the user taps "start", a
 * locked station stops being a station — it does not enter the run sequence,
 * does not create a stop, does not trigger any arrival/notification. The
 * runner just walks past it. This is deliberately NOT a StrengthRunner
 * concern: StrengthRunner is a protected boundary (axioms.md §3) and never
 * mounts for a segment this function has already dropped — the filter runs
 * strictly upstream, in runHybridPlan, before useHybridRun.startHybrid ever
 * sees the segments.
 *
 * A locked strength segment carries zero content by construction
 * (`estimatedDurationSec:0`, `estCalories:0` — see buildDomainGateFallback's
 * locked-card branch above) — nothing is lost by discarding it. It sits
 * between two already-contiguous aerobic legs (leg.toKm === nextLeg.fromKm,
 * built above) — those two legs are summed into ONE, so the run's cursor
 * sequence stays a clean aerobic→strength→aerobic alternation (the shape
 * useHybridRun's isFinalLeg / hybrid-orchestrator's ARRIVE_STATION assume —
 * a bare `.filter()` without merging would leave two adjacent aerobic
 * segments, which breaks isFinalLeg's "any strength segment still ahead"
 * check for the common single-station MVP shape).
 *
 * Pure — returns a NEW HybridPlan; never mutates the input (the overview
 * screen keeps rendering the original, unfiltered `composed.plan`/`bolts`
 * unchanged — this filter applies ONLY to the copy handed to the run).
 */
export function stripLockedStationsForRun(plan: HybridPlan): HybridPlan {
  const merged: HybridPlannedSegment[] = [];
  let stationsDropped = 0;
  for (const seg of plan.segments) {
    if (seg.kind === 'strength' && seg.content?.needsAssessment) {
      stationsDropped += 1;
      continue; // never pushed — the run never sees this station at all
    }
    const prev = merged[merged.length - 1];
    if (seg.kind === 'aerobic' && prev?.kind === 'aerobic') {
      // The segment right before this one was a dropped locked station —
      // fold this leg into the previous one instead of pushing a new leg.
      merged[merged.length - 1] = {
        ...prev,
        distanceKm: Number(((prev.distanceKm ?? 0) + (seg.distanceKm ?? 0)).toFixed(3)),
        toKm: seg.toKm,
        durationSec: (prev.durationSec ?? 0) + (seg.durationSec ?? 0),
        estCalories: (prev.estCalories ?? 0) + (seg.estCalories ?? 0),
      };
    } else {
      merged.push(seg);
    }
  }
  if (stationsDropped === 0) return plan; // byte-identical for every plan with no locked station
  return {
    ...plan,
    segments: merged.map((s, i) => ({ ...s, index: i })),
    totals: { ...plan.totals, stations: Math.max(0, plan.totals.stations - stationsDropped) },
  };
}
