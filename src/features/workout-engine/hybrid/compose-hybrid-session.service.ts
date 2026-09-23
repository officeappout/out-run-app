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
import { appendCooldownExercises } from '../services/cooldown.service';
import { hasExplicitCoreLevel } from '../logic/workout-selection.utils';
import { TABATA_BLOCK_SECONDS } from '../logic/protocols/tabata.constants';
import {
  buildStationCoreTabataBlocks,
  chooseStationTabataBlockCount,
  REST_BETWEEN_STATION_TABATA_BLOCKS_SEC,
} from './station-core-tabata';
import { DEFAULT_PACE_MAP_CONFIG } from '../core/config/pace-map-config';
import { normalizeGearIds, satisfiesGearRequirement, ESSENTIAL_PARK_GEAR } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import {
  buildStationEquipmentTabataBlock,
  type StationEquipmentTabataInput,
} from './station-equipment-tabata';
import type { ParkWorkoutDifficulty } from '../services/compose-park-strength-workout.service';

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
        totalPlannedSets: 0,
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
// CONTENT DISPATCH (§4b) — activityType → generator
// ============================================================================

export function dispatchStopContent(
  candidate: HybridStopCandidate,
  focus: BlockDomainFocus,
  blockMinutes: number,
  input: HybridComposeInput,
  log: string[],
): StrengthBlockResult | null {
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
      const userProgramLevels = input.generationContext.userProgramLevels;
      const relevantDomains = effectiveDomainFocus ? FOCUS_TO_DOMAINS[effectiveDomainFocus] : (['push', 'pull', 'legs', 'core'] as const);
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
      // PREFER IRON (per movement domain): at an equipped park, an exercise whose
      // method is real park iron (pull→מתח, push→דיפים) must win over a bodyweight
      // movement OF THE SAME DOMAIN. Two steps: (1) score-boost every iron exercise;
      // (2) drop a bodyweight exercise ONLY when its own domain has an iron alternative
      // (spec: "bodyweight only where no equipment supports the movement"). A domain
      // with no station iron (e.g. legs at a bar/dip park) keeps its bodyweight work.
      let ironCount = 0;
      const ironDomainList: string[] = [];
      if (candidate.availableEquipment.length > 0) {
        const tagged = scoredPool.map((se) => ({
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
        scoredPool = tagged
          .filter((t) => (t.iron && ironDomains.has(t.domain)) || !ironDomains.has(t.domain))
          .map((t) => (t.iron && ironDomains.has(t.domain) ? { ...t.se, score: t.se.score + IRON_PREFERENCE_BONUS } : t.se));
      }
      // DIAG (temporary): equipment in vs pool out — did gear exercises survive, or is it top-up?
      console.log(
        `[hybrid:diag] stop "${candidate.stopId}" equip=[${candidate.availableEquipment.join(',')}]` +
        ` isBodyweight=${isBodyweight} poolAfterFilter=${pool.exercises.length} finalPool=${scoredPool.length}` +
        ` iron=${ironCount} ironDomains=[${ironDomainList.join(',')}]`,
      );
      const block = generateStrengthBlock({
        blockMinutes,
        scoredPool,
        // Domain focus:
        // • 'multi' (route-stops Bug 2a) → MIXED (undefined) for EVERY station, so a
        //   single stop is a real full-body workout (iron where available, bodyweight
        //   for the rest) instead of a single-domain slice.
        // • else (budget-split default) → bodyweight is MIXED (a single-domain focus is
        //   impossible with zero equipment), equipment stops keep their cycling domain.
        domainFocus: effectiveDomainFocus,
        context: input.generationContext,
        rest: STATION_REST,
      });
      log.push(...block.log.map((l) => `[${candidate.stopId}] ${l}`));
      // Note: empty here is NOT a domain-assessment case (that's handled by the
      // early short-circuit above, before the pool was even built) — this is an
      // unrelated empty reason (thin catalog, injury shield), unchanged existing
      // behaviour: skip the station.
      return block.isEmpty ? null : block;
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
      const corePool = hiitPool.filter((ex) => hasExplicitCoreLevel(ex));
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
          return {
            exercises,
            estimatedDurationSec: blocks.length * TABATA_BLOCK_SECONDS
              + (blocks.length - 1) * REST_BETWEEN_STATION_TABATA_BLOCKS_SEC,
            totalPlannedSets: 0, // tabata members are time-boxed intervals, not set-based
            domainFocus: 'legs_core',
            isEmpty: false,
            log: [],
            tabataBlocks: blocks,
          };
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
      const block = generateStrengthBlock({
        blockMinutes,
        scoredPool: gatedFieldPool,
        domainFocus: 'legs_core',
        context: input.generationContext,
        rest: STATION_REST,
      });
      log.push(...block.log.map((l) => `[${candidate.stopId}] ${l}`));
      return block.isEmpty ? null : block;
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

export function composeHybridSession(input: HybridComposeInput): HybridPlan {
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
  if (input.stopSelection === 'as_provided') {
    // ANCHOR mode (route-stops §1a): the caller placed these stops deliberately, on/near
    // the route. Honour ALL of them in path order — the ±25% spacing gate governs even
    // AUTO-placement and must never drop a hand-placed POI. Cap at STATION_MAX (logged,
    // no silent truncation). Zero candidates → selection stays null → the field fallback
    // below fires (bodyweight mid-route), never an empty plan.
    const chosen = candidatesByKm.slice(0, STATION_MAX);
    if (candidatesByKm.length > STATION_MAX) {
      log.push(`as_provided: ${candidatesByKm.length} stops provided → capped at STATION_MAX (${STATION_MAX})`);
    }
    if (chosen.length) {
      selection = { chosen, score: 0 };
      stations = chosen.length;
      log.push(`as_provided: ${chosen.length} stop(s) at [${chosen.map((c) => c.km.toFixed(2)).join(', ')}]km (spacing gate bypassed)`);
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
      // §3 step 7 fallback, extended by §10 (09.08.2026, decision-tree v3, David-approved):
      // ONE stop at the route midpoint, now assuming STANDARD PUBLIC PARK gear
      // (pull-up bar / dip station / bench / etc — ESSENTIAL_PARK_GEAR) instead of pure
      // bodyweight. Mirrors the SAME unconditional, unflagged assumption
      // InputSanitizerMiddleware.ts:102-127 already makes for the home-generation path
      // when no real park resolves — not a new "is this safe" judgment, the same one
      // already live elsewhere. A high-level user's content is usually gear-based
      // (weighted pull-ups, muscle-up progressions, etc.), so this directly reduces how
      // often the insufficientHomeContent gate below fires for exactly the population
      // §10 was written for — not a guarantee it never fires again.
      usedFieldFallback = true;
      const midIdx = indexAtKm(prefixKm, routeKm / 2);
      const [lng, lat] = input.routePath[midIdx] ?? [0, 0];
      const fieldFallbackEquipment = Array.from(ESSENTIAL_PARK_GEAR);
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
      log.push(`fit: field fallback — standard-park-gear stop at route midpoint (equip=[${fieldFallbackEquipment.join(',')}])`);

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
      let fieldPool = filterExercisesContextually(input.masterExercises, {
        ...input.filterContext, availableEquipment: fieldFallbackEquipment,
      }).exercises;
      fieldPool = topUpWithBodyweightIfThin(fieldPool, input.masterExercises, input.filterContext);
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

  const builtStops: Array<{ candidate: HybridStopCandidate; km: number; focus: BlockDomainFocus; content: StrengthBlockResult }> = [];
  for (let i = 0; i < selection.chosen.length; i++) {
    const { candidate, km } = selection.chosen[i];
    const focus = focusOrder[i % focusOrder.length];
    const content = dispatchStopContent(candidate, focus, perStationMin, input, log);
    if (content) builtStops.push({ candidate, km, focus, content });
    else log.push(`station ${candidate.stopId}: empty/unsupported — skipped (legs re-merge)`);
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
        // 'multi' (Bug 2a): the station is full-body → no single-domain label/icon (UI
        // falls back to the generic "כוח" glyph). Else keep the cycling domain.
        domainFocus: input.stationDomainMode === 'multi' ? undefined : stop.focus,
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
    meta: { emphasisResolved: resolved, whoGapNote, usedFieldFallback, insufficientHomeContent, skippedFieldFallback, log },
  };
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
