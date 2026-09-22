/**
 * station-core-tabata — hybrid station wiring for core-block.ts's Form B
 * (22.09.2026, David-approved — field-test docs 32/33).
 *
 * Reuses core-block.ts / tabata.block.ts's `buildCoreTabataBlock` COMPLETELY
 * UNCHANGED (David's explicit requirement: "אל תשנה את חוקי הטבטה עצמם") —
 * this file only decides HOW MANY of the fixed 4-minute blocks fit in one
 * station's time budget, and calls the existing builder once per block,
 * removing each block's chosen exercises from the pool before the next call
 * (buildTabataBlock has no memory of its own across separate invocations).
 *
 * Pure — no React, no Firebase, no Date.now() (LAW 0).
 */
import type { Exercise, InjuryShieldArea, ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise, TabataBlockSpec } from '../logic/workout-generator.types';
import { buildCoreTabataBlock, chooseCoreTabataMemberCount } from '../logic/protocols/core-block';
import { TABATA_BLOCK_SECONDS } from '../logic/protocols/tabata.constants';

/**
 * Rest between consecutive tabata blocks at one station, in seconds. A
 * fixed, simple constant — deliberately separate from TABATA_CLASSIC's own
 * internal work/rest/rounds shape (20/10/8), which this file never touches.
 * Purely a station-orchestration concern: how much of the station's time
 * budget goes to recovery between blocks, not how one block itself runs.
 */
export const REST_BETWEEN_STATION_TABATA_BLOCKS_SEC = 60;

/**
 * How many fixed 4-minute tabata blocks fit in `blockMinutes` — capped at 1
 * (David, 22.09.2026, production live-testing): one core station is always
 * a single tabata block today, regardless of how much budget the station
 * has. Returns 0 when even that single block doesn't fit — the caller falls
 * back to the regular (non-tabata) core content, unchanged.
 *
 * BACKLOG (David, 22.09.2026, explicitly deferred — not this PR): 2 blocks
 * for a 45-minute session's stations, with a rest minute between them. The
 * multi-block math (REST_BETWEEN_STATION_TABATA_BLOCKS_SEC, the loop shape)
 * already existed here and is kept working underneath the cap so that
 * follow-up is a one-line change (raise the cap), not a rebuild.
 */
export function chooseStationTabataBlockCount(blockMinutes: number): number {
  const budgetSec = blockMinutes * 60;
  const blockSec = TABATA_BLOCK_SECONDS;
  const restSec = REST_BETWEEN_STATION_TABATA_BLOCKS_SEC;
  const CAP = 1; // David, 22.09.2026 — one block per station until the 45-min/2-block backlog item lands
  let n = 0;
  while (n < CAP) {
    const next = n + 1;
    const totalSec = next * blockSec + (next - 1) * restSec;
    if (totalSec > budgetSec) break;
    n = next;
  }
  return n;
}

export interface StationCoreTabataInput {
  /** Already `hiit_friendly` + `hasExplicitCoreLevel`-filtered (caller's job — see
   *  home-workout.service.ts:2842 for the canonical hiit_friendly filter and
   *  WorkoutGenerator.ts:1265 for the hasExplicitCoreLevel narrowing, both
   *  mirrored exactly at this function's call site). */
  corePool: Exercise[];
  userLevel: number;
  location?: ExecutionLocation;
  availableEquipment?: string[];
  injuryShield?: InjuryShieldArea[];
  blockCount: number;
}

export interface StationCoreTabataResult {
  exercises: WorkoutExercise[];
  /** One entry per successfully-built block, in play order. May be shorter
   *  than the requested `blockCount` if the pool ran out mid-way — never
   *  longer. Empty when even the first block couldn't be built at all. */
  blocks: TabataBlockSpec[];
}

/**
 * Build `input.blockCount` tabata blocks for one station. Member count per
 * block is chosen ONCE from the station's total time budget (reusing
 * chooseCoreTabataMemberCount exactly as the regular whole-session core
 * block does — same 2/4/8 variety bands, just applied to a station's
 * budget instead of a whole session's remaining time) and kept constant
 * across every block at this station, for a consistent feel.
 */
export function buildStationCoreTabataBlocks(
  input: StationCoreTabataInput,
  stationBudgetMinutesForMemberCount: number,
): StationCoreTabataResult {
  const exercises: WorkoutExercise[] = [];
  const blocks: TabataBlockSpec[] = [];
  let remainingPool = input.corePool;
  const memberCount = chooseCoreTabataMemberCount(stationBudgetMinutesForMemberCount);

  for (let i = 0; i < input.blockCount; i++) {
    // Explicit stop, not just "let buildTabataBlock fail": passing an EMPTY
    // pool array makes buildTabataBlock's own dispatch (tabata.block.ts:91,
    // `if (context.tabataPool?.length)`) fall through to its OTHER, no-pool
    // eligibility path — which scans `exercises` (the very accumulator this
    // loop is building) as ITS candidate source. Since block 1's members
    // already carry `hiit_friendly`, that fallback would silently re-select
    // them as a "fresh" block 2, defeating the whole point of this loop.
    // core-block.ts/tabata.block.ts are unchanged — this guard belongs here.
    if (remainingPool.length === 0) break;
    const spec = buildCoreTabataBlock(exercises, {
      memberCount,
      corePool: remainingPool,
      userLevel: input.userLevel,
      location: input.location,
      availableEquipment: input.availableEquipment,
      injuryShield: input.injuryShield,
    });
    if (!spec) break; // pool too thin for another block — keep what we have
    blocks.push(spec);
    const usedIds = new Set(spec.exerciseIds);
    remainingPool = remainingPool.filter((ex) => !usedIds.has(ex.id));
  }

  return { exercises, blocks };
}
