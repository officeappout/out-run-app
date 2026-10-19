/**
 * timed-spec — a plan segment → the timed engine's spec, or null when the
 * segment is not a valid block-scoped protocol (then the existing
 * exercise-scoped player runs it, exactly as today).
 *
 * "Mixed" workouts (board A-5: classic sections + an AMRAP finisher) need
 * nothing special: each segment is dispatched on its own `protocol`, the
 * classic ones stay with the strength player, the finisher goes here.
 * Validation mirrors resolveBlockProtocol (players/strength/protocols): bad
 * plan data never crashes a workout, it falls back.
 */
import type { WorkoutSegment, Exercise } from '@/features/parks/core/types/route.types';
import type {
  AmrapProtocolConfig,
  EmomProtocolConfig,
  RoundItem,
  TabataProtocolConfig,
} from '../../core/types/protocol.types';
import type { TimedBlockSpec, TimedItem } from './timed.types';

const pos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function parseReps(text: string | undefined): number | undefined {
  const n = text ? parseInt(text, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** A plan exercise as a timed item (reps / hold parsed from the plan strings). */
export function itemFromExercise(ex: Exercise): TimedItem {
  const isTime = ex.exerciseType === 'time';
  return {
    kind: 'exercise',
    key: ex.id,
    exerciseId: ex.id,
    name: ex.name,
    ...(ex.imageUrl ? { imageUrl: ex.imageUrl } : {}),
    ...(isTime ? { targetHoldSec: parseReps(ex.duration ?? ex.reps) } : { targetReps: parseReps(ex.reps) }),
    ...(ex.symmetry === 'unilateral' ? { isUnilateral: true } : {}),
  };
}

/** Run label, e.g. "ריצה 300 מ׳" / "ריצה 2 דק׳". */
export function runLabel(spec: { distanceM?: number; durationSec?: number; label?: string }): string {
  if (spec.label) return spec.label;
  if (pos(spec.distanceM)) return `ריצה ${spec.distanceM} מ׳`;
  if (pos(spec.durationSec)) return `ריצה ${Math.round(spec.durationSec / 60)} דק׳`;
  return 'ריצה';
}

/** Round items (exercise / aerobic leg) → timed items, names from the plan exercises. */
export function itemsFromRoundItems(roundItems: readonly RoundItem[], exercises: readonly Exercise[]): TimedItem[] {
  let runN = 0;
  return roundItems.map((ri) => {
    if (ri.kind === 'aerobic_leg') {
      runN += 1;
      return {
        kind: 'aerobic_leg',
        key: `run-${runN}`,
        name: runLabel(ri),
        ...(pos(ri.distanceM) ? { distanceM: ri.distanceM } : {}),
        ...(pos(ri.durationSec) ? { durationSec: ri.durationSec } : {}),
      };
    }
    const ex = exercises.find((e) => e.id === ri.exerciseId);
    const base: TimedItem = ex ? itemFromExercise(ex) : { kind: 'exercise', key: ri.exerciseId, exerciseId: ri.exerciseId, name: ri.exerciseId };
    return {
      ...base,
      ...(pos(ri.targetReps) ? { targetReps: ri.targetReps } : {}),
      ...(pos(ri.targetHoldSec) ? { targetHoldSec: ri.targetHoldSec } : {}),
    };
  });
}

export function timedSpecFromSegment(segment: WorkoutSegment | null | undefined): TimedBlockSpec | null {
  if (!segment?.protocol) return null;
  const exercises = segment.exercises ?? [];
  const cfg = segment.protocolConfig as unknown as Record<string, unknown> | undefined;
  if (!cfg) return null;
  switch (segment.protocol) {
    case 'tabata': {
      const c = cfg as unknown as TabataProtocolConfig;
      if (!pos(c.workSec) || !(typeof c.restSec === 'number' && c.restSec >= 0) || !pos(c.rounds)) return null;
      return { format: 'tabata', config: c, items: exercises.map(itemFromExercise) };
    }
    case 'emom': {
      const c = cfg as unknown as EmomProtocolConfig;
      if (!pos(c.intervalSec) || !pos(c.totalIntervals)) return null;
      const items = c.targets && c.targets.length > 0 ? itemsFromRoundItems(c.targets, exercises) : exercises.map(itemFromExercise);
      return items.length > 0 ? { format: 'emom', config: c, items } : null;
    }
    case 'amrap': {
      const c = cfg as unknown as AmrapProtocolConfig;
      if (!pos(c.capSec)) return null;
      const items = c.roundItems && c.roundItems.length > 0 ? itemsFromRoundItems(c.roundItems, exercises) : exercises.map(itemFromExercise);
      return items.length > 0 ? { format: 'amrap', config: c, items } : null;
    }
    default:
      return null;
  }
}
