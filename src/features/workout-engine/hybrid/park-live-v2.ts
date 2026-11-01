/**
 * park-live-v2 — pure helpers behind the live park workout v2 (enable_park_live_v2, canvas boards
 * Park 1-12): the walk card's numbers, the station message under the story bars, the station intro
 * (machines, muscles, how tabata works) and the station difficulty (bolts) applied to the plan.
 * Plain .ts (no React, no I/O) so the node-only vitest covers it.
 */
import type { WorkoutPlan, WorkoutSegment, Exercise } from '@/features/parks/core/types/route.types';
import type { TabataProtocolConfig } from '../core/types/protocol.types';
import { TABATA_DIFFICULTY_LADDER } from '../services/compose-park-strength-workout.service';
import type { ParkWorkoutDifficulty } from '../services/compose-park-strength-workout.service';
import type { SequencerView } from '../engines/hybrid/sequencer.selectors';

export type StationDifficulty = ParkWorkoutDifficulty;
export const STATION_DIFFICULTIES: readonly StationDifficulty[] = ['easy', 'medium', 'hard'];
/** Pilot M11: the intro's fallback when the plan carries no machine tabata to read a level from. */
export const DEFAULT_STATION_DIFFICULTY: StationDifficulty = 'easy';
/** The station message row shows "a station is coming" from this distance (M2). */
export const STATION_MESSAGE_M = 300;

/** A machine-tabata block: work + rest = one ladder rung (60 s), never the 20/10 core tabata. */
export function isMachineTabataSegment(seg: WorkoutSegment | null | undefined): boolean {
  return !!seg && isMachineTabata(seg);
}

function isMachineTabata(seg: WorkoutSegment): seg is WorkoutSegment & { protocolConfig: TabataProtocolConfig } {
  if (seg.protocol !== 'tabata' || !seg.protocolConfig) return false;
  const c = seg.protocolConfig as TabataProtocolConfig;
  const rung = TABATA_DIFFICULTY_LADDER.easy;
  return c.workSec + c.restSec === rung.workSec + rung.restSec;
}

/** The difficulty a plan's machine tabata was composed at, or null (no machine tabata). */
export function planStationDifficulty(plan: WorkoutPlan | null | undefined): StationDifficulty | null {
  const seg = plan?.segments?.find(isMachineTabata);
  if (!seg) return null;
  const c = seg.protocolConfig as TabataProtocolConfig;
  return STATION_DIFFICULTIES.find((d) => TABATA_DIFFICULTY_LADDER[d].workSec === c.workSec) ?? null;
}

/**
 * The station plan at another difficulty: every machine-tabata block gets the ladder's work / rest
 * (the rounds and the station length stay the same: each round is still 60 s). Other segments
 * (core tabata, straight sets, warm-up) are returned as they are. Same plan back when nothing changes.
 */
export function applyStationDifficulty(plan: WorkoutPlan, difficulty: StationDifficulty): WorkoutPlan {
  const rung = TABATA_DIFFICULTY_LADDER[difficulty];
  let changed = false;
  const segments = plan.segments.map((seg) => {
    if (!isMachineTabata(seg)) return seg;
    const c = seg.protocolConfig;
    if (c.workSec === rung.workSec && c.restSec === rung.restSec) return seg;
    changed = true;
    const config: TabataProtocolConfig = { ...c, workSec: rung.workSec, restSec: rung.restSec };
    const exercises = (seg.exercises ?? []).map((ex) => retimeExercise(ex, c.workSec, rung));
    return { ...seg, protocolConfig: config, target: { ...seg.target, value: rung.workSec * c.rounds }, exercises };
  });
  return changed ? { ...plan, segments } : plan;
}

/**
 * The plan the station runs. `chosen` is null until the user picks a level on the station intro, and
 * then the plan stays as composed (the bolts picked before the workout). Quick mode never shows the
 * intro, so it always runs the composed level.
 */
export function stationRunPlan(plan: WorkoutPlan | null, chosen: StationDifficulty | null): WorkoutPlan | null {
  return plan && chosen ? applyStationDifficulty(plan, chosen) : plan;
}

/** The level the intro shows selected: the user's pick, else the composed level, else the default. */
export function stationIntroDifficulty(plan: WorkoutPlan | null | undefined, chosen: StationDifficulty | null): StationDifficulty {
  return chosen ?? planStationDifficulty(plan) ?? DEFAULT_STATION_DIFFICULTY;
}

function retimeExercise(ex: Exercise, oldWorkSec: number, rung: { workSec: number; restSec: number }): Exercise {
  const e = ex as Exercise & { restSeconds?: number; duration?: unknown };
  const next: Exercise & { restSeconds?: number; duration?: unknown } = { ...e };
  if (typeof e.restSeconds === 'number') next.restSeconds = rung.restSec;
  if (typeof e.duration === 'string') next.duration = e.duration.replace(String(oldWorkSec), String(rung.workSec));
  return next;
}

export interface StationMachine {
  id: string;
  name: string;
  imageUrl: string | null;
  muscles: string[];
}

export interface StationIntroView {
  machines: StationMachine[];
  /** Every muscle the station works, first-seen order, no repeats. */
  muscles: string[];
  /** Rounds on each machine (machine tabata: 2). */
  roundsPerMachine: number;
  workSec: number;
  restSec: number;
  /** The whole station in whole minutes (≥1). */
  totalMin: number;
}

