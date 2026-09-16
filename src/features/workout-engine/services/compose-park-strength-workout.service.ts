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
 *   Block A — the park's tagged REAL STRENGTH MACHINES ONLY (functional
 *             apparatus and cardio excluded — see `isBlockAEligible`),
 *             prescribed as ONE shared Tabata block (timed intervals,
 *             round-robin across members — same mechanism as any other
 *             tabata block in this engine).
 *   Block B — generateHomeWorkoutTrio(location: 'park'), ALWAYS runs (Wave 2
 *             #5 — domain coverage is a selection PREFERENCE inside Block B,
 *             never a gate on whether it runs at all), filling the session's
 *             remaining time at the user's real level. Any Tabata block
 *             Block B independently produces (its own core-form finisher) is
 *             merged into Block A's shared tabataBlock — see
 *             `composeParkWorkoutFromMachines`.
 *
 * Wave 2 (time-based rebuild, 16.09.2026 — .claude/knowledge diagnostic +
 * Wave 1/2 follow-up): the machine↔bodyweight split is governed by a SINGLE
 * shared TIME budget (T = availableTime), not two independent ones. Level
 * sets machines' SHARE of that time (`machineShareForLevel`, sliding to 0 by
 * level 8); the park's physical machine count caps what's actually
 * deliverable at a sane 2-rounds-per-machine norm
 * (`resolveMachineAllocation`); bodyweight always receives the remainder,
 * with a guaranteed floor machines can never size into. `workout.estimatedDuration`
 * is computed from the ACTUAL built content (`calculateEstimatedDuration`),
 * never just echoed back as the requested time — see
 * `composeParkWorkoutFromMachines`'s own comments for the full breakdown.
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
import { calculateWorkoutStats, calculateEstimatedDuration } from '../logic/workout-budgeting.utils';
import { MG_TO_DOMAIN } from '../shared/constants/domain-mapping.constants';
import { resolveDataLevel, getBaseUserLevel } from './level-resolution.utils';
import { resolveParkEquipmentIds } from './park-equipment-resolver';
import { getPark } from '@/features/parks/core/services/parks.service';
import { ensureEquipmentCachesLoaded } from '../shared/utils/gear-mapping.utils';
import { calculateWeeklyBudget } from '../core/store/useWeeklyVolumeStore';
import { TABATA_BLOCK_SECONDS } from '../logic/protocols/tabata.constants';

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
 * lets `resolveMachineAllocation` reason about rounds as minutes directly —
 * seconds/round is always READ from this ladder (never hardcoded), per Wave 2.
 */
function blockASeconds(config: TabataProtocolConfig): number {
  return (config.workSec + config.restSec) * config.rounds;
}

/**
 * machineShare(level): how much of the strength TIME budget goes to machines
 * vs bodyweight, keyed on the user's push/pull level (see
 * `resolveMachineShareLevel`). A slider, not a fixed count — mostly-machines
 * at low level, sliding to all-bodyweight by level 8 (Wave 2, 16.09.2026 —
 * time-based rebuild: reframed from a COUNT-share, which sized machines off
 * a rest-blind exercise-count proxy, into a genuine TIME-share:
 * `desiredMachineTime = shareForLevel(level) × strengthTimeBudget`. Curve
 * per product decision: high (0.6-0.75) at low level, starts dropping around
 * level 5, reaches 0 by level 8 — one level earlier than Wave 1's count-share
 * ladder, which bottomed out at level 10).
 *
 * Starting anchors — tunable, David eyeballs sample output before deploy.
 * Ordered ascending so the scan below can `break` at the first rung the
 * level doesn't clear.
 */
const MACHINE_SHARE_LADDER: ReadonlyArray<{ level: number; share: number }> = [
  { level: 1, share: 0.70 },
  { level: 5, share: 0.55 },
  { level: 6, share: 0.35 },
  { level: 7, share: 0.15 },
  { level: 8, share: 0.00 },
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
/**
 * Bodyweight (Block B) is the guaranteed core of the session — machines
 * never eat into this floor (Wave 2 #6: "bodyweight is never dropped").
 */
const MIN_BLOCK_B_MINUTES = 5;

/**
 * The push/pull domain level machineShare is keyed on — average of assessed
 * push/pull (the domains Block A's machines are mostly tagged under), falling
 * back to the user's derived overall level when neither is assessed. Reads
 * profile.progression.tracks/domains directly via resolveDataLevel (the same
 * tracks-then-domains convention used everywhere else level data is read),
 * not `buildUserProgramLevels` (this only needs 2 specific domains, not the
 * full program-level map).
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

export interface MachineAllocation {
  machineCount: number;
  /** Total Tabata rounds for the shared block — machineCount × MIN_ROUNDS_PER_MACHINE. */
  rounds: number;
  /** Actual machine-tabata wall-clock time this allocation delivers. */
  machineTimeMinutes: number;
}

