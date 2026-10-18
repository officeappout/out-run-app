/**
 * summary-v2.mapping — pure projection of the strength summary's data
 * (phase-summary ExerciseSummary, or a hybrid station's saved exerciseLog)
 * into the shared v2 summary components' props (ExerciseSetsTable rows,
 * ImprovementCard items, the hero's per-set strip). No React, no Firebase.
 * Nothing is invented: unknown targets print no target, missing previous
 * data yields no improvement item.
 */
import type { ExerciseSetsRow, ImprovementItem, SetTile, SetTone } from '@/components/ui/v2';
import { formatWorkSeconds, type ExerciseSummary, type PhaseSummary, type SetMark, type SetUnit } from './phase-summary';

const MARK_TONE: Record<SetMark, SetTone> = { full: 'in', partial: 'below', missed: 'missed' };

export function formatSetValue(v: number, unit: SetUnit): string {
  return unit === 'seconds' ? formatWorkSeconds(v) : String(v);
}

function unitWord(unit: SetUnit): string {
  return unit === 'seconds' ? 'שנ׳' : unit === 'reps' ? 'חזרות' : '';
}

/** One tile per set; an exercise with no set rows at all gets one "not done" tile. */
export function setTiles(ex: ExerciseSummary): SetTile[] {
  if (ex.sets.length === 0) return [{ value: '–', tone: 'missed' }];
  return ex.sets.map((s) => ({
    value: s.done !== null && s.done > 0 ? formatSetValue(s.done, ex.unit) : '–',
    tone: MARK_TONE[s.mark],
  }));
}

function rangeLabel(min: number, max: number, unit: SetUnit): string {
  const body = min === max ? `${min}` : `${min}–${max}`;
  const w = unitWord(unit);
  return `יעד ${body}${w ? ` ${w}` : ''}`;
}

/** "יעד 8 חזרות" / "יעד 6–8 חזרות" / "יעד 30 שנ׳" / "לא בוצע" / "3 סטים". */
export function targetLabel(ex: ExerciseSummary): string {
  if (ex.status === 'skipped') return 'לא בוצע';
  const targets = ex.sets.map((s) => s.target).filter((t): t is number => t !== null && t > 0);
  if (targets.length > 0) return rangeLabel(Math.min(...targets), Math.max(...targets), ex.unit);
  return `${ex.doneSets} ${ex.doneSets === 1 ? 'סט' : 'סטים'}`;
}

export function exerciseRows(exercises: ExerciseSummary[]): ExerciseSetsRow[] {
  return exercises.map((ex) => ({
    key: ex.key,
    name: ex.name,
    ...(ex.imageUrl ? { imageUrl: ex.imageUrl } : {}),
    subtitle: targetLabel(ex),
    tiles: setTiles(ex),
    muted: ex.status === 'skipped',
  }));
}

/** Per-exercise tile groups for the hero's "17/18 סטים" strip (planned sets only). */
export function heroSetGroups(phases: PhaseSummary[]): SetTile[][] {
  return phases
    .flatMap((p) => p.blocks.flatMap((b) => b.exercises))
    .filter((ex) => ex.sets.length > 0)
    .map((ex) => ex.sets.map((s) => ({ value: '', tone: MARK_TONE[s.mark] })));
}

/** Improved exercises vs the previous session (best set), for ImprovementCard. */
export function improvementItems(phases: PhaseSummary[]): ImprovementItem[] {
  return phases
    .flatMap((p) => p.blocks.flatMap((b) => b.exercises))
    .filter((e) => e.improvedBy !== null && e.best !== null && e.previousBest !== null)
    .map((e) => ({
      key: e.key,
      name: e.name,
      ...(e.imageUrl ? { imageUrl: e.imageUrl } : {}),
      previous: formatSetValue(e.previousBest as number, e.unit),
      today: formatSetValue(e.best as number, e.unit),
      delta: e.improvedBy as number,
      unit: e.unit,
    }));
}

// ── Hybrid strength station (saved SegmentExerciseDetail[]) ─────────────────

/** Structural subset of storage.service's SegmentExerciseDetail. */
export interface StationExerciseLike {
  exerciseId: string;
  exerciseName: string;
  confirmedReps: number[];
  targetReps: number;
  prescribedRange?: { min: number; max: number };
  repsSource?: string[];
}

/**
 * Rows for a hybrid station's exercise log. In-target = the set reached the
 * prescribed range's minimum (or targetReps when no range was saved).
 * A set measured by the timer marks the exercise as timed (seconds).
 */
export function stationRows(log: StationExerciseLike[]): ExerciseSetsRow[] {
  return log.map((e, i) => {
    const unit: SetUnit = e.repsSource?.includes('timer') ? 'seconds' : 'reps';
    const min = e.prescribedRange && e.prescribedRange.min > 0 ? e.prescribedRange.min : null;
    const target = min ?? (e.targetReps > 0 ? e.targetReps : null);
    const reps = Array.isArray(e.confirmedReps) ? e.confirmedReps : [];
    const tiles: SetTile[] =
      reps.length > 0
        ? reps.map((v) => {
            const tone: SetTone = !v || v <= 0 ? 'missed' : target === null || v >= target ? 'in' : 'below';
            return { value: v > 0 ? formatSetValue(v, unit) : '–', tone };
          })
        : [{ value: '–', tone: 'missed' }];
    const done = reps.filter((v) => v > 0).length;
    const subtitle =
      done === 0
        ? 'לא בוצע'
        : e.prescribedRange && e.prescribedRange.max > 0
          ? rangeLabel(e.prescribedRange.min, e.prescribedRange.max, unit)
          : target !== null
            ? rangeLabel(target, target, unit)
            : `${done} ${done === 1 ? 'סט' : 'סטים'}`;
    return {
      key: `${e.exerciseId}-${i}`,
      name: e.exerciseName,
      subtitle,
      tiles,
      muted: done === 0,
    };
  });
}
