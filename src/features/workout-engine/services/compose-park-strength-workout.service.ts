/**
 * compose-park-strength-workout.service — Phase 1 of the park "התחל אימון"
 * wiring plan (docs/research/park-start-workout-wiring-plan.md).
 *
 * NAMING NOTE: a DIFFERENT file, hybrid/compose-park-workout.service.ts
 * (composeParkWorkoutPlan), already existed for the separate hybrid "walk to
 * a park + do a full strength workout there + walk back" feature (aerobic +
 * strength combined). This file is deliberately named differently
 * (…-strength-workout…) to avoid a same-basename collision with that file —
 * do not rename this back to compose-park-workout.service.ts.
 *
 * Two blocks, NOT interleaved:
 *   Block A — the park's tagged strength machines (isCardio excluded in v1),
 *             prescribed as ONE shared Tabata block (timed intervals,
 *             round-robin across members — same mechanism as any other
 *             tabata block in this engine).
 *   Block B — generateHomeWorkoutTrio(location: 'park'), filling only the
 *             movement domains Block A did NOT cover, at the user's real
 *             level, normal reps (not intervals).
 *
 * Deliberately bypasses buildTabataBlock/buildTabataFromPool's pool-
 * *selection* machinery (protocols/tabata.block.ts) — Block A's exercise
 * list is not drawn from a scored pool, it's the deterministic list of
 * machines physically at this park. Only the Tabata *timing* shape
 * (TabataProtocolConfig / TabataBlockSpec) is reused, which the existing
 * live player (useWorkoutStateMachine / tabata.step.ts / tabata.advance.ts)
 * already consumes generically via `segment.protocolConfig` — confirmed
 * during the Phase 1 investigation pass to require zero player-side changes.
 *
 * LAW 0 (Workout Engine purity, .cursoragents/Workout_Engine_Truth.md):
 * no React hooks. The one Firestore read (fetching each tagged machine's
 * GymEquipment doc) is isolated to `composeParkWorkout`, mirroring
 * `composeFullParkWorkout`'s shape (start-hybrid-session.ts). Everything
 * else — machine selection, domain-complement math, pseudo-exercise
 * construction — is pure and covered by unit tests
 * (__tests__/compose-park-workout.service.test.ts).
 *
 * OUT OF SCOPE (Phase 2, explicitly not touched here): volume/level
 * crediting, the movementGroup→domain collapse at *completion* time,
 * the end-of-session effort question. `calculateWorkoutStats` below is
 * the same DISPLAY-only cosmetic stats function every other generated
 * workout already gets (calories/coins/reps for the preview UI) — it is
 * not a server-side XP award; `coins` here is decorative, matching how
 * every other GeneratedWorkout has always used this function up to now.
 */