/**
 * Wave 2 (time-based rebuild, 16.09.2026): resolves how many of Block A's
 * eligible machines to use THIS session, purely from a TIME budget — not the
 * rest-blind exercise-count proxy Wave 1 used (`strengthBudget` /
 * `getExerciseCountForDuration`, removed).
 *
 *   desiredMachineTime = shareForLevel(level) × strengthTimeBudget   (#3)
 *   machineTime = min(desiredMachineTime, eligibleMachines × 2 rounds × secPerRound)  (#4)
 *
 * The 2-rounds-per-machine norm is NEVER exceeded to stretch fewer machines
 * across more of the desired time — whatever desiredMachineTime the park
 * can't physically provide at a sane 2-rounds-each is left for Block B to
 * pick up as bodyweight time (composeParkWorkoutFromMachines's remainder),
 * not inflated into an absurd per-machine round count.
 *
 * Bodyweight's `MIN_BLOCK_B_MINUTES` floor is enforced HERE, on the way in —
 * machines can never be sized into it (Wave 2 #6: short-time minimum
 * collision drops machines to 0 first, bodyweight is never dropped).
 * "No 1-machine Tabata": a target of exactly 1 bumps to the
 * MIN_BLOCK_A_MACHINES floor if park+time allow it, else drops to 0.
 */
