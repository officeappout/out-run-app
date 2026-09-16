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
 * Two blocks, NOT interleaved. Workout order is Block B first, Block A last
 * (bodyweight/skill while fresh → machine Tabata as the supported finish):
 *   Block A — the park's tagged strength machines (isCardio excluded in v1),
 *             prescribed as ONE shared Tabata block (timed intervals,
 *             round-robin across members — same mechanism as any other
 *             tabata block in this engine). How many machines (and rounds)
 *             is LEVEL-DRIVEN, not fixed — see `resolveMachineCount` /
 *             `machineShareForLevel`: machine share slides from mostly-
 *             machines at low level to all-bodyweight by level 10+.
 *   Block B — generateHomeWorkoutTrio(location: 'park'), filling only the
 *             movement domains Block A did NOT cover, at the user's real
 *             level, normal reps (not intervals). Any Tabata block Block B
 *             independently produces (its own core-form finisher) is merged
 *             into Block A's shared tabataBlock — see `composeParkWorkoutFromMachines`.
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
import { calculateWorkoutStats, getExerciseCountForDuration } from '../logic/workout-budgeting.utils';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import { resolveDataLevel, getBaseUserLevel } from './level-resolution.utils';
import { resolveParkEquipmentIds } from './park-equipment-resolver';
import { ensureEquipmentCachesLoaded } from '../shared/utils/gear-mapping.utils';

