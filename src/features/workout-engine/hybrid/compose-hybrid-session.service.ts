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
  type BlockDomainFocus,
  type StrengthBlockResult,
} from '../core/pipeline/strength-block.service';
import { MIN_STATION_EXERCISES } from './station-source';
import { DEFAULT_PACE_MAP_CONFIG } from '../core/config/pace-map-config';
import { normalizeGearIds, satisfiesGearRequirement } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import type { ExecutionMethod } from '@/features/content/exercises/core/exercise.types';

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

// ============================================================================
// CONTENT DISPATCH (§4b) — activityType → generator
// ============================================================================

function dispatchStopContent(
  candidate: HybridStopCandidate,
  focus: BlockDomainFocus,
  blockMinutes: number,
  input: HybridComposeInput,
  log: string[],
): StrengthBlockResult | null {
  const activity = candidate.activityType ?? 'strength';
  switch (activity) {
    case 'strength': {
      // Per-stop pool (§4b): the ONLY per-stop delta is availableEquipment. A
      // BODYWEIGHT stop (no equipment) filters in FIELD mode (`intentMode:'field'`
      // → fieldReady/no-equipment only), or a park location would exclude every
      // bodyweight exercise and the station comes out empty (Q6 — never silent).
      const isBodyweight = candidate.availableEquipment.length === 0;
      const pool = filterExercisesContextually(input.masterExercises, {
        ...input.filterContext,
        availableEquipment: candidate.availableEquipment,
        ...(isBodyweight ? { intentMode: 'field' as const } : {}),
      });
      // Top-up (Phase א.3): count AFTER level/program filtering. If a real park
      // pool comes back thin, merge fieldReady bodyweight exercises so the station
      // is never empty.
      let scoredPool = pool.exercises;
      if (scoredPool.length < MIN_STATION_EXERCISES && !isBodyweight) {
        const bodyweight = filterExercisesContextually(input.masterExercises, {
          ...input.filterContext,
          availableEquipment: [],
          intentMode: 'field',
        });
        const seen = new Set(scoredPool.map((e) => e.exercise.id));
        scoredPool = [...scoredPool];
        for (const e of bodyweight.exercises) {
          if (!seen.has(e.exercise.id)) { scoredPool.push(e); seen.add(e.exercise.id); }
        }
        log.push(`[${candidate.stopId}] thin park pool (${pool.exercises.length}) → topped up to ${scoredPool.length} w/ bodyweight`);
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
        // Bodyweight → MIXED focus: a single-domain focus like 'pull' is
        // impossible with zero equipment (a bar is required) and yields an empty
        // block. Equipment stops keep their weekly-deficit domain focus.
        domainFocus: isBodyweight ? undefined : focus,
        context: input.generationContext,
        rest: STATION_REST,
      });
      log.push(...block.log.map((l) => `[${candidate.stopId}] ${l}`));
      return block.isEmpty ? null : block;
    }
    default:
      // Future kinds (mobility/yoga/rest_view…) get their own generators here.
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
    } else {
      // §3 step 7 fallback: ONE bodyweight (fieldReady) stop at the route midpoint.
      usedFieldFallback = true;
      const midIdx = indexAtKm(prefixKm, routeKm / 2);
      const [lng, lat] = input.routePath[midIdx] ?? [0, 0];
      selection = {
        chosen: [{
          candidate: {
            stopId: 'field-fallback-mid-route',
            locationKind: 'open_area',
            lat, lng,
            waypointIndex: midIdx,
            availableEquipment: [],
            activityType: 'strength',
          },
          km: routeKm / 2,
        }],
        score: 0,
      };
      log.push('fit: field fallback — bodyweight stop at route midpoint');
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
        domainFocus: stop.focus,
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
    meta: { emphasisResolved: resolved, whoGapNote, usedFieldFallback, log },
  };
}