export function resolveMachineAllocation(params: {
  level: number;
  eligibleMachineCount: number;
  /** Total time (minutes) available for the strength portion of the session — T. */
  strengthTimeBudget: number;
  /** Seconds per Tabata round, READ from the frozen ladder (workSec + restSec). */
  secPerRound: number;
}): MachineAllocation {
  const { level, eligibleMachineCount, strengthTimeBudget, secPerRound } = params;
  const zero: MachineAllocation = { machineCount: 0, rounds: 0, machineTimeMinutes: 0 };

  const share = machineShareForLevel(level);
  if (share <= 0 || eligibleMachineCount <= 0) return zero;

  const minutesPerRound = secPerRound / 60;
  const minutesPerMachine = MIN_ROUNDS_PER_MACHINE * minutesPerRound; // the 2-round norm

  const desiredMachineTime = share * strengthTimeBudget;
  // Physical-capacity cap (#4): never more than 2 rounds/machine, ever.
  const maxMachinesByDesiredTime = Math.floor(desiredMachineTime / minutesPerMachine);
  // Guaranteed bodyweight floor (#6): machines never size into MIN_BLOCK_B_MINUTES.
  const maxMachinesByBodyweightFloor = Math.floor(
    Math.max(0, strengthTimeBudget - MIN_BLOCK_B_MINUTES) / minutesPerMachine,
  );

  let machineCount = Math.min(maxMachinesByDesiredTime, eligibleMachineCount, maxMachinesByBodyweightFloor);

  if (machineCount === 1) {
    const canFitFloor =
      eligibleMachineCount >= MIN_BLOCK_A_MACHINES &&
      maxMachinesByBodyweightFloor >= MIN_BLOCK_A_MACHINES;
    machineCount = canFitFloor ? MIN_BLOCK_A_MACHINES : 0;
  }

  if (machineCount < MIN_BLOCK_A_MACHINES) return zero;
  const rounds = machineCount * MIN_ROUNDS_PER_MACHINE;
  return { machineCount, rounds, machineTimeMinutes: rounds * minutesPerRound };
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
  // SPEC-07 redesign (17.09.2026, Finding B): `park` can be catalog-shaped
  // (no gymEquipment at all) when this is reached from a map pin click via
  // pendingParkWorkoutStart — this function guarantees its own completeness
  // instead of trusting whatever the caller passed in, same principle as
  // ParkDetailSheet/ParkPreview's self point-fetch. Falls back to the
  // passed-in `park` only if the point-fetch itself fails (offline, etc).
  const fullPark = (await getPark(park.id).catch(() => null)) ?? park;
  const parkEquipmentRefs: ParkGymEquipment[] = fullPark.gymEquipment ?? [];

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
  const secPerRound = ladderRung.workSec + ladderRung.restSec; // read from the frozen ladder — never hardcoded

  // ── Block A: real strength machines only (Wave 1) — sized from TIME, not
  // a count proxy (Wave 2). See resolveMachineAllocation/machineShareForLevel.
  const eligibleMachines = allMachines.filter((m) => isBlockAEligible(m));
  const machineShareLevel = resolveMachineShareLevel(userProfile);
  const { machineCount, rounds, machineTimeMinutes } = resolveMachineAllocation({
    level: machineShareLevel,
    eligibleMachineCount: eligibleMachines.length,
    strengthTimeBudget: availableTime,
    secPerRound,
  });
  const selectedMachines = machineCount > 0 ? selectBlockAMachines(eligibleMachines, machineCount) : [];
  const tabataConfig: TabataProtocolConfig = { workSec: ladderRung.workSec, restSec: ladderRung.restSec, rounds };
  const blockACoveredDomains = computeCoveredDomains(selectedMachines);
  const blockAExercises = selectedMachines.map((m) => buildMachinePseudoExercise(m, tabataConfig));

  // ── V: level-appropriate volume ceiling (Wave 2 #1/#2 — one shared budget,
  // no double-spend). `calculateWeeklyBudget` is the SAME sets-based ceiling
  // the rest of the engine uses for rep-based (bodyweight) volume — machine
  // tabata rounds are a different volume currency (fixed-interval, not
  // rep/set-based), so rather than force an exact unit conversion, machine
  // rounds are subtracted directly from the weekly figure before it's handed
  // to Block B as `remainingWeeklyBudget`. Block B's own SplitDecisionService
  // divides whatever's left by its own effective schedule days exactly as it
  // already does for every other caller — this composer doesn't duplicate
  // that division, just makes sure Block B isn't reasoning from the FULL,
  // untouched weekly budget as if machines hadn't already spent part of it.
  // Floor of 2 matches the `Math.max(2, ...)` floor SplitDecisionService
  // itself applies to every dailySetBudget computation.
  const weeklyVolumeBudget = calculateWeeklyBudget(machineShareLevel);
  const remainingWeeklyBudgetForBlockB = Math.max(2, weeklyVolumeBudget - rounds);

  // ── Block B: ALWAYS runs (Wave 2 #5 — the direct fix for "0 bodyweight").
  // Domain coverage (16.09.2026 follow-up — "Block B under-delivery"
  // diagnosis): Block B fills from the SESSION'S OWN scheduled program
  // domains — whatever the split engine decided for today (push, pull, or
  // combined) — never from Block A's machine coverage. This composer used to
  // force requiredDomains = ALL_DOMAINS minus whatever Block A covered (e.g.
  // ['legs','core'] when the park's machines happened to cover push/pull),
  // intended only as a soft preference. Downstream, StructureDirector's
  // single-domain strategy collapses that list to its first element and
  // PipelineOrchestrator's domain-strict filter (±3 level tolerance) enforces
  // it as a hard, exclusive gate — wiping Block B's entire pool whenever the
  // forced domain was unassessed or simply absent from the pool the composer's
  // OWN user is actually leveled in (confirmed: a push-only-assessed user with
  // push-covering machines got gated on "legs L4", where L4 was never a real
  // legs level — just the user's push level laundered through the engine's
  // max-across-domains fallback). Not passing requiredDomains here lets
  // generateHomeWorkoutTrio default it (home-workout.service.ts) to
  // resolvedChildDomains — exactly the domains its own Tier-1 pool was
  // already built from — so the pool and the strict filter always agree.
  // Machines never re-cover what Block A already has, so there's no
  // double-dipping risk either way.
  const bodyweightTimeMinutes = Math.max(MIN_BLOCK_B_MINUTES, availableTime - machineTimeMinutes);

  const trio = await generateHomeWorkoutTrio({
    userProfile,
    location: 'park',
    availableTime: bodyweightTimeMinutes,
    difficulty: DIFFICULTY_TO_LEVEL[options.difficulty],
    strictDomains: false,
    // READ-ONLY preview — this composition may run again if the user edits
    // the drawer before starting, and must never mutate the user's program
    // cycle from a preview. Same flag composeFullParkWorkout already uses
    // for the same reason.
    skipCycleRestart: true,
    // parkEquipmentIds: the park's CANONICAL gear-id inventory (resolved by
    // composeParkWorkout via resolveParkEquipmentIds — raw Firestore doc ids
    // mean nothing to the gating layer, they have to go through
    // normalizeGearId first), so InputSanitizerMiddleware resolves the
    // park's REAL gear instead of its ESSENTIAL_PARK_GEAR catastrophic-
    // fallback guess. The park's FULL gear list is safe to pass here (not a
    // Block-A-selected subset) — machines never re-cover what Block A
    // already has, so there's no double-dipping risk.
    parkEquipmentIds,
    remainingWeeklyBudget: remainingWeeklyBudgetForBlockB,
  });
  const blockBResult = trio.options[1].result;

  let blockBExercises: WorkoutExercise[] = [];
  let blockBTitle = '';
  let blockBDescription = '';
  let blockBTabataBlock: TabataBlockSpec | undefined;
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
    // Wave 2 #8 (accounting only — this file never changes WHETHER/HOW
    // core-tabata fires, only makes its minutes visible to the caller via
    // the honest estimatedDuration computed below, which prices any
    // protocolBlock==='tabata' member as a real block cost, not a guess).
    blockBTabataBlock = blockBResult.workout.tabataBlock;
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

  // Wave 2 #7 — HONEST DURATION: priced from the actual built content (same
  // pricer the rest of the engine converges duration against post the
  // duration-volume-convergence fix), never just echoed back as the
  // requested time. If T truly doesn't fit what got built (V-capped, or a
  // sparse pool), this reports the real, shorter number instead of lying.
  //
  // Correction: calculateEstimatedDuration prices ANY tabata block as a
  // fixed TABATA_BLOCK_SECONDS (240s = TABATA_CLASSIC's 20/10×8) regardless
  // of actual rounds — correct for Block B's own core-form finisher (which
  // really is TABATA_CLASSIC-shaped), but wrong for this composer's
  // machine block, whose rounds vary with machineCount. Correct the delta
  // locally rather than touch that shared pricer (used engine-wide). The
  // delta is always a whole number of minutes: every ladder rung's
  // workSec+restSec is 60s, so blockASeconds(config)/60 === config.rounds.
  const rawEstimatedDuration = calculateEstimatedDuration(exercises);
  const tabataDurationCorrectionMinutes = tabataBlock
    ? blockASeconds(tabataBlock.config) / 60 - TABATA_BLOCK_SECONDS / 60
    : 0;
  const estimatedDuration = rawEstimatedDuration + tabataDurationCorrectionMinutes;
  // Stats (display-only, see file header) priced off the same honest
  // duration, not the requested one — a truncated session shouldn't claim
  // the calorie burn of the full requested time.
  const stats = calculateWorkoutStats(exercises, DIFFICULTY_TO_LEVEL[options.difficulty], estimatedDuration);

  const workout: GeneratedWorkout = {
    title: blockBTitle || 'אימון בפארק',
    description:
      blockBDescription ||
      (blockAExercises.length > 0
        ? 'מתקנים בפארק + תרגילי משקל גוף'
        : 'אימון משקל גוף בפארק'),
    exercises,
    estimatedDuration,
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
 * Block A eligibility — REAL STRENGTH MACHINES ONLY (Wave 1 fix, 16.09.2026
 * diagnostic follow-up — .claude/knowledge, "route functional apparatus to
 * bodyweight"). Three gates, all exclusionary:
 *   - isCardio===true            → cardio lane, not this split (unchanged).
 *   - isFunctional===true        → NOT a machine. `isFunctional` distinguishes
 *     hydraulic/self-limiting real machines (false — adjustable resistance,
 *     safe at any level, per findHydraulicEquipment's own reasoning in
 *     start-hybrid-session.ts, the field's other real consumer) from
 *     non-hydraulic functional apparatus (true — pull-up bar/מתח, parallel
 *     bars/מקבילים, rings, climbing rope). Confirmed live (55-doc
 *     gym_equipment audit, 16.09.2026): every מתח/מקבילים variant is
 *     isFunctional:true. These belong on the BODYWEIGHT side (Block B,
 *     generateHomeWorkoutTrio) — confirmed they're already reachable there:
 *     dozens of real park-location exercises (pull-ups, dip holds, pike
 *     variants) gate their ExecutionMethod on these exact equipment ids, so
 *     excluding them from Block A does not remove them from the workout,
 *     only from the machine-tabata slot. Previously this field was used only
 *     as an assessed-level SAFETY gate (once assessed, fell through to
 *     eligible) — that let functional apparatus enter Block A and get
 *     stamped as tabata "machines" (confirmed: מתח/מקבילים selected at
 *     45min/6-machine/level-2). No level-assessment check is needed anymore
 *     since these items never reach Block A at all now.
 *   - movementPattern gates unchanged (isolation/flexibility not counted).
 */
export function isBlockAEligible(machine: GymEquipment): boolean {
  if (machine.isCardio === true) return false;
  if (machine.isFunctional === true) return false;
  if (machine.movementPattern == null) return false;
  const domain = MG_TO_DOMAIN[machine.movementPattern] as MovementPattern | undefined;
  if (!domain) return false; // isolation/flexibility — not counted
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