export type ParkWorkoutDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Difficulty → Tabata work/rest ladder, seconds. Only workSec/restSec are used
 * from this table — `rounds` is resolved per-session by `resolveMachineCount`
 * (level-driven machine count × MIN_ROUNDS_PER_MACHINE), not fixed here. Every
 * rung's workSec+restSec sums to 60s, so 1 round ≈ 1 minute regardless of
 * difficulty (see `blockASeconds`'s comment) — that invariant is why
 * `rounds` can safely vary per rung without Block B's time budget needing to
 * know which difficulty is active.
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
 * Every ladder rung totals the same wall-clock block length: workSec+restSec
 * sums to exactly 60s on all three rungs (20+40, 30+30, 40+20), so one Tabata
 * round is always ~1 minute regardless of difficulty. That invariant is what
 * lets `resolveMachineCount` reason about rounds as minutes directly.
 */
function blockASeconds(config: TabataProtocolConfig): number {
  return (config.workSec + config.restSec) * config.rounds;
}

/**
 * machineShare(level): how much of the strength block goes to machines vs
 * bodyweight, keyed on the user's push/pull level (see `resolveMachineShareLevel`).
 * A slider, not a fixed count — mostly-machines at low level, sliding to
 * all-bodyweight by level 10+ (design decision, 15.09.2026 diagnosis follow-up:
 * machine/Tabata relevance must scale DOWN as level rises instead of the old
 * hardcoded BLOCK_A_MACHINE_COUNT=4, which gave a level-16 user the exact same
 * Tabata block as a level-1 user).
 *
 * Starting anchors — tunable, David eyeballs sample output before deploy.
 * Ordered ascending so the scan below can `break` at the first rung the
 * level doesn't clear.
 */
const MACHINE_SHARE_LADDER: ReadonlyArray<{ level: number; share: number }> = [
  { level: 1, share: 0.75 },
  { level: 5, share: 0.60 },
  { level: 6, share: 0.45 },
  { level: 7, share: 0.30 },
  { level: 8, share: 0.20 },
  { level: 9, share: 0.15 },
  { level: 10, share: 0.00 },
];

export function machineShareForLevel(level: number): number {
  let share = MACHINE_SHARE_LADDER[0].share;
  for (const rung of MACHINE_SHARE_LADDER) {
    if (level < rung.level) break;
    share = rung.share;
  }
  return share;
}

/** Each Block A machine gets at least 2 consecutive rounds ("no 1-machine Tabata"). */
const MIN_ROUNDS_PER_MACHINE = 2;
/** Machine Tabata's own floor — below this it dissolves to bodyweight-only. */
const MIN_BLOCK_A_MACHINES = 2;
/** Bodyweight (Block B) always keeps at least this many minutes of the session. */
const MIN_BLOCK_B_MINUTES = 5;
/** Bodyweight block minimum — never a single exercise × 3 sets. */
const MIN_BLOCK_B_EXERCISES = 2;

/**
 * The push/pull domain level machineShare is keyed on — average of assessed
 * push/pull (the domains Block A's machines are mostly tagged under), falling
 * back to the user's derived overall level when neither is assessed. Mirrors
 * `isDomainAssessed`'s own tracks-then-domains read, not `buildUserProgramLevels`
 * (this only needs 2 specific domains, not the full program-level map).
 */
export function resolveMachineShareLevel(profile: UserFullProfile): number {
  const domains = (profile.progression?.domains ?? {}) as Record<string, unknown>;
  const tracks = (profile.progression?.tracks ?? {}) as Record<string, unknown>;
  const pushLevel = Math.max(resolveDataLevel(tracks.push), resolveDataLevel(domains.push));
  const pullLevel = Math.max(resolveDataLevel(tracks.pull), resolveDataLevel(domains.pull));
  const assessed = [pushLevel, pullLevel].filter((l) => l > 0);
  if (assessed.length > 0) {
    return Math.round(assessed.reduce((a, b) => a + b, 0) / assessed.length);
  }
  return getBaseUserLevel(profile);
}

export interface MachineCountResolution {
  machineCount: number;
  /** Total Tabata rounds for the shared block — machineCount × MIN_ROUNDS_PER_MACHINE. */
  rounds: number;
}

/**
 * Resolves how many of Block A's eligible machines to actually use this
 * session, and how many shared Tabata rounds to run them for. Level sets the
 * SHARE via `machineShareForLevel`; that share is then bounded by what the
 * park physically has, what the time budget allows, and by
 * MIN_BLOCK_B_EXERCISES worth of `strengthBudget` reserved for Block B — so
 * bodyweight never gets squeezed out as machineShare rises for a
 * machine-rich park. "No 1-machine Tabata": a target of exactly 1 bumps to
 * the MIN_BLOCK_A_MACHINES floor if park+time+budget allow it, else drops to
 * 0 (pure bodyweight) — never a lone machine on its own clock.
 */
export function resolveMachineCount(params: {
  strengthBudget: number;
  level: number;
  eligibleMachineCount: number;
  availableTime: number;
}): MachineCountResolution {
  const { strengthBudget, level, eligibleMachineCount, availableTime } = params;
  const share = machineShareForLevel(level);
  if (share <= 0 || eligibleMachineCount <= 0) return { machineCount: 0, rounds: 0 };

  const levelTarget = Math.round(strengthBudget * share);

  // Time-budget cap — 1 round ≈ 1 minute on every ladder rung (see blockASeconds).
  const timeBudgetMachines = Math.max(
    0,
    Math.floor((availableTime - MIN_BLOCK_B_MINUTES) / MIN_ROUNDS_PER_MACHINE),
  );
  // Budget-slot cap — keep ≥MIN_BLOCK_B_EXERCISES of strengthBudget's slots for Block B.
  const budgetSlotMachines = Math.max(0, strengthBudget - MIN_BLOCK_B_EXERCISES);

  let machineCount = Math.min(levelTarget, eligibleMachineCount, timeBudgetMachines, budgetSlotMachines);

  if (machineCount === 1) {
    const canFitFloor =
      eligibleMachineCount >= MIN_BLOCK_A_MACHINES &&
      timeBudgetMachines >= MIN_BLOCK_A_MACHINES &&
      budgetSlotMachines >= MIN_BLOCK_A_MACHINES;
    machineCount = canFitFloor ? MIN_BLOCK_A_MACHINES : 0;
  }

  if (machineCount < MIN_BLOCK_A_MACHINES) return { machineCount: 0, rounds: 0 };
  return { machineCount, rounds: machineCount * MIN_ROUNDS_PER_MACHINE };
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
  /** How many of those were actually selected into Block A (level-driven — see resolveMachineCount). */
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
  const ladderRung = TABATA_DIFFICULTY_LADDER[options.difficulty];

  // ── Block A: strength-eligible, tagged machines only — isCardio excluded (v1 scope) ──
  // How many machines (and shared Tabata rounds) Block A gets is level-driven,
  // not a fixed count — see resolveMachineCount/machineShareForLevel.
  const eligibleMachines = allMachines.filter((m) => isBlockAEligible(m, userProfile));
  const strengthBudget = getExerciseCountForDuration(availableTime).exerciseCount;
  const machineShareLevel = resolveMachineShareLevel(userProfile);
  const { machineCount, rounds } = resolveMachineCount({
    strengthBudget,
    level: machineShareLevel,
    eligibleMachineCount: eligibleMachines.length,
    availableTime,
  });
  const selectedMachines = machineCount > 0 ? selectBlockAMachines(eligibleMachines, machineCount) : [];
  const tabataConfig: TabataProtocolConfig = { workSec: ladderRung.workSec, restSec: ladderRung.restSec, rounds };
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
  const blockATimeMinutes = selectedMachines.length > 0 ? blockASeconds(tabataConfig) / 60 : 0;
  const blockBTimeMinutes = Math.max(MIN_BLOCK_B_MINUTES, availableTime - blockATimeMinutes);

  let blockBExercises: WorkoutExercise[] = [];
  let blockBTitle = '';
  let blockBDescription = '';
  let blockBTabataBlock: TabataBlockSpec | undefined;
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
      // Diagnosis item 1(b)/4 fix: Block B's own generator can independently
      // fire a core-form Tabata block (core-block.ts's chooseCoreForm, live,
      // not flag-gated) whose members previously had NO home here — this
      // composer's tabataBlock.exerciseIds only ever listed Block A's machine
      // ids, so Block B's core-tabata members fell into partitionByTabataBlock's
      // `rest` bucket (seg-main) at runner-mapping time: no protocol/protocolConfig,
      // exerciseType misresolved to 'reps', no countdown, no round counter, no
      // Tabata-timed video. Capturing it here and merging its ids below puts
      // them in the SAME shared segment/clock as Block A's machines instead.
      blockBTabataBlock = blockBResult.workout.tabataBlock;
    }
  }

  // Part 1 (bodyweight/skill, harder — done while fresh) before Part 2
  // (machine Tabata, easier/supported — at the end). Aerobic will become an
  // earlier Part 0 in a future phase; not built here.
  const exercises: WorkoutExercise[] = [...blockBExercises, ...blockAExercises];

  const machineIds = selectedMachines.map((m) => m.id);
  const blockBTabataIds = blockBTabataBlock?.exerciseIds ?? [];
  const combinedTabataIds = [...machineIds, ...blockBTabataIds];
  const tabataBlock: TabataBlockSpec | undefined =
    combinedTabataIds.length > 0
      ? {
          // Machines present → the shared ladder config (now carrying any
          // merged Block B core-tabata members too, since it's ONE clock).
          // No machines but Block B fired its own core-tabata → use ITS
          // config (TABATA_CLASSIC) — there's no machine block to unify with.
          config: machineIds.length > 0 ? tabataConfig : (blockBTabataBlock?.config ?? tabataConfig),
          exerciseIds: combinedTabataIds,
        }
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
    // Diagnosis item 3: NOT the machine's own id. The machine IS the exercise
    // here (a pseudo-exercise built FROM this machine) — listing it as its own
    // "required gear" was self-referential and surfaced the machine's real
    // Firestore name (e.g. "אגן ואלכסונים") as a required-equipment chip in the
    // drawer, since resolveEquipmentLabel's Tier-1 cache lookup always prefers
    // the real Firestore name over any canonical dictionary entry.
    equipmentIds: [],
    media: {
      mainVideoUrl: brand?.videoUrl ?? undefined,
      // Diagnosis item 2: without this, resolveExerciseMedia's fallback chain
      // had nothing but a Bunny-UUID regex match against mainVideoUrl (works
      // only for Bunny-iframe URLs) before falling to the video URL itself as
      // an <img src> — which fails to render for anything else, showing "?".
      imageUrl: brand?.imageUrl ?? undefined,
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