import type { Park } from '@/features/parks/core/types/park.types';
import type { ParkGymEquipment, GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { MovementPattern } from '@/features/content/programs/core/program.types';
import type { LocalizedText, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise, DifficultyLevel } from '../logic/WorkoutGenerator';
import type { TabataBlockSpec } from '../logic/workout-generator.types';
import type { TabataProtocolConfig } from '../core/types/protocol.types';
import { getGymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.service';
import { generateHomeWorkoutTrio } from './home-workout.service';
import { calculateWorkoutStats } from '../logic/workout-budgeting.utils';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import { resolveDataLevel } from './level-resolution.utils';
import { resolveParkEquipmentIds } from './park-equipment-resolver';
import { ensureEquipmentCachesLoaded } from '../shared/utils/gear-mapping.utils';

export type ParkWorkoutDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Difficulty → Tabata work/rest ladder, seconds. Rounds fixed at 8 — matches
 * TABATA_CLASSIC's own rounds and keeps every rung the same total block
 * length ((work+rest)×8 = 480s / 8min for all three rungs), so Block B's
 * remaining-time budget doesn't need to vary by difficulty.
 */
const TABATA_DIFFICULTY_LADDER: Record<ParkWorkoutDifficulty, TabataProtocolConfig> = {
  easy: { workSec: 20, restSec: 40, rounds: 8 },
  medium: { workSec: 30, restSec: 30, rounds: 8 },
  hard: { workSec: 40, restSec: 20, rounds: 8 },
};

/** Difficulty → generateHomeWorkoutTrio's 1-3 DifficultyLevel for Block B. */
const DIFFICULTY_TO_LEVEL: Record<ParkWorkoutDifficulty, DifficultyLevel> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const ALL_DOMAINS: readonly MovementPattern[] = ['push', 'pull', 'legs', 'core'];

/**
 * How many machines Block A uses. 4 members × (8 rounds ÷ 4) = 2 rounds each,
 * landing on "2-3 sets per machine, clustered" (per the design) while tiling
 * the block's 8 rounds exactly — same reasoning TABATA_CORE_MEMBER_COUNTS
 * already encodes elsewhere in this engine (tabata.constants.ts) for exactly
 * this "which member counts divide 8 evenly" question. A park with fewer
 * strength-eligible machines just gets fewer members (still evenly tiled by
 * the player's own round-robin, since it cycles by count, not by a fixed
 * assumption of 4) — see `selectBlockAMachines`.
 */
const BLOCK_A_MACHINE_COUNT = 4;

/** Every ladder rung totals the same wall-clock block length. */
function blockASeconds(config: TabataProtocolConfig): number {
  return (config.workSec + config.restSec) * config.rounds;
}

export interface ComposeParkWorkoutOptions {
  difficulty: ParkWorkoutDifficulty;
  /** Total session length in minutes. Design default: ~20. */
  availableTime?: number;
}

export interface ComposeParkWorkoutResult {
  workout: GeneratedWorkout;
  /** Domains Block A's selected machines cover — surfaced for the drawer/debugging. */
  blockACoveredDomains: MovementPattern[];
  /** How many strength-eligible (non-cardio, tagged) machines the park actually had. */
  blockAEligibleMachineCount: number;
  /** How many of those were actually selected into Block A (≤ BLOCK_A_MACHINE_COUNT). */
  blockASelectedMachineCount: number;
}

/**
 * Async orchestration — fetches each of the park's tagged machines by id
 * (for Block A's display/pseudo-exercise construction) AND resolves the
 * park's CANONICAL gear-id inventory (for Block B's gear gating), then
 * hands both off to the pure `composeParkWorkoutFromMachines`. Mirrors
 * `composeFullParkWorkout`'s (start-hybrid-session.ts) shape for the
 * Firestore-read step.
 *
 * BUG FIX (post-launch, park-start-workout-wiring-plan Phase 1 follow-up):
 * this function used to only fetch the machine DOCS (for Block A's display)
 * and never resolved a canonical gear-id inventory at all — Block B's
 * generateHomeWorkoutTrio call was passed no parkEquipmentIds, so
 * InputSanitizerMiddleware.normalizeEquipmentArray always hit its
 * ESSENTIAL_PARK_GEAR catastrophic fallback (a generic pull-up-bar/dip-
 * station/bench guess), regardless of what the park actually has. Fixed by
 * calling the ALREADY-EXISTING resolveParkEquipmentIds with the park we
 * already know explicitly (its selectedParkId branch existed but had zero
 * real callers anywhere in the codebase before this) — not a new parallel
 * resolution path.
 */
export async function composeParkWorkout(
  park: Park,
  userProfile: UserFullProfile,
  options: ComposeParkWorkoutOptions,
): Promise<ComposeParkWorkoutResult> {
  const parkEquipmentRefs: ParkGymEquipment[] = park.gymEquipment ?? [];

  // Explicit + belt-and-suspenders: resolveParkEquipmentIds already warms
  // this cache internally as its own first statement
  // (park-equipment-resolver.ts) before it calls normalizeGearId — but
  // normalizeGearId silently degrades to a raw-id passthrough when the
  // cache isn't warm yet, with no error or warning. Calling it explicitly
  // here means this file's own correctness doesn't silently depend on an
  // internal implementation detail of a function it doesn't own. Cheap:
  // documented as idempotent, deduplicates via a shared promise.
  await ensureEquipmentCachesLoaded();

  const [machines, parkEquipmentIds] = await Promise.all([
    Promise.all(parkEquipmentRefs.map((ref) => getGymEquipment(ref.equipmentId))).then(
      (results) => results.filter((m): m is GymEquipment => m != null),
    ),
    resolveParkEquipmentIds(userProfile, { selectedParkId: park.id }),
  ]);

  return composeParkWorkoutFromMachines(machines, userProfile, options, parkEquipmentIds);
}

/**
 * Pure(ish) composition — takes already-fetched GymEquipment docs (and an
 * already-resolved canonical gear-id inventory), so the domain-complement
 * math and pseudo-exercise construction are unit-testable without mocking
 * Firestore. The only genuinely async/Firestore-backed step is the Block B
 * `generateHomeWorkoutTrio` call.
 *
 * `parkEquipmentIds` defaults to `[]` so existing callers/tests that only
 * care about Block A / domain-complement logic don't need to thread a value
 * through — an empty array here means Block B falls back to
 * InputSanitizerMiddleware's ESSENTIAL_PARK_GEAR (the SAME degraded
 * behavior as before this fix), which is the correct "I genuinely don't
 * know this park's real gear" case, not the bug this fixes (the bug was
 * `composeParkWorkout` never resolving one at all, even when it could).
 */
export async function composeParkWorkoutFromMachines(
  allMachines: GymEquipment[],
  userProfile: UserFullProfile,
  options: ComposeParkWorkoutOptions,
  parkEquipmentIds: string[] = [],
): Promise<ComposeParkWorkoutResult> {
  const availableTime = options.availableTime ?? 20;
  const tabataConfig = TABATA_DIFFICULTY_LADDER[options.difficulty];

  // ── Block A: strength-eligible, tagged machines only — isCardio excluded (v1 scope) ──
  const eligibleMachines = allMachines.filter((m) => isBlockAEligible(m, userProfile));
  const selectedMachines = selectBlockAMachines(eligibleMachines, BLOCK_A_MACHINE_COUNT);
  const blockACoveredDomains = computeCoveredDomains(selectedMachines);
  const blockAExercises = selectedMachines.map((m) => buildMachinePseudoExercise(m, tabataConfig));

  // ── Block B: fill whatever domains Block A did not cover ──
  // parkEquipmentIds (the park's CANONICAL gear-id inventory, resolved by
  // composeParkWorkout via resolveParkEquipmentIds — raw Firestore doc ids
  // mean nothing to the gating layer, they have to go through
  // normalizeGearId first) is passed straight through to Block B's
  // generateHomeWorkoutTrio call below, so InputSanitizerMiddleware
  // resolves the park's REAL gear instead of its ESSENTIAL_PARK_GEAR
  // catastrophic-fallback guess (pull-up bar/dip station/bench/etc, which
  // this specific park may not actually have). Domain exclusion above
  // already prevents Block B from re-covering whatever Block A handled, so
  // passing the park's FULL gear list here (not a Block-A-selected subset)
  // is safe — no double-dipping risk.
  const requiredDomains = ALL_DOMAINS.filter((d) => !blockACoveredDomains.includes(d));
  const blockATimeMinutes = blockASeconds(tabataConfig) / 60;
  const blockBTimeMinutes = Math.max(5, availableTime - blockATimeMinutes);

  let blockBExercises: WorkoutExercise[] = [];
  let blockBTitle = '';
  let blockBDescription = '';
  if (requiredDomains.length > 0) {
    const trio = await generateHomeWorkoutTrio({
      userProfile,
      location: 'park',
      availableTime: blockBTimeMinutes,
      difficulty: DIFFICULTY_TO_LEVEL[options.difficulty],
      requiredDomains: [...requiredDomains],
      strictDomains: true,
      // READ-ONLY preview — this composition may run again if the user edits
      // the drawer before starting, and must never mutate the user's program
      // cycle from a preview. Same flag composeFullParkWorkout already uses
      // for the same reason.
      skipCycleRestart: true,
      // Bug fix: this park's real canonical gear inventory, not omitted —
      // see this function's own doc comment above and composeParkWorkout's.
      parkEquipmentIds,
    });
    const blockBResult = trio.options[1].result;
    if (!blockBResult.workout.needsAssessment) {
      blockBExercises = blockBResult.workout.exercises;
      blockBTitle = blockBResult.workout.title;
      blockBDescription = blockBResult.workout.description;
    }
  }

  const exercises: WorkoutExercise[] = [...blockAExercises, ...blockBExercises];
  const tabataBlock: TabataBlockSpec | undefined =
    blockAExercises.length > 0
      ? { config: tabataConfig, exerciseIds: selectedMachines.map((m) => m.id) }
      : undefined;

  const totalPlannedSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
  const stats = calculateWorkoutStats(exercises, DIFFICULTY_TO_LEVEL[options.difficulty], availableTime);

  const workout: GeneratedWorkout = {
    title: blockBTitle || 'אימון בפארק',
    description:
      blockBDescription ||
      (blockAExercises.length > 0
        ? 'מתקנים בפארק + תרגילי משקל גוף'
        : 'אימון משקל גוף בפארק'),
    exercises,
    estimatedDuration: availableTime,
    structure: 'standard',
    difficulty: DIFFICULTY_TO_LEVEL[options.difficulty],
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '', isBalanced: true },
    stats,
    isRecovery: false,
    totalPlannedSets,
    tabataBlock,
  };

  return {
    workout,
    blockACoveredDomains: [...blockACoveredDomains],
    blockAEligibleMachineCount: eligibleMachines.length,
    blockASelectedMachineCount: selectedMachines.length,
  };
}

/**
 * v1 selection heuristic (deliberately simple — flagged in the plan doc as a
 * Phase 3 polish candidate for something smarter): prefer domain diversity
 * first (one machine per distinct covered domain, in push→pull→legs→core
 * order), then fill any remaining slots with the next eligible machines in
 * their given order. Deterministic given the same input list — no
 * randomness, easy to unit-test.
 */
export function selectBlockAMachines(
  eligibleMachines: GymEquipment[],
  count: number,
): GymEquipment[] {
  if (eligibleMachines.length <= count) return [...eligibleMachines];

  const selected: GymEquipment[] = [];
  const selectedIds = new Set<string>();
  const seenDomains = new Set<MovementPattern>();

  // Pass 1 — one machine per distinct domain, domain-priority order.
  for (const domain of ALL_DOMAINS) {
    if (selected.length >= count) break;
    const candidate = eligibleMachines.find((m) => {
      if (selectedIds.has(m.id)) return false;
      const mDomain = m.movementPattern ? MG_TO_DOMAIN[m.movementPattern] : undefined;
      return mDomain === domain;
    });
    if (candidate) {
      selected.push(candidate);
      selectedIds.add(candidate.id);
      seenDomains.add(domain);
    }
  }

  // Pass 2 — fill remaining slots from whatever's left, in list order.
  for (const m of eligibleMachines) {
    if (selected.length >= count) break;
    if (selectedIds.has(m.id)) continue;
    selected.push(m);
    selectedIds.add(m.id);
  }

  return selected;
}

/**
 * Whether the user has any real assessed level in this domain — "absent=absent"
 * check (the same convention partial-completion.generator.ts documents for
 * userProgramLevels), reading profile.progression.tracks/domains directly via
 * the same resolveDataLevel used everywhere else level data is read. Doesn't
 * need the full buildUserProgramLevels (which also resolves skill/master-
 * program tracks) — Block A only ever asks about the 4 foundational domains.
 */
export function isDomainAssessed(profile: UserFullProfile, domain: MovementPattern): boolean {
  const domains = (profile.progression?.domains ?? {}) as Record<string, unknown>;
  const tracks = (profile.progression?.tracks ?? {}) as Record<string, unknown>;
  return resolveDataLevel(tracks[domain]) > 0 || resolveDataLevel(domains[domain]) > 0;
}

/**
 * Block A eligibility (isCardio excluded, v1 scope, plus the isFunctional
 * safety handling from the Phase 1 investigation's Q1 finding):
 * isFunctional===false means hydraulic/self-limiting equipment (adjustable
 * resistance — safe at any level, per findHydraulicEquipment's own reasoning
 * in start-hybrid-session.ts, the field's only other real consumer in this
 * engine) — always eligible once tagged. isFunctional===true means real
 * calisthenics gear (NOT self-limiting — a wrong-level bodyweight movement
 * can be genuinely inappropriate), so it's only eligible once the user has
 * an assessed level in that machine's domain; otherwise Block A silently
 * falls back to whatever hydraulic/assessed machines the park has, exactly
 * like the hybrid unassessed-domain-gate already does for the same reason.
 */
export function isBlockAEligible(machine: GymEquipment, profile: UserFullProfile): boolean {
  if (machine.isCardio === true) return false;
  if (machine.movementPattern == null) return false;
  const domain = MG_TO_DOMAIN[machine.movementPattern] as MovementPattern | undefined;
  if (!domain) return false; // isolation/flexibility — not counted
  if (machine.isFunctional === true && !isDomainAssessed(profile, domain)) return false;
  return true;
}

/** Distinct push/pull/legs/core domains a set of selected machines covers. */
export function computeCoveredDomains(machines: GymEquipment[]): MovementPattern[] {
  const domains = new Set<MovementPattern>();
  for (const m of machines) {
    if (!m.movementPattern) continue;
    const domain = MG_TO_DOMAIN[m.movementPattern] as MovementPattern | undefined;
    if (domain && (ALL_DOMAINS as readonly string[]).includes(domain)) {
      domains.add(domain);
    }
  }
  return ALL_DOMAINS.filter((d) => domains.has(d));
}

/**
 * Minimal pseudo-exercise shape for a machine-as-Tabata-station — the exact
 * field set traced during the Phase 1 investigation (see plan doc Q4):
 * only `id`, `name`, `movementGroup`, and a synthesized `targetPrograms`
 * entry are real; `symmetry`/`injuryShield`/`tags` are safely omittable
 * (optional on Exercise, and the Tabata eligibility/cost logic this bypasses
 * anyway doesn't run over these pseudo-exercises — see the file header).
 * Field shape (sets/reps/isTimeBased/restSeconds/priority/tier/
 * protocolBlock) mirrors buildTabataFromPool's real member-stamping in
 * protocols/tabata.block.ts:292-319 exactly, substituting our ladder config
 * for TABATA_CLASSIC.
 */
export function buildMachinePseudoExercise(
  machine: GymEquipment,
  config: TabataProtocolConfig,
): WorkoutExercise {
  const name: LocalizedText = { he: machine.name, en: '', es: '' } as LocalizedText;
  const domain = machine.movementPattern ? MG_TO_DOMAIN[machine.movementPattern] : undefined;
  const brand = machine.brands?.[0];

  const method: ExecutionMethod = {
    location: 'park',
    requiredGearType: 'fixed_equipment',
    equipmentIds: [machine.id],
    media: {
      mainVideoUrl: brand?.videoUrl ?? undefined,
    },
  } as ExecutionMethod;

  const pseudoExercise = {
    id: machine.id,
    name,
    type: machine.type,
    loggingMode: 'reps',
    equipment: [],
    muscleGroups: machine.muscleGroups ?? [],
    primaryMuscle: machine.primaryMuscle,
    secondaryMuscles: machine.secondaryMuscles,
    programIds: [],
    media: {},
    content: {},
    stats: { views: 0 },
    movementGroup: machine.movementPattern,
    targetPrograms: domain
      ? [{ programId: domain, level: machine.recommendedLevel }]
      : [],
  };

  return {
    exercise: pseudoExercise as unknown as WorkoutExercise['exercise'],
    method,
    mechanicalType: 'none',
    sets: 1,
    reps: config.workSec,
    // Same protocol-level override buildTabataFromPool uses (see its own
    // comment) — a tabata interval is always time-boxed regardless of the
    // underlying station's normal nature.
    isTimeBased: true,
    restSeconds: config.restSec,
    priority: 'compound',
    score: 0,
    reasoning: ['park_workout:machine_block'],
    exerciseRole: 'main',
    tier: 'match',
    protocolBlock: 'tabata',
  };
}
