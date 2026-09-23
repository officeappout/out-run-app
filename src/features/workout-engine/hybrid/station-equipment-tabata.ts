/**
 * station-equipment-tabata — hybrid station wiring for REAL park-machine
 * tabata (David, 23-24.09.2026, domain-assessment gate): a route station
 * that HAS real equipment gets machine tabata regardless of domain
 * assessment — "the machine determines the range of motion, there's no
 * assumption about the body there." Reuses
 * compose-park-strength-workout.service.ts's Block A machinery COMPLETELY
 * UNCHANGED (isBlockAEligible / selectBlockAMachines / buildMachinePseudoExercise /
 * computeCoveredDomains) — all already level-agnostic BY DESIGN, per that
 * file's own isBlockAEligible comment: "No level-assessment check is needed
 * anymore since these items never reach Block A at all now."
 *
 * Deliberately does NOT reuse resolveMachineAllocation/resolveMachineShareLevel
 * — those size a machine:bodyweight TIME SPLIT for a whole session that
 * always has a bodyweight complement (Block B always runs there). This
 * module's whole reason to exist is the opposite case: there is NO
 * bodyweight complement here (the domain isn't assessed, so bodyweight
 * content for it is not offered at all — see compose-hybrid-session.service.ts's
 * domain-assessment gate) — the station is 100% machine time. A
 * share-of-what ratio doesn't apply; this file's own simple time-fit math
 * (mirroring station-core-tabata.ts's chooseStationTabataBlockCount) lives
 * here instead.
 *
 * Pure — no React, no Firebase, no Date.now() (LAW 0).
 */
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import type { WorkoutExercise } from '../logic/WorkoutGenerator';
import type { TabataBlockSpec } from '../logic/workout-generator.types';
import {
  isBlockAEligible,
  selectBlockAMachines,
  buildMachinePseudoExercise,
  computeCoveredDomains,
  TABATA_DIFFICULTY_LADDER,
  MIN_ROUNDS_PER_MACHINE,
  MIN_BLOCK_A_MACHINES,
  type ParkWorkoutDifficulty,
} from '../services/compose-park-strength-workout.service';

export interface StationEquipmentTabataInput {
  /** Real GymEquipment docs installed at this station's park — caller fetches. */
  machines: GymEquipment[];
  /** Which brand this specific park has for each machine (id → brand name). */
  brandNamesByEquipmentId?: Record<string, string>;
  /**
   * Difficulty knob — the SAME bolt (1|2|3 → easy/medium/hard, קליל/מאוזן/עוצמתי)
   * the route_stops composer already varies difficulty by
   * (composeRouteStopsWorkout's buildForBolt). This is a real, user-chosen
   * intensity preference, NOT a fabricated body level — see this file's own
   * header on why no level input exists here at all.
   */
  difficulty: ParkWorkoutDifficulty;
  /** Restrict machine selection to these domains (the station's own focus,
   *  e.g. a single-domain leg of a route) — omitted/empty = no restriction. */
  scheduledDomains?: readonly string[];
}

export interface StationEquipmentTabataResult {
  exercises: WorkoutExercise[];
  block: TabataBlockSpec | null;
  /** Domains the selected machines actually cover — for the "you'll get
   *  bodyweight for X too once assessed" nudge message. */
  coveredDomains: string[];
}

/**
 * How many of a station's eligible machines fit as ONE tabata block within
 * `stationBudgetMinutes`, at MIN_ROUNDS_PER_MACHINE (2) rounds each — capped
 * by what the park physically has. No "share" concept: unlike the
 * whole-session Block A/B split, this path has no bodyweight complement to
 * divide time with, so the entire station budget is available to machines.
 * Mirrors resolveMachineAllocation's own "no 1-machine Tabata" floor rule.
 */
export function chooseStationEquipmentMachineCount(
  stationBudgetMinutes: number,
  eligibleMachineCount: number,
  secPerRound: number,
): number {
  if (eligibleMachineCount <= 0) return 0;
  const minutesPerMachine = MIN_ROUNDS_PER_MACHINE * (secPerRound / 60);
  let machineCount = Math.min(
    Math.floor(stationBudgetMinutes / minutesPerMachine),
    eligibleMachineCount,
  );
  if (machineCount === 1) {
    machineCount = eligibleMachineCount >= MIN_BLOCK_A_MACHINES ? MIN_BLOCK_A_MACHINES : 0;
  }
  return machineCount < MIN_BLOCK_A_MACHINES ? 0 : machineCount;
}

/**
 * Build one machine-tabata block for a station, from its real, already-
 * fetched equipment. Returns `block: null` (with `exercises: []`) when the
 * station's time budget or machine count can't support even the 2-machine
 * floor — the caller falls back to the locked-card stub, same as an empty
 * bodyweight pool would.
 */
export function buildStationEquipmentTabataBlock(
  input: StationEquipmentTabataInput,
  stationBudgetMinutes: number,
): StationEquipmentTabataResult {
  const scheduledDomains = input.scheduledDomains ?? [];
  const eligible = input.machines.filter((m) => isBlockAEligible(m, scheduledDomains));
  const ladderRung = TABATA_DIFFICULTY_LADDER[input.difficulty];
  const secPerRound = ladderRung.workSec + ladderRung.restSec;

  const machineCount = chooseStationEquipmentMachineCount(stationBudgetMinutes, eligible.length, secPerRound);
  if (machineCount === 0) {
    return { exercises: [], block: null, coveredDomains: [] };
  }

  const selected = selectBlockAMachines(eligible, machineCount, scheduledDomains);
  const rounds = selected.length * MIN_ROUNDS_PER_MACHINE;
  const tabataConfig = { workSec: ladderRung.workSec, restSec: ladderRung.restSec, rounds, orderMode: 'exercise-major' as const };

  const exercises = selected.map((m) =>
    buildMachinePseudoExercise(m, tabataConfig, input.brandNamesByEquipmentId?.[m.id]),
  );

  return {
    exercises,
    block: { config: tabataConfig, exerciseIds: exercises.map((e) => e.exercise.id), kind: 'conditioning' },
    coveredDomains: computeCoveredDomains(selected),
  };
}