/** The intro's content, or null when the station has no machine tabata (the old welcome screen stays). */
export function stationIntroView(plan: WorkoutPlan | null | undefined): StationIntroView | null {
  const blocks = (plan?.segments ?? []).filter(isMachineTabata);
  if (blocks.length === 0) return null;
  const machines: StationMachine[] = [];
  const muscles: string[] = [];
  let totalSec = 0;
  let rounds = 0;
  for (const seg of blocks) {
    const c = seg.protocolConfig;
    const list = seg.exercises ?? [];
    totalSec += (c.workSec + c.restSec) * c.rounds;
    if (list.length > 0) rounds = Math.max(rounds, Math.round(c.rounds / list.length));
    for (const ex of list) {
      const m = (ex.muscleGroups ?? []).filter((x): x is string => typeof x === 'string' && x.length > 0);
      machines.push({ id: ex.id, name: ex.name, imageUrl: ex.imageUrl || null, muscles: m });
      for (const x of m) if (!muscles.includes(x)) muscles.push(x);
    }
  }
  const c = blocks[0].protocolConfig;
  return {
    machines,
    muscles,
    roundsPerMachine: Math.max(1, rounds),
    workSec: c.workSec,
    restSec: c.restSec,
    totalMin: Math.max(1, Math.round(totalSec / 60)),
  };
}

/** Walk card numbers (board Park 1, pilot M22): time, distance, distance to the station. No pace. */
export interface WalkCardView {
  elapsedSec: number;
  km: number;
  /** Real (GPS) distance to the station, else what's left of the leg, else null (no station ahead). */
  toStationM: number | null;
}

export function walkCardView(view: SequencerView | null): WalkCardView | null {
  if (!view?.leg) return null;
  const toStationM = view.canArriveManually
    ? view.distanceToStationM ?? (view.leg.remainingM != null && view.leg.remainingM > 0 ? view.leg.remainingM : null)
    : null;
  return { elapsedSec: view.leg.elapsedSec, km: view.leg.coveredM / 1000, toStationM };
}

/**
 * Which unified leg drawer a hybrid view gets (enable_unified_player_v1): 'walk' / 'run' on a leg
 * with progress (run / cool-down), null otherwise (idle keeps today's run card, transition and
 * station have their own screens).
 */
export function unifiedLegSheet(view: SequencerView | null): 'walk' | 'run' | null {
  if (!view?.leg || (view.phase !== 'run' && view.phase !== 'cooldown')) return null;
  return isWalkingLeg(view) ? 'walk' : 'run';
}

/**
 * The unified leg drawer's overview cells (enable_unified_player_v1, ParkWalkSheet): a walk = time ·
 * km · to the station; a run adds the live pace after km, except on a leg planned under 400 m (owner
 * rule, `leg.showPace`). "To the station" only while a station is ahead.
 */
export type LegSheetCell = 'time' | 'km' | 'pace' | 'toStation';

export function legSheetCells(view: SequencerView | null, running: boolean): LegSheetCell[] {
  const card = walkCardView(view);
  if (!card) return [];
  const cells: LegSheetCell[] = ['time', 'km'];
  if (running && view?.leg?.showPace) cells.push('pace');
  if (card.toStationM != null) cells.push('toStation');
  return cells;
}

/** The station message (M2) once the walker is near: distance in metres, or null (no message). */
export function stationMessageM(view: SequencerView | null): number | null {
  if (!view || (view.phase !== 'run' && view.phase !== 'cooldown') || !view.canArriveManually) return null;
  const d = view.distanceToStationM ?? view.leg?.remainingM ?? null;
  if (d == null || !Number.isFinite(d) || d > STATION_MESSAGE_M) return null;
  return Math.max(0, Math.round(d / 10) * 10);
}

/** A walking leg? (The walk card replaces the run card only for walking; running keeps its pace.) */
export function isWalkingLeg(view: SequencerView | null): boolean {
  return view?.segment?.kind === 'aerobic' && view.segment.aerobicType === 'walking';
}

/**
 * Rest between intervals (board Park 9, pilot M19): the index of the NEXT machine when the next
 * interval is a different machine than the current one, else null (round 2 on the same machine,
 * or nothing next). Matched by name after the current position (exercise-major order).
 */
export function nextMachineIndex(names: readonly string[], currentIdx: number, nextName: string | null): number | null {
  if (!nextName || names[currentIdx] === nextName) return null;
  for (let i = currentIdx + 1; i < names.length; i += 1) if (names[i] === nextName) return i;
  const first = names.indexOf(nextName);
  return first >= 0 && first !== currentIdx ? first : null;
}

/**
 * The message row's one message (board Park 2, pilot M2): a turn under 50 m wins (shown wide), then
 * "a station is coming", then the next turn (compact). Null = no row.
 */
export type MessageRowKind = 'turnWide' | 'station' | 'turn';

export function messageRowKind(turn: { imminent: boolean } | null | undefined, stationM: number | null): MessageRowKind | null {
  if (turn?.imminent) return 'turnWide';
  if (stationM != null) return 'station';
  return turn ? 'turn' : null;
}
